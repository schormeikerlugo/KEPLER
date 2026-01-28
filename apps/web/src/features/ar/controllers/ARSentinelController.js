import { api } from '../../../js/services/api.js';

export class ARSentinelController {
    constructor(context) {
        this.context = context; // Should contain arEngine, aiEngine
        this.isEnabled = false;
        this.cooldowns = new Map(); // Map<Class, Timestamp>
        this.GLOBAL_COOLDOWN = 5000; // 5 seconds per object class
        this.CONFIDENCE_THRESHOLD = 0.60; // Lowered for easier testing
    }

    init() {
        console.log("Sentinel Controller Initialized");
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`Sentinel Mode: ${enabled ? 'ENGAGED' : 'STANDBY'}`);

        if (enabled) {
            this.context.arUI.showToast("🛡️ CENTINELA ACTIVO", 3000);
        } else {
            this.context.arUI.showToast("CENTINELA EN ESPERA", 2000);
        }
    }

    async processPredictions(predictions) {
        if (!this.isEnabled) return;
        if (!predictions || predictions.length === 0) return;

        const now = Date.now();

        for (const pred of predictions) {
            // Criteria: High confidence & Not in cooldown
            if (pred.score >= this.CONFIDENCE_THRESHOLD) {
                const lastTrigger = this.cooldowns.get(pred.class) || 0;

                if (now - lastTrigger > this.GLOBAL_COOLDOWN) {
                    // TRIGGER SENTINEL LOG
                    this.cooldowns.set(pred.class, now);
                    await this.captureAndLog(pred);
                }
            }
        }
    }

    async captureAndLog(prediction) {
        // Visual Feedback
        this.context.arUI.showToast(`📸 CAPTURA: ${prediction.class.toUpperCase()}`, 1000);

        // 1. Capture Snapshot
        const snapshot = this.captureSnapshot();

        // 2. Gather Context Data
        // Fix: Use correct state path for location
        const location = this.context.state.lastLocation;

        if (!location) {
            // On Desktop/Indoors, GPS might be missing.
            // We notify the user but still allow saving (at 0,0 or map center) to not break the feature.
            this.context.arUI.showToast("⚠️ Guardando sin GPS (0,0)", 2000);
        }

        const safeLocation = location || { lat: 0, lng: 0 };

        // Fix: Use robust heading extraction from engines like in DataController
        let heading = 0;
        try {
            heading = (this.context.gpsEngine?.filteredHeading || this.context.gpsEngine?.heading || 0);
        } catch (e) { }

        // 3. Payload
        const payload = {
            source: 'sentinel',
            object_class: prediction.class,
            name: 'Unknown',
            confidence: prediction.score,
            timestamp: new Date().toISOString(),
            location: safeLocation,
            heading: heading,
            image_base64: snapshot,
            metadata: {
                bbox: prediction.bbox,
                mode: 'SENTINEL_AUTO'
            },
            mission_id: this.context.state.currentMissionId || null
        };

        // 4. Send to API
        console.log("[Sentinel] Uploading:", payload.object_class);
        api.createObject(payload).then(res => {
            if (res.success === false) {
                this.context.arUI.showToast(`⚠️ ERROR: ${res.error}`, 3000);
                return;
            }

            if (res.status === 'identified') {
                const name = res.match.nombre || 'Desconocido';
                this.context.arUI.showToast(`👁️ IDENTIFICADO: ${name}`, 3000);
            } else {
                const name = res.data?.nombre || 'Nuevo Objeto';
                this.context.arUI.showToast(`💾 REGISTRADO: ${name}`, 3000);
            }
        });
    }

    captureSnapshot() {
        if (!this.context.arEngine || !this.context.arEngine.video) return null;

        const video = this.context.arEngine.video;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Draw Bounding Box (Optional, for the record)
        // We could leave it clean or burn in the HUD. 
        // Let's keep it raw for AI retraining purposes, OR burn it in for "Evidence".
        // The user said "tomar fotos y guardar datos". 
        // Raw is better for analysis.

        return canvas.toDataURL('image/jpeg', 0.8);
    }
}
