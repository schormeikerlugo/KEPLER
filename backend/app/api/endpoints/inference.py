"""
Backend YOLO Inference Endpoint
Processes images server-side for devices with limited resources
"""

from fastapi import APIRouter, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
import numpy as np
from PIL import Image
import io
import os
import cv2
import base64

router = APIRouter()

# YOLO model instance (lazy loaded)
_model = None
_model_path = None

def get_model():
    """Lazy load YOLO model using native Ultralytics (PyTorch)"""
    global _model, _model_path
    
    if _model is not None:
        return _model
    
    try:
        from ultralytics import YOLO
        print("[Inference] ultralytics YOLO imported successfully")
    except ImportError as e:
        print(f"[Inference] ERROR: ultralytics not installed! Run: pip install ultralytics")
        print(f"[Inference] Import error: {e}")
        return None
    
    try:
        # Resolve path
        current_file = os.path.abspath(__file__)
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file))))
        
        # Prefer YOLO.pt weights for native ultralytics execution
        local_model_path_pt = os.path.join(backend_dir, "models", "yolov26n.pt") # Ensure this is the requested model
        local_model_path_fallback = os.path.join(backend_dir, "models", "yolo11n.pt") # Fallback
        
        model_paths = [
            local_model_path_pt,
            local_model_path_fallback,
            os.path.join(os.getcwd(), "models", "yolov26n.pt"),
            os.path.join(os.getcwd(), "models", "yolo11n.pt"),
        ]
        
        for path in model_paths:
            print(f"[Inference] Checking: {path} -> exists={os.path.exists(path)}")
            if os.path.exists(path):
                _model_path = path
                break
        
        if not _model_path:
            print("[Inference] Warning: Model file not found locally. Ultralytics will attempt to auto-download YOLOv8n as fallback if internet is available.")
            _model_path = "yolov8n.pt" # Last resort fallback built into library
            
        print(f"[Inference] Loading YOLO model from {_model_path}")
        _model = YOLO(_model_path)
        print("[Inference] Native YOLO model loaded successfully")
        return _model
        
    except Exception as e:
        print(f"[Inference] Failed to load YOLO model: {e}")
        import traceback
        traceback.print_exc()
        return None

def process_image_with_yolo(image: Image.Image, confidence: float = 0.25) -> List[Dict[str, Any]]:
    """Process an image through the native YOLO model and format output"""
    model = get_model()
    if not model:
        raise ValueError("YOLO model not loaded")

    # Convert PIL Image to OpenCV format (numpy array BGR) for Ultralytics
    img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    # Run inference
    results = model(img_cv, conf=confidence, verbose=False)
    
    predictions = []
    
    # Process results
    for r in results:
        boxes = r.boxes
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist() # Top-left, Bottom-right
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]
            
            # Convert xyxy to xywh (Center X, Center Y, Width, Height)
            w = x2 - x1
            h = y2 - y1
            x = x1
            y = y1
            
            predictions.append({
                "class": cls_name,
                "score": round(conf, 3),
                "bbox": [round(x, 2), round(y, 2), round(w, 2), round(h, 2)] # [x, y, w, h] formatting
            })
            
    return predictions


def process_image_with_tracking(image: Image.Image, confidence: float = 0.25) -> List[Dict[str, Any]]:
    """Process image with YOLO tracking (ByteTrack) for persistent object IDs across frames"""
    model = get_model()
    if not model:
        raise ValueError("YOLO model not loaded")

    img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    # Use track() instead of predict() — persists IDs across frames
    results = model.track(img_cv, conf=confidence, verbose=False, persist=True)

    predictions = []
    for r in results:
        boxes = r.boxes
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]

            w = x2 - x1
            h = y2 - y1
            x = x1
            y = y1

            pred = {
                "class": cls_name,
                "score": round(conf, 3),
                "bbox": [round(x, 2), round(y, 2), round(w, 2), round(h, 2)]
            }

            # ByteTrack assigns persistent track IDs
            if box.id is not None:
                pred["track_id"] = int(box.id[0])

            predictions.append(pred)

    return predictions


@router.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    """
    WebSocket endpoint for real-time video frame processing.
    Expects base64 encoded JPG/PNG images and returns JSON detections.
    """
    await websocket.accept()
    model = get_model()
    
    if model is None:
        await websocket.close(code=1011, reason="YOLO model not available")
        return
        
    try:
        while True:
            # Receive base64 frame from client
            data = await websocket.receive_text()
            
            # Remove base64 header if present
            if "," in data:
                data = data.split(",")[1]
                
            try:
                # Decode image
                image_bytes = base64.b64decode(data)
                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                
                # Perform detection with tracking (ByteTrack for persistent IDs)
                predictions = process_image_with_tracking(image, confidence=0.25)
                
                # Send results back
                await websocket.send_json({
                    "success": True,
                    "predictions": predictions,
                    "image_size": [image.width, image.height]
                })
                
            except Exception as e:
                await websocket.send_json({"success": False, "error": str(e)})
                
    except WebSocketDisconnect:
        print("[Inference] WebSocket client disconnected")
    except Exception as e:
        print(f"[Inference] WebSocket error: {e}")

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
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Perform detection
        predictions = process_image_with_yolo(image, confidence)
        
        return JSONResponse({
            "success": True,
            "predictions": predictions,
            "image_size": [image.width, image.height]
        })
        
    except ValueError as ve:
        raise HTTPException(status_code=503, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@router.get("/status")
async def inference_status():
    """Check if backend YOLO is available"""
    model = get_model()
    return {
        "available": model is not None,
        "model_path": _model_path or "not loaded",
        "backend": "ultralytics-pytorch-native"
    }
