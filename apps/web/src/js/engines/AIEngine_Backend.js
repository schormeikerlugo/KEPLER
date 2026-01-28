/**
 * AIEngine_Backend.js
 * Alternative AI engine that sends frames to backend for processing
 * Used for devices with limited resources (older iPhones, low RAM devices)
 */

import { api } from '../services/api.js';

export class AIEngine_Backend {
    constructor() {
        this.videoElement = null;
        this.predictions = [];
        this.onDetectionUpdate = null;
        this.onStatusUpdate = null;

        this.isProcessing = false;
        this.isLoaded = false;
        this.isPaused = false;
        this.isAvailable = false;

        // Config - Backend processing is slower, so longer intervals
        this.inferenceInterval = 500; // 500ms = ~2 FPS
        this.lastInferenceTime = 0;

        // Capture canvas (reused)
        this.canvas = document.createElement('canvas');
        this.ctx = null;

        console.log("[AIEngine_Backend] Initialized");
    }

    async init(videoElement) {
        this.videoElement = videoElement;

        try {
            // Check if backend YOLO is available
            const statusRes = await fetch('/api/inference/status');
            const status = await statusRes.json();

            if (!status.available) {
                console.warn("[AIEngine_Backend] Backend YOLO not available");
                this.onStatusUpdate?.("⚠️ Backend AI no disponible");
                return false;
            }

            this.isAvailable = true;
            this.isLoaded = true;

            // Setup canvas for frame capture
            this.canvas.width = 640;
            this.canvas.height = 640;
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

            console.log("[AIEngine_Backend] Ready - using server-side detection");
            this.onStatusUpdate?.("☁️ AI Backend Conectado");

            // Start detection loop
            this.startDetection();
            return true;

        } catch (e) {
            console.error("[AIEngine_Backend] Init failed:", e);
            this.onStatusUpdate?.("❌ Error conectando AI Backend");
            return false;
        }
    }

    startDetection() {
        if (!this.isLoaded || !this.isAvailable) return;

        const loop = async (timestamp) => {
            if (!this.isPaused && timestamp - this.lastInferenceTime > this.inferenceInterval) {
                await this.detect();
                this.lastInferenceTime = timestamp;
            }
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    async detect() {
        if (this.isProcessing || this.isPaused) return;
        if (!this.videoElement || this.videoElement.videoWidth === 0) return;

        this.isProcessing = true;

        try {
            // Capture frame from video
            this.ctx.drawImage(
                this.videoElement,
                0, 0,
                this.canvas.width, this.canvas.height
            );

            // Convert to blob
            const blob = await new Promise(resolve => {
                this.canvas.toBlob(resolve, 'image/jpeg', 0.7);
            });

            // Send to backend
            const formData = new FormData();
            formData.append('file', blob, 'frame.jpg');

            const response = await fetch('/api/inference/detect', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Detection failed: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.predictions) {
                this.predictions = result.predictions;
                this.onDetectionUpdate?.(this.predictions);
            }

        } catch (e) {
            // Silent fail - network issues are expected
            console.debug("[AIEngine_Backend] Detection error:", e.message);
        } finally {
            this.isProcessing = false;
        }
    }

    setPaused(bool) {
        this.isPaused = bool;
        console.log(`[AIEngine_Backend] ${bool ? 'Paused' : 'Resumed'}`);
    }

    stop() {
        this.isPaused = true;
        this.isLoaded = false;
        console.log("[AIEngine_Backend] Stopped");
    }

    // Compatibility methods with local AIEngine
    findCentralTarget(predictions) {
        if (!predictions || predictions.length === 0) return null;

        const centerX = 320; // Half of 640
        const centerY = 320;

        let best = null;
        let minDist = Infinity;

        for (const pred of predictions) {
            const [x, y, w, h] = pred.bbox;
            const cx = x + w / 2;
            const cy = y + h / 2;
            const dist = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2);

            if (dist < minDist) {
                minDist = dist;
                best = pred;
            }
        }

        return best;
    }

    estimateDepth(heightPx) {
        const refHeight = 160;
        const refDist = 2.0;
        return (refHeight / heightPx) * refDist;
    }
}
