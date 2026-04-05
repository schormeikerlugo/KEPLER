/**
 * CaptureQueue — Instant capture queue with background processing
 *
 * Strategy: Capture instantly on device (crop + GPS + metadata), queue to localStorage,
 * process heavy work (CLIP, enrichment, DB insert) in background batches.
 * Persists across mission end, page navigation, and offline periods.
 */

import { auth } from '../auth.js';

const STORAGE_KEY = 'kepler_capture_queue';
const PROCESS_INTERVAL = 800;  // Process queue every 800ms (fast GPU backend)
const BATCH_SIZE = 5;          // Process 5 items per batch
const MAX_RETRIES = 5;

class CaptureQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.processTimer = null;
        this.onQueueChange = null; // Callback for UI updates

        this._loadQueue();
        this._startProcessing();
    }

    // ════════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════════

    /**
     * Enqueue a capture instantly. No awaiting, no network calls.
     * Returns immediately so the device camera loop isn't blocked.
     *
     * @param {Object} capture
     * @param {string} capture.type - 'persona' | 'poi' | 'object'
     * @param {string} capture.name - Display name
     * @param {string} capture.class_name - YOLO class
     * @param {number} capture.confidence - Detection confidence
     * @param {number[]} capture.bbox - [x, y, w, h]
     * @param {number|null} capture.track_id - ByteTrack ID
     * @param {string} capture.image_base64 - Cropped JPEG
     * @param {string|null} capture.full_frame - Full frame JPEG (optional)
     * @param {Object} capture.location - { lat, lng }
     * @param {number} capture.heading - Compass heading
     * @param {string|null} capture.mission_id
     * @param {Object} capture.metadata - Extra data
     */
    enqueue(capture) {
        const item = {
            id: `cap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            status: 'pending',      // pending → processing → done | failed
            attempts: 0,
            createdAt: new Date().toISOString(),
            ...capture
        };

        this.queue.push(item);
        this._saveQueue();
        this._notifyChange();

        console.log(`[CaptureQueue] +1 enqueued (${item.type}: ${item.name}). Queue: ${this.getPendingCount()}`);
        return item.id;
    }

    getPendingCount() {
        return this.queue.filter(i => i.status === 'pending' || i.status === 'processing').length;
    }

    getFailedCount() {
        return this.queue.filter(i => i.status === 'failed').length;
    }

    getTotalCount() {
        return this.queue.length;
    }

    getQueueSummary() {
        const pending = this.queue.filter(i => i.status === 'pending');
        const processing = this.queue.filter(i => i.status === 'processing');
        const failed = this.queue.filter(i => i.status === 'failed');
        const done = this.queue.filter(i => i.status === 'done');
        return {
            pending: pending.length,
            processing: processing.length,
            failed: failed.length,
            done: done.length,
            total: this.queue.length,
            items: pending.slice(0, 5).map(i => `${i.type}: "${i.name}"`)
        };
    }

    /** Force retry all failed items */
    retryFailed() {
        this.queue.forEach(item => {
            if (item.status === 'failed') {
                item.status = 'pending';
                item.attempts = 0;
            }
        });
        this._saveQueue();
        this._notifyChange();
    }

    /** Clear completed items from queue */
    clearDone() {
        this.queue = this.queue.filter(i => i.status !== 'done');
        this._saveQueue();
    }

    // ════════════════════════════════════════════
    // BACKGROUND PROCESSING
    // ════════════════════════════════════════════

    _startProcessing() {
        // Process in background every 3 seconds
        this.processTimer = setInterval(() => this._processBatch(), PROCESS_INTERVAL);
    }

    async _processBatch() {
        if (this.isProcessing) return;
        if (!navigator.onLine) return;

        const pending = this.queue.filter(i => i.status === 'pending');
        if (pending.length === 0) return;

        this.isProcessing = true;
        const batch = pending.slice(0, BATCH_SIZE);

        // Mark all as processing
        batch.forEach(item => { item.status = 'processing'; });
        this._saveQueue();

        let processed = 0;
        let failed = 0;
        let reIds = 0;

        try {
            const token = await auth.getToken();

            // Single batch request — backend processes all in one call
            const res = await fetch('/api/captures/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    captures: batch.map(item => ({
                        type: item.type,
                        name: item.name,
                        class_name: item.class_name,
                        confidence: item.confidence,
                        bbox: item.bbox,
                        track_id: item.track_id,
                        image_base64: item.image_base64,
                        location: item.location,
                        heading: item.heading,
                        mission_id: item.mission_id,
                        metadata: item.metadata,
                        captured_at: item.createdAt
                    }))
                })
            });

            if (res.ok) {
                const data = await res.json();
                console.log('[CaptureQueue] Batch result:', data);
                processed = data.processed || 0;
                failed = data.failed || 0;
                reIds = data.re_identifications || 0;

                // Mark individual results
                if (data.results) {
                    data.results.forEach((result, i) => {
                        if (batch[i]) {
                            batch[i].status = result.success ? 'done' : 'pending';
                            if (!result.success) {
                                batch[i].attempts++;
                                batch[i].lastError = result.error || 'Unknown backend error';
                                if (batch[i].attempts >= MAX_RETRIES) batch[i].status = 'failed';
                            }
                        }
                    });
                } else {
                    batch.forEach(item => { item.status = 'done'; });
                }
            } else {
                // Entire batch failed — log error and retry
                const errText = await res.text().catch(() => 'unknown');
                console.error(`[CaptureQueue] Batch HTTP ${res.status}: ${errText}`);
                batch.forEach(item => {
                    item.attempts++;
                    item.status = item.attempts >= MAX_RETRIES ? 'failed' : 'pending';
                    item.lastError = `HTTP ${res.status}`;
                });
                failed = batch.length;
            }
        } catch (e) {
            console.error(`[CaptureQueue] Batch network error: ${e.message}`);
            // Fallback: try individual processing
            for (const item of batch) {
                try {
                    const token = await auth.getToken();
                    const res = await fetch('/api/captures/process', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            type: item.type, name: item.name, class_name: item.class_name,
                            confidence: item.confidence, bbox: item.bbox, track_id: item.track_id,
                            image_base64: item.image_base64, location: item.location,
                            heading: item.heading, mission_id: item.mission_id,
                            metadata: item.metadata, captured_at: item.createdAt
                        })
                    });
                    if (res.ok) { item.status = 'done'; processed++; }
                    else { throw new Error(`HTTP ${res.status}`); }
                } catch (err) {
                    item.attempts++;
                    item.status = item.attempts >= MAX_RETRIES ? 'failed' : 'pending';
                    item.lastError = err.message;
                    failed++;
                    console.error(`[CaptureQueue] Individual ${item.id} failed: ${err.message}`);
                }
            }
        }

        // Clean old completed items
        const doneItems = this.queue.filter(i => i.status === 'done');
        if (doneItems.length > 50) {
            this.queue = this.queue.filter(i => i.status !== 'done' || doneItems.indexOf(i) >= doneItems.length - 50);
        }

        this._saveQueue();
        this.isProcessing = false;

        // Notify with re-ID info + error details
        if (processed > 0 || failed > 0) {
            this._notifyChange();
            const remaining = this.getPendingCount();
            const reIdText = reIds > 0 ? ` · ${reIds} re-identificacion(es)` : '';

            // Collect error logs from failed items
            const errorLogs = batch
                .filter(i => i.lastError)
                .map(i => `[${i.type}] ${i.name}: ${i.lastError}`);

            // Only show toast notifications for errors or re-IDs — success is silent (counter only)
            if (failed > 0) {
                this._notify('warning', `⚠️ ${failed} captura(s) con error${processed > 0 ? ` · ${processed} OK` : ''}`, {
                    source: 'capture_queue', action: 'batch_error', processed, failed, remaining, reIds,
                    errorLogs
                });
            } else if (reIds > 0) {
                // Re-identification is noteworthy — brief toast
                this._notify('info', `👁️ ${reIds} re-identificacion(es) detectada(s)`, {
                    source: 'capture_queue', action: 'batch_done', processed, failed, remaining, reIds
                });
            }
            // Success without re-IDs: silent — counter updates via onQueueChange callback
        }
    }

    // ════════════════════════════════════════════
    // PERSISTENCE
    // ════════════════════════════════════════════

    _loadQueue() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            this.queue = stored ? JSON.parse(stored) : [];
            // Reset any items stuck in 'processing' state (from page reload)
            this.queue.forEach(item => {
                if (item.status === 'processing') item.status = 'pending';
            });
            if (this.queue.length > 0) {
                console.log(`[CaptureQueue] Loaded ${this.queue.length} items from storage`);
            }
        } catch (e) {
            this.queue = [];
        }
    }

    _saveQueue() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.error('[CaptureQueue] Storage full, clearing done items');
            this.clearDone();
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue)); } catch (_) {}
        }
    }

    _notifyChange() {
        if (this.onQueueChange) this.onQueueChange(this.getQueueSummary());
    }

    _notify(type, message, context) {
        if (window.kepler?.notify) {
            window.kepler.notify.show(message, type, 4000, context);
        }
    }
}

export const captureQueue = new CaptureQueue();
