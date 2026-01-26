"""
Backend YOLO Inference Endpoint
Processes images server-side for devices with limited resources
"""

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
import numpy as np
from PIL import Image
import io
import os

router = APIRouter()

# YOLO model instance (lazy loaded)
_model = None
_model_path = None

def get_model():
    """Lazy load YOLO model using ONNX Runtime"""
    global _model, _model_path
    
    if _model is not None:
        return _model
    
    try:
        import onnxruntime as ort
        print("[Inference] onnxruntime imported successfully")
    except ImportError as e:
        print(f"[Inference] ERROR: onnxruntime not installed! Run: pip install onnxruntime")
        print(f"[Inference] Import error: {e}")
        return None
    
    try:
        # Find model path - __file__ is in backend/app/api/endpoints/inference.py
        # Go up 3 levels: endpoints -> api -> app -> backend, then into models/
        current_file = os.path.abspath(__file__)
        endpoints_dir = os.path.dirname(current_file)  # endpoints/
        api_dir = os.path.dirname(endpoints_dir)        # api/
        app_dir = os.path.dirname(api_dir)              # app/
        backend_dir = os.path.dirname(app_dir)          # backend/
        local_model_path = os.path.join(backend_dir, "models", "yolo11n.onnx")
        
        print(f"[Inference] __file__ = {current_file}")
        print(f"[Inference] backend_dir = {backend_dir}")
        print(f"[Inference] local_model_path = {local_model_path}")
        print(f"[Inference] exists? = {os.path.exists(local_model_path)}")
        
        model_paths = [
            local_model_path,  # Local: backend/models/yolo11n.onnx
            "/app/models/yolo11n.onnx",  # Docker
            os.path.join(os.getcwd(), "models", "yolo11n.onnx"),  # CWD/models
        ]
        
        for path in model_paths:
            print(f"[Inference] Checking: {path} -> exists={os.path.exists(path)}")
            if os.path.exists(path):
                _model_path = path
                break
        
        if not _model_path:
            print("[Inference] YOLO model not found in any location. Backend detection disabled.")
            return None
        
        print(f"[Inference] Loading YOLO model from {_model_path}")
        _model = ort.InferenceSession(_model_path, providers=['CPUExecutionProvider'])
        print("[Inference] YOLO model loaded successfully")
        return _model
        
    except Exception as e:
        print(f"[Inference] Failed to load YOLO model: {e}")
        import traceback
        traceback.print_exc()
        return None
# COCO class names
CLASS_NAMES = [
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
]

def preprocess_image(image: Image.Image, input_size: int = 640) -> np.ndarray:
    """Preprocess image for YOLO inference"""
    # Resize to input size
    image = image.resize((input_size, input_size))
    
    # Convert to numpy array and normalize
    img_array = np.array(image).astype(np.float32) / 255.0
    
    # Handle grayscale
    if len(img_array.shape) == 2:
        img_array = np.stack([img_array] * 3, axis=-1)
    elif img_array.shape[2] == 4:  # RGBA
        img_array = img_array[:, :, :3]
    
    # Transpose to CHW format
    img_array = np.transpose(img_array, (2, 0, 1))
    
    # Add batch dimension
    img_array = np.expand_dims(img_array, axis=0)
    
    return img_array

def postprocess_output(output: np.ndarray, conf_threshold: float = 0.25) -> List[Dict[str, Any]]:
    """Post-process YOLO output to get detections"""
    # Output shape: [1, 84, 8400]
    data = output[0]
    num_detections = data.shape[1]
    
    predictions = []
    
    for i in range(num_detections):
        cx = data[0, i]
        cy = data[1, i]
        w = data[2, i]
        h = data[3, i]
        
        # Get class scores (indices 4-83)
        class_scores = data[4:, i]
        max_score = float(np.max(class_scores))
        max_class = int(np.argmax(class_scores))
        
        if max_score > conf_threshold:
            # Convert center to corner format
            x = cx - w / 2
            y = cy - h / 2
            
            predictions.append({
                "class": CLASS_NAMES[max_class] if max_class < len(CLASS_NAMES) else "unknown",
                "score": round(max_score, 3),
                "bbox": [float(x), float(y), float(w), float(h)]
            })
    
    # Apply NMS (simplified)
    predictions = sorted(predictions, key=lambda x: x["score"], reverse=True)
    
    # Take top 20 predictions
    return predictions[:20]

@router.post("/detect")
async def detect_objects(
    file: UploadFile = File(...),
    confidence: float = 0.25
):
    """
    Detect objects in an uploaded image using YOLO
    
    - **file**: Image file (JPEG, PNG)
    - **confidence**: Minimum confidence threshold (0-1)
    
    Returns list of detected objects with class, score, and bounding box
    """
    model = get_model()
    
    if model is None:
        raise HTTPException(
            status_code=503, 
            detail="YOLO model not available on this server"
        )
    
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Preprocess
        input_tensor = preprocess_image(image)
        
        # Run inference
        input_name = model.get_inputs()[0].name
        outputs = model.run(None, {input_name: input_tensor})
        
        # Postprocess
        predictions = postprocess_output(outputs[0], confidence)
        
        return JSONResponse({
            "success": True,
            "predictions": predictions,
            "image_size": [image.width, image.height]
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@router.get("/status")
async def inference_status():
    """Check if backend YOLO is available"""
    model = get_model()
    return {
        "available": model is not None,
        "model_path": _model_path or "not loaded"
    }
