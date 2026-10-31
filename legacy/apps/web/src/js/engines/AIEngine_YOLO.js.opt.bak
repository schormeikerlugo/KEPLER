// AIEngine.js - YOLOv8 Implementation using Web Workers
import YoloWorker from '../workers/yolo.worker.js?worker'; // Vite Worker Import
import { ObjectTracker } from '../utils/ObjectTracker.js';

export class AIEngine {
    constructor() {
        this.worker = null;
        this.videoElement = null;
        this.predictions = [];
        this.tracker = new ObjectTracker(); // Specialized Tracker
        this.onDetectionUpdate = null;
        this.onStatusUpdate = null;

        this.isProcessing = false;
        this.isLoaded = false;
        this.isPaused = false; // New Pause State

        // Config - Optimized for Mobile
        this.inputSize = 640; // Reverted to 640 (Model Requirement)
        this.inferenceInterval = 150; // ~6 FPS target
        this.lastInferenceTime = 0;

        // Offscreen canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.inputSize;
        this.canvas.height = this.inputSize;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    async init(videoElement) {
        this.videoElement = videoElement;

        try {
            console.log("AI: Initializing YOLO Worker...");

            // Check if worker was preloaded by loading screen
            if (window.__keplerYoloWorker && window.__keplerModelReady) {
                console.log("AI: Reusing preloaded YOLO worker! 🚀");
                this.worker = window.__keplerYoloWorker;
                this.isLoaded = true;

                // Rebind message handler for this instance
                this.worker.onmessage = (e) => {
                    const { type, predictions, error } = e.data;
                    if (type === 'RESULT') {
                        this.handlePredictions(predictions);
                        this.isProcessing = false;
                    } else if (type === 'ERROR') {
                        console.error("AI Worker Error:", error);
                        if (this.onStatusUpdate) this.onStatusUpdate("Error de Visión: " + error);
                        this.isProcessing = false;
                    }
                };

                // Notify immediately
                if (this.onStatusUpdate) this.onStatusUpdate("Sistema de Visión Activo 👁️ (Pre-cargado)");
                this.startDetection();
                return;
            }

            // No preloaded worker, create new one
            console.log("AI: No preloaded worker found, creating new...");
            this.worker = new YoloWorker();

            // Handle Worker Messages
            this.worker.onmessage = (e) => {
                const { type, predictions, error } = e.data;

                if (type === 'INIT_SUCCESS') {
                    this.isLoaded = true;
                    // Notification via Toast
                    if (this.onStatusUpdate) this.onStatusUpdate("Sistema de Visión Activo 👁️");
                    this.startDetection();
                } else if (type === 'RESULT') {
                    this.handlePredictions(predictions);
                    this.isProcessing = false;
                } else if (type === 'ERROR') {
                    console.error("AI Worker Error:", error);
                    // Only alert on critical failures if needed, or just log
                    if (this.onStatusUpdate) this.onStatusUpdate("Error de Visión: " + error);
                    this.isProcessing = false;
                }
            };

            // Configure Paths
            const isDev = import.meta.env.DEV; // Vite env
            const wasmPath = isDev ? '/node_modules/onnxruntime-web/dist/' : '/wasm/';

            // Check WebGPU Support
            const useWebGPU = await this.checkWebGPUSupport();
            const executionProviders = useWebGPU ? ['webgpu', 'wasm'] : ['wasm'];

            if (useWebGPU && this.onStatusUpdate) {
                this.onStatusUpdate("🚀 Aceleración WebGPU Activa");
            }

            // Send INIT to Worker
            this.worker.postMessage({
                type: 'INIT',
                data: {
                    modelPath: '/models/yolo11n.onnx',
                    wasmPath: wasmPath,
                    numThreads: navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2,
                    inputSize: 640,
                    executionProviders: executionProviders
                }
            });

        } catch (error) {
            console.error('AI: Failed to init worker:', error);
        }
    }

    async checkWebGPUSupport() {
        if (!navigator.gpu) return false;
        try {
            const adapter = await navigator.gpu.requestAdapter();
            return !!adapter;
        } catch (e) {
            return false;
        }
    }

    startDetection() {
        const loop = (timestamp) => {
            if (this.isLoaded && this.videoElement && this.videoElement.readyState === 4) {
                // 1. Inference (If not paused)
                if (!this.isPaused && !this.isProcessing && (timestamp - this.lastInferenceTime > this.inferenceInterval)) {
                    this.detect(timestamp);
                }

                // 2. Smooth & Publish (Always run to clear old boxes smoothly)
                // If paused, maybe we want boxes to fade out? 
                // For now, let's keep smoothing what we have or clear?
                if (!this.isPaused) {
                    this.predictions = this.tracker.getSmoothedObjects();

                    if (this.onDetectionUpdate) {
                        const target = this.findCentralTarget(this.predictions);
                        this.onDetectionUpdate({ predictions: this.predictions, target });
                    }
                } else {
                    // If paused, send empty updates to clear UI
                    if (this.onDetectionUpdate) this.onDetectionUpdate({ predictions: [], target: null });
                }
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    detect(timestamp) {
        this.isProcessing = true;
        this.lastInferenceTime = timestamp;

        this.ctx.drawImage(this.videoElement, 0, 0, this.inputSize, this.inputSize);
        const imageData = this.ctx.getImageData(0, 0, this.inputSize, this.inputSize);

        this.worker.postMessage({
            type: 'DETECT',
            data: { pixelData: imageData.data }
        }, [imageData.data.buffer]);
    }

    handlePredictions(rawPredictions) {
        if (!rawPredictions || !this.videoElement) return;

        // Scale predictions back to Video Dimensions
        const videoW = this.videoElement.videoWidth;
        const videoH = this.videoElement.videoHeight;
        const scaleX = videoW / this.inputSize;
        const scaleY = videoH / this.inputSize;

        const newDetections = rawPredictions.map(p => ({
            class: p.class,
            score: p.score,
            bbox: [
                p.bbox[0] * scaleX,
                p.bbox[1] * scaleY,
                p.bbox[2] * scaleX,
                p.bbox[3] * scaleY
            ],
            distance: this.estimateDepth(p.bbox[3] * scaleY)
        }));

        // Update Tracker Logic
        this.tracker.update(newDetections);
    }

    // ... findCentralTarget and estimateDepth remain distinct helper methods ...
    findCentralTarget(predictions) {
        if (!predictions || predictions.length === 0) return null;

        const videoW = this.videoElement.videoWidth;
        const videoH = this.videoElement.videoHeight;
        const centerX = videoW / 2;
        const centerY = videoH / 2;

        let best = null;
        let minDist = Infinity;

        for (const pred of predictions) {
            const [x, y, w, h] = pred.bbox;
            const boxCenterX = x + w / 2;
            const boxCenterY = y + h / 2;

            const dist = Math.sqrt(Math.pow(boxCenterX - centerX, 2) + Math.pow(boxCenterY - centerY, 2));
            if (dist < minDist) {
                minDist = dist;
                best = pred;
            }
        }
        return best;
    }

    estimateDepth(heightPx) {
        const videoH = this.videoElement.videoHeight;
        const hNorm = heightPx / videoH;
        let dist = 0.5 / hNorm;
        return Math.max(0.5, Math.min(dist, 30));
    }

    setPaused(bool) {
        this.isPaused = bool;
        if (bool) {
            // Clear tracker state so boxes don't get stuck
            // this.tracker = new ObjectTracker(); // Optional reset
        }
    }

    stop() {
        if (this.worker) this.worker.terminate();
    }
}
