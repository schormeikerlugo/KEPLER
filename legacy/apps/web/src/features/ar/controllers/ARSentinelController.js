/**
 * ARSentinelController — Instant queue-based auto-capture
 *
 * Strategy: Capture ALL entities instantly (crop + metadata), queue to CaptureQueue.
 * Zero awaits on heavy processing. Backend handles CLIP/enrichment/insert.
 * Cooldown per individual (track_id), captures all people in a frame at once.
 */

import { captureQueue } from '../../../js/services/CaptureQueue.js';

export class ARSentinelController {
    constructor(context) {
        this.context = context;
        this.isEnabled = false;

        // Per-individual tracking (ByteTrack IDs)
        this.capturedTrackIds = new Map();  // track_id → timestamp
        this.classCooldowns = new Map();    // Fallback for no-tracking

        // Config
        this.CONFIDENCE_THRESHOLD = 0.60;
        this.INDIVIDUAL_COOLDOWN = 15000;   // 15s per individual
        this.CLASS_COOLDOWN = 3000;         // 3s fallback per class
        this.MAX_PER_FRAME = 5;             // Max captures per frame

        // Reusable crop canvas
        this._cropCanvas = document.createElement('canvas');
        this._cropCtx = this._cropCanvas.getContext('2d');
    }

    init() {
        console.log("[Sentinel] Initialized — queue-based capture");

        // Show queue status on startup
        const pending = captureQueue.getPendingCount();
        if (pending > 0) {
            this.context.ui.showToast(`📋 ${pending} captura(s) en cola de procesamiento`, 3000);
        }

        // Listen for queue changes → update capture counter
        captureQueue.onQueueChange = (summary) => {
            const counter = document.getElementById('capture-counter');
            const counterNum = document.getElementById('capture-counter-num');
            if (counter && counterNum) {
                const queued = summary.pending + summary.processing;
                const total = summary.done + queued + summary.failed;
                if (total > 0) {
                    counter.style.display = 'flex';
                    counterNum.textContent = summary.done;

                    // Show processing indicator
                    if (queued > 0) {
                        counter.classList.add('processing');
                        counter.title = `${summary.done} procesadas · ${queued} en cola`;
                    } else {
                        counter.classList.remove('processing');
                        counter.title = `${summary.done} capturas procesadas`;
                    }

                    if (summary.failed > 0) {
                        counter.classList.add('has-errors');
                    } else {
                        counter.classList.remove('has-errors');
                    }
                }
            }
        };
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (enabled) {
            this.capturedTrackIds.clear();
            this.classCooldowns.clear();
            this.context.ui.showToast("🛡️ CENTINELA ACTIVO", 3000);
        } else {
            this.context.ui.showToast("CENTINELA EN ESPERA", 2000);
        }
    }

    /**
     * Process all predictions from a frame — instantly enqueue without blocking
     */
    processPredictions(predictions) {
        if (!this.isEnabled) return;
        if (!predictions || predictions.length === 0) return;
        if (!this.context.state.lastLocation) return;

        const now = Date.now();
        const toCapture = [];

        for (const pred of predictions) {
            if (pred.score < this.CONFIDENCE_THRESHOLD) continue;

            const trackId = pred.track_id;

            if (trackId != null) {
                const lastTime = this.capturedTrackIds.get(trackId);
                if (lastTime && (now - lastTime) < this.INDIVIDUAL_COOLDOWN) continue;
                this.capturedTrackIds.set(trackId, now);
            } else {
                const lastTime = this.classCooldowns.get(pred.class) || 0;
                if ((now - lastTime) < this.CLASS_COOLDOWN) continue;
                this.classCooldowns.set(pred.class, now);
            }

            toCapture.push(pred);
            if (toCapture.length >= this.MAX_PER_FRAME) break;
        }

        if (toCapture.length === 0) return;

        // Get video reference once
        const video = this.context.arEngine?.video;
        if (!video) return;

        // Capture and enqueue — skip empty crops
        let enqueued = 0;
        const timeLabel = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        for (const pred of toCapture) {
            const cropped = this._cropFromBbox(video, pred.bbox);

            // Skip if crop failed or image is too small (< 500 bytes = corrupt/empty)
            if (!cropped || cropped.length < 500) continue;

            const trackLabel = pred.track_id != null ? ` [#${pred.track_id}]` : '';
            const type = pred.class === 'person' ? 'persona'
                : ['bench', 'fire_hydrant', 'stop_sign', 'traffic_light', 'building', 'tent'].includes(pred.class) ? 'poi'
                : 'object';

            const name = type === 'persona' ? `Persona ${timeLabel}${trackLabel}`
                : `${pred.class.toUpperCase()} ${timeLabel}${trackLabel}`;

            captureQueue.enqueue({
                type,
                name,
                class_name: pred.class,
                confidence: pred.score,
                bbox: pred.bbox,
                track_id: pred.track_id || null,
                image_base64: cropped,
                location: { lat: this.context.state.lastLocation.lat, lng: this.context.state.lastLocation.lng },
                heading: (this.context.gpsEngine?.filteredHeading || 0) + (this.context.arEngine?.headingOffset || 0),
                mission_id: this.context.state.currentMissionId || null,
                metadata: {
                    created_by: 'SENTINEL_QUEUE',
                    ai_class: pred.class,
                    ai_confidence: pred.score.toFixed(2)
                }
            });
            enqueued++;
        }

        if (enqueued === 0) return;

        // Subtle flash only — no toast popup for individual captures
        const flash = document.getElementById('capture-flash');
        if (flash) {
            flash.classList.add('active');
            setTimeout(() => flash.classList.remove('active'), 150);
        }

        // Cleanup old track IDs
        for (const [id, time] of this.capturedTrackIds) {
            if (now - time > 60000) this.capturedTrackIds.delete(id);
        }
    }

    /**
     * Crop entity from video using YOLO bbox + 15% padding
     */
    _cropFromBbox(video, bbox) {
        if (!bbox || bbox.length < 4) return null;

        const [bx, by, bw, bh] = bbox;
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        const padX = bw * 0.15;
        const padY = bh * 0.15;
        const x = Math.max(0, Math.round(bx - padX));
        const y = Math.max(0, Math.round(by - padY));
        const w = Math.min(vw - x, Math.round(bw + padX * 2));
        const h = Math.min(vh - y, Math.round(bh + padY * 2));

        if (w < 20 || h < 20) return null;

        this._cropCanvas.width = w;
        this._cropCanvas.height = h;
        this._cropCtx.drawImage(video, x, y, w, h, 0, 0, w, h);

        return this._cropCanvas.toDataURL('image/jpeg', 0.85);
    }
}
