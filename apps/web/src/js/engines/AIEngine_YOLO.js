// AIEngine_YOLO.js - WebSocket Native YOLOv26 Client
import { ObjectTracker } from '../utils/ObjectTracker.js';

export class AIEngine {
    constructor() {
        this.videoElement = null;
        this.predictions = [];
        this.tracker = new ObjectTracker();
        this.onDetectionUpdate = null;
        this.onStatusUpdate = null;

        this.isProcessing = false;
        this.isLoaded = false;
        this.isPaused = false;

        // Config - Optimized for WebSocket streaming
        this.inputSize = 640;
        this.inferenceInterval = 100; // ~10 FPS Target 
        this.lastInferenceTime = 0;

        // WebSocket Connection
        this.ws = null;
        this.backendUrl = 'ws://localhost:8000/api/ws/detect';

        // Offscreen canvas for extracting frames
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.inputSize;
        this.canvas.height = this.inputSize;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    async init(videoElement) {
        this.videoElement = videoElement;

        try {
            console.log("AI: Initializing YOLO WebSocket Client...");
            if (this.onStatusUpdate) this.onStatusUpdate("Conectando al Motor Core (Python)... 📡");

            this.ws = new WebSocket(this.backendUrl);

            this.ws.onopen = () => {
                console.log("AI: WebSocket Connected! 🚀");
                this.isLoaded = true;
                if (this.onStatusUpdate) this.onStatusUpdate("Sistema de Visión Activo (YOLOv26) 👁️");
                this.startDetection();
            };

            this.ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.success && data.predictions) {
                        this.handlePredictions(data.predictions);
                    } else if (data.error) {
                        console.error("AI Server Error:", data.error);
                    }
                } catch (err) {
                    console.error("AI Parse Error:", err);
                } finally {
                    this.isProcessing = false; // Allow next frame
                }
            };

            this.ws.onerror = (err) => {
                console.error("AI WebSocket Error:", err);
                if (this.onStatusUpdate) this.onStatusUpdate("Error de Conexión IA ❌");
                this.isProcessing = false;
            };

            this.ws.onclose = () => {
                console.log("AI: WebSocket Connection Closed.");
                this.isLoaded = false;
                if (this.onStatusUpdate) this.onStatusUpdate("Motor de Visión Desconectado 🔌");
            };

        } catch (error) {
            console.error('AI: Failed to init websocket:', error);
            if (this.onStatusUpdate) this.onStatusUpdate("Error Inicialización IA ❌");
        }
    }

    startDetection() {
        const loop = (timestamp) => {
            if (this.isLoaded && this.ws.readyState === WebSocket.OPEN && this.videoElement && this.videoElement.readyState === 4) {
                // 1. Inference (If not paused)
                if (!this.isPaused && !this.isProcessing && (timestamp - this.lastInferenceTime > this.inferenceInterval)) {
                    this.detect(timestamp);
                }

                // 2. Smooth & Publish
                if (!this.isPaused) {
                    this.predictions = this.tracker.getSmoothedObjects();

                    if (this.onDetectionUpdate) {
                        const target = this.findCentralTarget(this.predictions);
                        this.onDetectionUpdate({ predictions: this.predictions, target });
                    }
                } else {
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

        // Draw video frame to canvas
        this.ctx.drawImage(this.videoElement, 0, 0, this.inputSize, this.inputSize);

        // Convert canvas to jpeg base64 (faster encoding/decoding than PNG, smaller size)
        const base64Frame = this.canvas.toDataURL('image/jpeg', 0.6);

        // Send over WebSocket
        this.ws.send(base64Frame);
    }

    handlePredictions(rawPredictions) {
        if (!rawPredictions || !this.videoElement) return;

        // Scale predictions back to Video Dimensions
        const videoW = this.videoElement.videoWidth;
        const videoH = this.videoElement.videoHeight;

        // Ensure scale values are valid
        if (videoW === 0 || videoH === 0) return;

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
    }

    stop() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
