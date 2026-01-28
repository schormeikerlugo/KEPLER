/**
 * ModelPreloader Service
 * Singleton that manages YOLO model preloading across the application
 * This runs within the SPA context so the worker persists
 */

class ModelPreloaderService {
    constructor() {
        this.worker = null;
        this.isLoading = false;
        this.isReady = false;
        this.error = null;
        this.onReadyCallbacks = [];
        this.onProgressCallbacks = [];
    }

    /**
     * Start preloading the model (call early, e.g., on dashboard load)
     */
    async preload() {
        if (this.isReady || this.isLoading) {
            console.log('[ModelPreloader] Already loaded or loading');
            return;
        }

        this.isLoading = true;
        console.log('[ModelPreloader] Starting YOLO model preload...');

        try {
            // Create worker using dynamic import for better bundling
            this.worker = new Worker(
                new URL('../workers/yolo.worker.js', import.meta.url),
                { type: 'module' }
            );

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.warn('[ModelPreloader] Timeout after 120s');
                    this.isLoading = false;
                    this.error = 'Timeout';
                    resolve(); // Continue anyway
                }, 120000);

                this.worker.onmessage = (e) => {
                    if (e.data.type === 'INIT_SUCCESS') {
                        console.log('[ModelPreloader] ✅ YOLO model ready!');
                        clearTimeout(timeout);
                        this.isLoading = false;
                        this.isReady = true;

                        // Store globally for AIEngine to use
                        window.__keplerYoloWorker = this.worker;
                        window.__keplerModelReady = true;

                        // Notify all callbacks
                        this.onReadyCallbacks.forEach(cb => cb());
                        resolve();
                    } else if (e.data.type === 'ERROR') {
                        console.error('[ModelPreloader] Error:', e.data.error);
                        clearTimeout(timeout);
                        this.isLoading = false;
                        this.error = e.data.error;
                        resolve();
                    }
                };

                this.worker.onerror = (e) => {
                    console.error('[ModelPreloader] Worker error:', e);
                    clearTimeout(timeout);
                    this.isLoading = false;
                    this.error = e.message;
                    resolve();
                };

                // Initialize model
                this.worker.postMessage({
                    type: 'INIT',
                    data: {
                        modelPath: '/models/yolo11n.onnx',
                        wasmPath: '/node_modules/onnxruntime-web/dist/',
                        numThreads: navigator.hardwareConcurrency || 4,
                        executionProviders: ['wasm']
                    }
                });
            });
        } catch (e) {
            console.error('[ModelPreloader] Failed to create worker:', e);
            this.isLoading = false;
            this.error = e.message;
        }
    }

    /**
     * Get the preloaded worker (returns null if not ready)
     */
    getWorker() {
        return this.isReady ? this.worker : null;
    }

    /**
     * Check if model is ready
     */
    ready() {
        return this.isReady;
    }

    /**
     * Register callback for when model is ready
     */
    onReady(callback) {
        if (this.isReady) {
            callback();
        } else {
            this.onReadyCallbacks.push(callback);
        }
    }

    /**
     * Get loading status for UI
     */
    getStatus() {
        if (this.isReady) return 'ready';
        if (this.isLoading) return 'loading';
        if (this.error) return 'error';
        return 'idle';
    }
}

// Export singleton instance
export const modelPreloader = new ModelPreloaderService();
