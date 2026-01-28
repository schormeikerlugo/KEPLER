
import * as ort from 'onnxruntime-web';

// Worker State
let session = null;
let inputSize = 640; // Reverted to 640 because model is hardcoded
let confThreshold = 0.25;
let iouThreshold = 0.45;
let classNames = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
    'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
    'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
    'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

// Handle Messages
self.onmessage = async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'INIT':
            console.log("Worker: INIT command received", data);
            await initModel(data.modelPath, data.wasmPath, data.numThreads, data.executionProviders);
            break;
        case 'DETECT':
            if (!session) {
                console.warn("Worker: DETECT received but session is null");
                return;
            }
            await runInference(data.pixelData);
            break;
    }
};

async function initModel(modelPath, wasmPath, numThreads, executionProviders = ['wasm']) {
    try {
        console.log(`Worker: Config WASM Path: ${wasmPath}, Threads: ${numThreads}, Providers: ${executionProviders}`);

        // Configure WASM paths regardless of provider (as backup or main)
        ort.env.wasm.wasmPaths = wasmPath;
        ort.env.wasm.numThreads = numThreads || 2;

        const options = {
            executionProviders: executionProviders,
            graphOptimizationLevel: 'all'
        };

        session = await ort.InferenceSession.create(modelPath, options);
        self.postMessage({ type: 'INIT_SUCCESS' });
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: err.message });
    }
}

async function runInference(pixelData) {
    try {
        // PixelData is RGBA (416x416) from OffscreenCanvas or Main Thread
        // Convert to Float32 Tensor [1, 3, 416, 416]
        const float32Data = preProcess(pixelData);

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize]);
        const feeds = { images: tensor };

        // console.log("Worker: Running Session...");
        const results = await session.run(feeds);
        const output = results[session.outputNames[0]];

        const predictions = postProcess(output);

        self.postMessage({ type: 'RESULT', predictions });

    } catch (err) {
        console.error("Worker: Inference Failed", err);
        self.postMessage({ type: 'ERROR', error: err.message });
    }
}

function preProcess(pixelData) {
    const float32Data = new Float32Array(3 * inputSize * inputSize);
    // pixelData is Uint8ClampedArray [R, G, B, A, R, G, B, A...]

    for (let i = 0; i < inputSize * inputSize; i++) {
        // Normalization 0-1
        float32Data[i] = pixelData[i * 4] / 255.0; // R
        float32Data[i + inputSize * inputSize] = pixelData[i * 4 + 1] / 255.0; // G
        float32Data[i + 2 * inputSize * inputSize] = pixelData[i * 4 + 2] / 255.0; // B
    }
    return float32Data;
}

function postProcess(output) {
    const data = output.data;
    const shape = output.dims; // [1, 84, 8400]
    const numDetections = shape[2];
    const numClasses = shape[1] - 4;

    const boxes = [];

    for (let i = 0; i < numDetections; i++) {
        const cx = data[i];
        const cy = data[i + numDetections];
        const w = data[i + 2 * numDetections];
        const h = data[i + 3 * numDetections];

        let maxScore = 0;
        let maxClass = 0;

        for (let j = 0; j < numClasses; j++) {
            const score = data[i + (j + 4) * numDetections];
            if (score > maxScore) {
                maxScore = score;
                maxClass = j;
            }
        }

        if (maxScore > confThreshold) {
            boxes.push({
                class: classNames[maxClass],
                score: maxScore,
                bbox: [cx, cy, w, h] // Center format [cx, cy, w, h]
            });
        }
    }

    return nms(boxes);
}

function nms(boxes) {
    boxes.sort((a, b) => b.score - a.score);
    const selected = [];
    const active = new Array(boxes.length).fill(true);

    for (let i = 0; i < boxes.length; i++) {
        if (!active[i]) continue;

        // Convert center to corner for output (Normalized 0-1 or Pixel?)
        // The output of YOLO is relative to inputSize (416).
        // converting here to simpler [x,y,w,h]
        const b = boxes[i];
        const x = b.bbox[0] - b.bbox[2] / 2;
        const y = b.bbox[1] - b.bbox[3] / 2;

        selected.push({
            class: b.class,
            score: b.score,
            bbox: [x, y, b.bbox[2], b.bbox[3]]
        });

        for (let j = i + 1; j < boxes.length; j++) {
            if (!active[j]) continue;
            if (iou(boxes[i].bbox, boxes[j].bbox) > iouThreshold) {
                active[j] = false;
            }
        }
    }
    return selected;
}

function iou(boxA, boxB) {
    // box is [cx, cy, w, h]
    // convert to [x1, y1, x2, y2]
    const x1 = boxA[0] - boxA[2] / 2;
    const y1 = boxA[1] - boxA[3] / 2;
    const x2 = boxA[0] + boxA[2] / 2;
    const y2 = boxA[1] + boxA[3] / 2;

    const x3 = boxB[0] - boxB[2] / 2;
    const y3 = boxB[1] - boxB[3] / 2;
    const x4 = boxB[0] + boxB[2] / 2;
    const y4 = boxB[1] + boxB[3] / 2;

    const xA = Math.max(x1, x3);
    const yA = Math.max(y1, y3);
    const xB = Math.min(x2, x4);
    const yB = Math.min(y2, y4);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = boxA[2] * boxA[3];
    const boxBArea = boxB[2] * boxB[3];

    return interArea / (boxAArea + boxBArea - interArea);
}
