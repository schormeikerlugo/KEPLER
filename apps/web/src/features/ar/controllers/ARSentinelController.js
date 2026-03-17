// Save logic delegated to ARDataController.autoRouteDetection()

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
            this.context.ui.showToast("🛡️ CENTINELA ACTIVO", 3000);
        } else {
            this.context.ui.showToast("CENTINELA EN ESPERA", 2000);
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
        this.context.ui.showToast(`📸 CAPTURA: ${prediction.class.toUpperCase()}`, 1000);

        // 1. Capture Snapshot
        const snapshot = this.captureSnapshot();

        // 2. Delegate to DataController's Smart Entity Router
        // This handles routing person→personas_encontradas, settlements→puntos_interes, etc.
        try {
            const result = await this.context.dataController.autoRouteDetection(prediction, snapshot);
            if (result) {
                this.context.ui.showToast(`💾 ${result.type}: ${result.name}`, 3000);
            }
        } catch (e) {
            console.error('[Sentinel] autoRouteDetection error:', e);
            this.context.ui.showToast(`⚠️ ERROR: ${e.message}`, 3000);
        }
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
