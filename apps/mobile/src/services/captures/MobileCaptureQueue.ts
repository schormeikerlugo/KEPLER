/**
 * MobileCaptureQueue
 * ------------------
 * Persistent queue of captures sent to `/api/captures/batch` in background.
 *
 * Counterpart of the web `CaptureQueue.js`. Differences:
 *   • AsyncStorage instead of localStorage (async API).
 *   • Bearer token from Supabase session.
 *   • Backend URL from configService (live-editable).
 *   • No reliance on `navigator.onLine` — RN's NetInfo would work but we
 *     don't depend on it; failed batches just retry next tick.
 *
 * Backend payload shape:
 *   POST /api/captures/batch
 *   { captures: [ { type, name, class_name?, confidence?, bbox?,
 *                   track_id?, image_base64, location?, heading?,
 *                   mission_id?, metadata?, captured_at } ] }
 *
 * Threading model: only one batch in flight at a time (`isProcessing`).
 * When AsyncStorage write is in flight we don't block enqueue — the next
 * tick will pick up whatever was buffered.
 *
 * Hydration: when first started, items stuck in `processing` (from a
 * previous app run that crashed mid-flight) are reset to `pending`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { configService } from '../configService';
import { supabase } from '../supabase';
import type {
    BatchResponse,
    CaptureInput,
    QueueItem,
    QueueSummary,
} from './types';

const STORAGE_KEY = 'kepler.capture_queue';
const PROCESS_INTERVAL = 800;
const BATCH_SIZE = 5;
const MAX_RETRIES = 5;
const DONE_RETENTION = 50; // keep at most N done items so we can show "5 procesadas"

type ChangeListener = (summary: QueueSummary) => void;

/** Strip optional `data:image/...;base64,` prefix the camera might add. */
function stripDataPrefix(b64: string): string {
    const idx = b64.indexOf('base64,');
    return idx >= 0 ? b64.slice(idx + 'base64,'.length) : b64;
}

class MobileCaptureQueue {
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private isStarted = false;
    private timer: ReturnType<typeof setInterval> | null = null;
    private listeners = new Set<ChangeListener>();
    private hydratePromise: Promise<void> | null = null;
    private lastBatchSummary: QueueSummary['lastBatch'];

    // ─────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────

    /** Start the background processor. Idempotent. */
    start(): void {
        if (this.isStarted) return;
        this.isStarted = true;
        this.hydrate();
        this.timer = setInterval(() => { this.processBatch(); }, PROCESS_INTERVAL);
    }

