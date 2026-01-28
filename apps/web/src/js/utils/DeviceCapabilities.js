/**
 * DeviceCapabilities - Utility to detect device capabilities for adaptive optimization
 * Used to adjust YOLO resolution, preloading strategy, and other performance settings
 */

export const DeviceCapabilities = {
    /**
     * Detect if running on iPhone 13 or older (pre-A16 chip)
     * iPhone 14 = "iPhone15,x" in UA, so we check for < 15
     */
    isOlderIPhone() {
        const ua = navigator.userAgent;
        if (!/iPhone/.test(ua)) return false;

        // iPhone model number in UA: "iPhone14,2" = iPhone 13 Pro
        // iPhone 14 Pro = "iPhone15,2"
        const match = ua.match(/iPhone(\d+),/);
        if (match) {
            const modelNum = parseInt(match[1]);
            return modelNum < 15; // iPhone 14 starts at iPhone15,x
        }

        // If we can't detect, assume older for safety
        return true;
    },

    /**
     * Check if device has limited RAM (< 4GB)
     * Uses navigator.deviceMemory (Chrome/Edge only, not Safari)
     */
    hasLimitedMemory() {
        // Safari doesn't support deviceMemory, so we can't detect on iPhone
        // Fall back to UA detection for iPhones
        if (typeof navigator.deviceMemory === 'number') {
            return navigator.deviceMemory < 4;
        }
        return false;
    },

    /**
     * Main decision: Should we use "lite mode" for this device?
     * Lite mode = lower YOLO resolution, slower inference, less eager preloading
     */
    preferLiteMode() {
        return this.isOlderIPhone() || this.hasLimitedMemory();
    },

    /**
     * Get recommended YOLO input size
     * NOTE: YOLO model is trained for 640x640. Cannot change this.
     */
    getRecommendedInputSize() {
        return 640; // Fixed - model requirement
    },

    /**
     * Get recommended inference interval (ms)
     * Slower on older devices to reduce CPU/GPU load
     */
    getRecommendedInterval() {
        // CPU Mode (WASM) adjustments to prevent overheating
        // Lite mode: 500ms (~2 FPS)
        // Full mode: 350ms (~3 FPS) 
        return this.preferLiteMode() ? 500 : 350;
    },

    /**
     * Should we eagerly preload the YOLO model on dashboard?
     * STRICT: Never preload on mobile devices (iOS/Android) to prevent OOM crashes.
     * Only preload on Desktop.
     */
    shouldEagerPreload() {
        // Check if mobile (UA or Touch points)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1);

        return !isMobile && !this.preferLiteMode();
    },

    /**
     * Get a summary of device capabilities for logging
     */
    getSummary() {
        return {
            isOlderIPhone: this.isOlderIPhone(),
            hasLimitedMemory: this.hasLimitedMemory(),
            preferLiteMode: this.preferLiteMode(),
            recommendedInputSize: this.getRecommendedInputSize(),
            recommendedInterval: this.getRecommendedInterval(),
            shouldEagerPreload: this.shouldEagerPreload()
        };
    }
};
