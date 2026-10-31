import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export class AIEngine {
    constructor() {
        this.model = null;
        this.isLoaded = false;
        this.predictions = [];
        this.videoElement = null;
        this.isDetecting = false;
        
        // Mobile optimization: Adaptive detection
        this.frameCount = 0;
        // Increase interval: Mobile every 15 frames (4 detection/s), Desktop every 5 (12 detection/s)
        this.detectionInterval = this.isMobile() ? 15 : 5; 
        this.lastPredictions = [];
        
        // Callback for detection results
        this.onDetectionUpdate = null; // (predictions) => {}
    }
    
    // Detect if running on mobile device
    isMobile() {
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }

    async init(videoElement) {
        this.videoElement = videoElement;
        try {
            console.log("AI: Loading COCO-SSD Model...");
            // Load with lite mobilenet v2 for speed
            this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
            this.isLoaded = true;
            console.log("AI: Model Loaded.");
            
            this.startDetectionLoop();
        } catch (err) {
            console.error("AI: Failed to load model", err);
        }
    }

    startDetectionLoop() {
        this.isDetecting = true;
        this.detect();
    }

    stop() {
        this.isDetecting = false;
    }

    async detect() {
        if (!this.isDetecting || !this.model || !this.videoElement) return;

        this.frameCount++;
        
        // Adaptive detection: Skip frames to prioritize 3D rendering (mobile optimization)
        const shouldDetect = this.frameCount % this.detectionInterval === 0;
        
        // Ensure video is ready
        if (this.videoElement.readyState === 4) {
             try {
                 if (shouldDetect) {
                     // Detect on this frame - Limit to 10 objects, min confidence 0.4
                     const predictions = await this.model.detect(this.videoElement, 10, 0.4);
                     this.predictions = predictions;
                     this.lastPredictions = predictions; // Cache for skipped frames
                 } else {
                     // Use cached predictions on skipped frames
                     this.predictions = this.lastPredictions;
                 }
                 
                 // Smart logic: Find "Target" (Closest to center)
                 const target = this.findCentralTarget(this.predictions);
                 
                 if (this.onDetectionUpdate) {
                     this.onDetectionUpdate({ predictions: this.predictions, target });
                 }
             } catch (e) {
                 // Ignore frame mismatch errors or resizing glitches
             }
        }
        
        // Run on next animation frame
        requestAnimationFrame(() => this.detect());
    }

    findCentralTarget(predictions) {
        if (!predictions || predictions.length === 0) return null;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Need to scale detection coords if video is scaled?
        // videoElement might be CSS scaled. 
        // Note: TF.js coords are relative to the video element's internal resolution (e.g. 640x480)
        // We typically render the video covering the screen (object-fit: cover).
        // This mapping is tricky in CSS.
        // For simple "Center", we can assume the video center is screen center.
        // We just need the prediction closest to video center.
        
        const videoW = this.videoElement.videoWidth;
        const videoH = this.videoElement.videoHeight;
        
        if(!videoW || !videoH) return null;

        let closest = null;
        let minDist = Infinity;

        predictions.forEach(p => {
            const [x, y, w, h] = p.bbox;
            const cx = x + w / 2;
            const cy = y + h / 2;
            
            // Distance to center of video
            const dist = Math.sqrt(Math.pow(cx - videoW/2, 2) + Math.pow(cy - videoH/2, 2));
            
            if (dist < minDist) {
                minDist = dist;
                closest = p;
            }
        });
        
        // Threshold? If too far from center, ignore.
        // E.g. 20% of width
        if (minDist > videoW * 0.3) return null;
        
        // Add depth estimation
        closest.distance = this.estimateDepth(closest.bbox);
        
        return closest;
    }

    estimateDepth(bbox) {
        // Simple heuristic: 
        // Assume an average object height (e.g., person ~1.7m, bottle ~0.3m).
        // Since we don't know the class size perfectly, we use a generic "Reference Object" approach.
        // Formula: Distance = (FocalLength * RealHeight) / ImageHeight
        // Simplified: Distance ~ Constant / bboxHeightFactor
        
        const [x, y, w, h] = bbox;
        const videoH = this.videoElement.videoHeight;
        
        // Normalized height (0.0 to 1.0)
        const hNorm = h / videoH;
        
        // Heuristic: If object fills 50% of screen height -> 1 meter away.
        // If 10% -> 5 meters away.
        // Distance = 0.5 / hNorm
        
        let dist = 0.5 / hNorm;
        
        // Clamp reasonable AR values (0.5m to 20m)
        return Math.max(0.5, Math.min(dist, 20));
    }

    /**
     * Multi-Scale Detection for distant objects
     * Runs detection on full frame + center crop
     */
    async detectMultiScale() {
        if (!this.model || !this.videoElement) return [];
        
        const allPredictions = [];
        
        // 1. Standard detection (full frame)
        const fullPreds = await this.model.detect(this.videoElement);
        allPredictions.push(...fullPreds);
        
        // 2. Center crop detection (for distant objects)
        try {
            const centerCrop = this.getCenterCrop();
            const cropPreds = await this.model.detect(centerCrop);
            
            // Adjust bounding boxes back to full frame coordinates
            const adjustedPreds = cropPreds.map(pred => {
                const adjusted = this.adjustBBoxToFullFrame(pred.bbox, pred.class, pred.score);
                return {
                    ...pred,
                    bbox: adjusted.bbox,
                    distance: adjusted.distance
                };
            });
            
            allPredictions.push(...adjustedPreds);
        } catch (e) {
            console.warn('AI: Center crop detection failed', e);
        }
        
        // 3. Deduplicate overlapping predictions
        return this.deduplicatePredictions(allPredictions);
    }

    getCenterCrop() {
        // Crop center 60% of frame (simulates 1.6x zoom)
        const canvas = document.createElement('canvas');
        const video = this.videoElement;
        const w = video.videoWidth;
        const h = video.videoHeight;
        
        const cropRatio = 0.6;
        const cropW = w * cropRatio;
        const cropH = h * cropRatio;
        const cropX = (w - cropW) / 2;
        const cropY = (h - cropH) / 2;
        
        canvas.width = cropW;
        canvas.height = cropH;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        
        return canvas;
    }

    adjustBBoxToFullFrame(cropBBox, className, score) {
        const video = this.videoElement;
        const w = video.videoWidth;
        const h = video.videoHeight;
        const cropRatio = 0.6;
        
        const offsetX = w * (1 - cropRatio) / 2;
        const offsetY = h * (1 - cropRatio) / 2;
        
        const [x, y, width, height] = cropBBox;
        
        // Scale and translate bbox back to full frame
        const scaleFactor = 1 / cropRatio;
        const adjustedBBox = [
            x * scaleFactor + offsetX,
            y * scaleFactor + offsetY,
            width * scaleFactor,
            height * scaleFactor
        ];
        
        // Estimate distance (objects in crop are typically further)
        const distance = this.estimateDepth(adjustedBBox) * 1.5;
        
        return { bbox: adjustedBBox, distance };
    }

    deduplicatePredictions(predictions) {
        if (predictions.length <= 1) return predictions;
        
        const filtered = [];
        const used = new Set();
        
        // Sort by confidence
        predictions.sort((a, b) => b.score - a.score);
        
        for (let i = 0; i < predictions.length; i++) {
            if (used.has(i)) continue;
            
            filtered.push(predictions[i]);
            
            // Mark overlapping predictions as used
            for (let j = i + 1; j < predictions.length; j++) {
                if (used.has(j)) continue;
                
                const iou = this.calculateIOU(predictions[i].bbox, predictions[j].bbox);
                if (iou > 0.5) { // 50% overlap threshold
                    used.add(j);
                }
            }
        }
        
        return filtered;
    }

    calculateIOU(box1, box2) {
        const [x1, y1, w1, h1] = box1;
        const [x2, y2, w2, h2] = box2;
        
        const xA = Math.max(x1, x2);
        const yA = Math.max(y1, y2);
        const xB = Math.min(x1 + w1, x2 + w2);
        const yB = Math.min(y1 + h1, y2 + h2);
        
        const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const area1 = w1 * h1;
        const area2 = w2 * h2;
        const union = area1 + area2 - intersection;
        
        return intersection / union;
    }

    /**
     * Crop detection from video based on bounding box
     * @param {Array} bbox - [x, y, width, height] of detected object
     * @returns {string} Base64 encoded cropped image or empty string on error
     */
    cropDetection(bbox) {
        try {
            // Validate inputs
            if (!this.videoElement) {
                console.warn("cropDetection: No video element");
                return '';
            }
            if (!bbox || bbox.length < 4) {
                console.warn("cropDetection: Invalid bbox");
                return '';
            }
            
            const video = this.videoElement;
            
            // Check video is ready
            if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
                console.warn("cropDetection: Video not ready");
                return '';
            }
            
            const [x, y, w, h] = bbox;
            
            // Validate bbox values are numbers
            if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
                console.warn("cropDetection: bbox contains NaN");
                return '';
            }
            
            // Add padding around the detection (10%)
            const padding = 0.1;
            const padX = w * padding;
            const padY = h * padding;
            
            // Calculate crop region with bounds checking
            const cropX = Math.max(0, Math.floor(x - padX));
            const cropY = Math.max(0, Math.floor(y - padY));
            let cropW = Math.floor(w + padX * 2);
            let cropH = Math.floor(h + padY * 2);
            
            // Ensure we don't exceed video bounds
            if (cropX + cropW > video.videoWidth) {
                cropW = video.videoWidth - cropX;
            }
            if (cropY + cropH > video.videoHeight) {
                cropH = video.videoHeight - cropY;
            }
            
            // Ensure minimum size
            if (cropW < 10 || cropH < 10) {
                console.warn("cropDetection: Crop too small");
                return '';
            }
            
            // Create canvas for cropped image
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(cropW, 640);  // Max 640px width
            canvas.height = Math.min(cropH, 480); // Max 480px height
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.warn("cropDetection: Failed to get canvas context");
                return '';
            }
            
            ctx.drawImage(
                video, 
                cropX, cropY, cropW, cropH,  // Source
                0, 0, canvas.width, canvas.height  // Destination
            );
            
            // Return base64 with data URI prefix
            return canvas.toDataURL('image/jpeg', 0.7);
            
        } catch (e) {
            console.error("cropDetection error:", e);
            return ''; // Return empty string instead of throwing
        }
    }
}