    /** Stop the background processor. Items remain persisted. */
    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.isStarted = false;
    }

    private hydrate(): Promise<void> {
        if (this.hydratePromise) return this.hydratePromise;
        this.hydratePromise = (async () => {
            try {
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed: QueueItem[] = JSON.parse(raw);
                    // Anything stuck in 'processing' from a previous run is reset
                    parsed.forEach((it) => {
                        if (it.status === 'processing') it.status = 'pending';
                    });
                    this.queue = parsed;
                }
            } catch (e) {
                console.warn('[CaptureQueue] hydrate failed:', e);
                this.queue = [];
            }
            this.notify();
        })();
        return this.hydratePromise;
    }

    private async persist(): Promise<void> {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.warn('[CaptureQueue] persist failed, dropping done items:', e);
            this.clearDone();
            try {
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
            } catch { /* give up silently */ }
        }
    }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Enqueue a capture. Non-blocking (persists in background).
     * Returns the generated item id.
     */
    enqueue(input: CaptureInput): string {
        const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const item: QueueItem = {
            ...input,
            id,
            status: 'pending',
            attempts: 0,
            createdAt: new Date().toISOString(),
            image_base64: stripDataPrefix(input.image_base64),
        };
        this.queue.push(item);
        this.notify();
        // Fire-and-forget persistence
        this.persist().catch(() => {});
        return id;
    }

    /** Re-arm failed items so they retry on next batch. */
    retryFailed(): void {
        this.queue.forEach((it) => {
            if (it.status === 'failed') {
                it.status = 'pending';
                it.attempts = 0;
                delete it.lastError;
            }
        });
        this.persist().catch(() => {});
        this.notify();
    }

    /** Drop completed items. */
    clearDone(): void {
        this.queue = this.queue.filter((it) => it.status !== 'done');
        this.persist().catch(() => {});
        this.notify();
    }

    /** Drop everything (used for "reset" or testing). */
    clearAll(): void {
        this.queue = [];
        this.lastBatchSummary = undefined;
        this.persist().catch(() => {});
        this.notify();
    }

    getSummary(): QueueSummary {
        const counts = { pending: 0, processing: 0, failed: 0, done: 0 };
        for (const it of this.queue) counts[it.status]++;
        return {
            ...counts,
            total: this.queue.length,
            lastBatch: this.lastBatchSummary,
        };
    }

    /** Subscribe to summary changes. Returns an unsubscribe fn. */
    onChange(fn: ChangeListener): () => void {
        this.listeners.add(fn);
        // Send initial state
        try { fn(this.getSummary()); } catch { /* ignore */ }
        return () => { this.listeners.delete(fn); };
    }

    // ─────────────────────────────────────────────
    // Background processor
    // ─────────────────────────────────────────────

    private async processBatch(): Promise<void> {
        if (this.isProcessing) return;
        await this.hydrate();

        const pending = this.queue.filter((it) => it.status === 'pending');
        if (pending.length === 0) return;

        this.isProcessing = true;
        const batch = pending.slice(0, BATCH_SIZE);
        batch.forEach((it) => { it.status = 'processing'; });
        await this.persist();
        this.notify();

        let processed = 0;
        let failed = 0;
        let reIds = 0;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
                throw new Error('No auth session');
            }

            const baseUrl = await configService.getBackendUrl();

            const body = {
                captures: batch.map((it) => ({
                    type: it.type,
                    name: it.name,
                    class_name: it.class_name,
                    confidence: it.confidence,
                    bbox: it.bbox,
                    track_id: it.track_id,
                    image_base64: it.image_base64,
                    location: it.location,
                    heading: it.heading,
                    mission_id: it.mission_id,
                    metadata: it.metadata,
                    captured_at: it.createdAt,
                })),
            };

            const res = await fetch(`${baseUrl}/api/captures/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = (await res.json()) as BatchResponse;
                processed = data.processed || 0;
                failed = data.failed || 0;
                reIds = data.re_identifications || 0;

                if (data.results && data.results.length === batch.length) {
                    data.results.forEach((r, i) => {
                        const it = batch[i];
                        if (!it) return;
                        if (r.success) {
                            it.status = 'done';
                        } else {
                            it.attempts++;
                            it.lastError = r.error || 'backend rejected';
                            it.status = it.attempts >= MAX_RETRIES ? 'failed' : 'pending';
                        }
                    });
                } else {
                    batch.forEach((it) => { it.status = 'done'; });
                }
            } else {
                const errText = await res.text().catch(() => '');
                console.warn(`[CaptureQueue] batch HTTP ${res.status}: ${errText}`);
                batch.forEach((it) => {
                    it.attempts++;
                    it.lastError = `HTTP ${res.status}`;
                    it.status = it.attempts >= MAX_RETRIES ? 'failed' : 'pending';
                });
                failed = batch.length;
            }
        } catch (e: any) {
            console.warn('[CaptureQueue] batch network error:', e?.message);
            // Fallback: try one-by-one against /api/captures/process
            await this.processIndividualFallback(batch).then(({ ok, ko }) => {
                processed = ok;
                failed = ko;
            });
        }

        // Trim oldest 'done' items beyond retention
        const doneIdx: number[] = [];
        this.queue.forEach((it, idx) => { if (it.status === 'done') doneIdx.push(idx); });
        if (doneIdx.length > DONE_RETENTION) {
            const toRemove = new Set(doneIdx.slice(0, doneIdx.length - DONE_RETENTION));
            this.queue = this.queue.filter((_, idx) => !toRemove.has(idx));
        }

        // Record last batch summary for UI
        const errorLogs = batch
            .filter((it) => it.lastError)
            .map((it) => `[${it.type}] ${it.name}: ${it.lastError}`);
        this.lastBatchSummary = { processed, failed, reIds, errorLogs };

        await this.persist();
        this.isProcessing = false;
        this.notify();
    }

    private async processIndividualFallback(
        batch: QueueItem[]
    ): Promise<{ ok: number; ko: number }> {
        let ok = 0;
        let ko = 0;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const baseUrl = await configService.getBackendUrl();

        if (!token) {
            batch.forEach((it) => {
                it.attempts++;
                it.lastError = 'No auth session';
                it.status = it.attempts >= MAX_RETRIES ? 'failed' : 'pending';
            });
            return { ok: 0, ko: batch.length };
        }

        for (const it of batch) {
            try {
                const res = await fetch(`${baseUrl}/api/captures/process`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        type: it.type,
                        name: it.name,
                        class_name: it.class_name,
                        confidence: it.confidence,
                        bbox: it.bbox,
                        track_id: it.track_id,
                        image_base64: it.image_base64,
                        location: it.location,
                        heading: it.heading,
                        mission_id: it.mission_id,
                        metadata: it.metadata,
                        captured_at: it.createdAt,
                    }),
                });
                if (res.ok) {
                    it.status = 'done';
                    ok++;
                } else {
                    throw new Error(`HTTP ${res.status}`);
                }
            } catch (e: any) {
                it.attempts++;
                it.lastError = e?.message || 'individual error';
                it.status = it.attempts >= MAX_RETRIES ? 'failed' : 'pending';
                ko++;
            }
        }
        return { ok, ko };
    }

    // ─────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────

    private notify(): void {
        const summary = this.getSummary();
        for (const fn of this.listeners) {
            try { fn(summary); } catch { /* ignore */ }
        }
    }
}

export const captureQueue = new MobileCaptureQueue();
export type { QueueItem, QueueSummary, CaptureInput };
