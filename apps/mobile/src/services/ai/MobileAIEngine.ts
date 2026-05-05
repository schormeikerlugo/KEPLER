/**
 * MobileAIEngine — WebSocket client for `/api/ws/detect`
 *
 * Counterpart of the web `AIEngine_YOLO.js`, adapted for React Native:
 *
 *   • Web pushes 30-60 FPS via canvas + `requestAnimationFrame`.
 *     Mobile cannot do that with `expo-camera`; instead, the consumer
 *     (a hook) calls `processFrame()` whenever it has a base64 frame from
 *     `takePictureAsync`. The engine still enforces an `inferenceInterval`
 *     so we don't saturate the WS channel if frames arrive too fast.
 *
 *   • Identical wire format: send raw base64 (with or without `data:` prefix),
 *     receive JSON `{ success, predictions: [{class,score,bbox,track_id?}] }`.
 *
 *   • Auto-reconnect on disconnect (capped backoff).
 *
 *   • Configurable FPS modes: explore (333ms), focus (100ms), rest (paused).
 *
 *   • Scales bboxes from model space (640x640) to source frame coords using
 *     the dimensions provided by the caller in `processFrame`.
 *
 *   • Pushes smoothed detections via `onDetectionUpdate`. Smoothing happens
 *     in `ObjectTracker` (Kalman + LERP). Use `getSmoothed()` from a render
 *     interval for visually smooth bboxes between detections.
 */

import { configService } from '../configService';
import { ObjectTracker } from './ObjectTracker';
import type {
    BackendMessage,
    DetectionUpdate,
    EngineConfig,
    EngineStatus,
    FpsMode,
    FramePayload,
    RawPrediction,
    ScaledPrediction,
} from './types';

const FPS_INTERVALS: Record<FpsMode, number> = {
    // Lower bound between sends. Real cadence is also bounded by how fast
    // the camera + JS bridge produce a new frame (typically 150-300ms on
    // mid-range Android, 80-150ms on iOS).
    explore: 200, // ~5 FPS — enough for fluid Animated.timing(250ms) to chain
    focus: 100,   // ~10 FPS — used when we have a target lock
    rest: 0,      // paused
};

const DETECT_PATH = '/api/ws/detect';

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export class MobileAIEngine {
    private ws: WebSocket | null = null;
    private status: EngineStatus = 'idle';
    private isProcessing = false;
    private isPaused = false;
    private mode: FpsMode = 'explore';
    private inferenceInterval = FPS_INTERVALS.explore;
    private lastInferenceTime = 0;
    private inputSize: number;
    private wsUrlOverride?: string;
    private tracker = new ObjectTracker();
    private lastFrameSize = { width: 0, height: 0 };
    private lastTarget: ScaledPrediction | null = null;
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;
    /** How many backend replies we've handled (used for diagnostic logs). */
    private replyCount = 0;
    /** Replies in a row that returned zero detections. */
    private emptyStreak = 0;

    /** Subscribers */
    onDetectionUpdate?: (data: DetectionUpdate) => void;
    onStatusUpdate?: (status: EngineStatus, info?: string) => void;

    constructor(config: EngineConfig = {}) {
        this.inputSize = config.inputSize ?? 640;
        this.mode = config.initialMode ?? 'explore';
        this.inferenceInterval = FPS_INTERVALS[this.mode];
        this.wsUrlOverride = config.wsUrl;
    }

    // ─────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────

    /** Open the WebSocket connection. */
    async init(): Promise<void> {
        if (this.disposed) return;
        await this.openSocket();
    }

    /** Close the connection and stop reconnect attempts. */
    dispose(): void {
        this.disposed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }
        this.tracker.reset();
        this.setStatus('closed');
    }

    private async openSocket(): Promise<void> {
        if (this.disposed) return;
        try {
            const url = this.wsUrlOverride
                ?? `${await configService.getWsUrl()}${DETECT_PATH}`;
            this.setStatus('connecting', url);
            const ws = new WebSocket(url);
            this.ws = ws;

            ws.onopen = () => {
                this.reconnectAttempts = 0;
                this.setStatus('ready');
            };

            ws.onmessage = (e: WebSocketMessageEvent) => {
                try {
                    const msg: BackendMessage = JSON.parse(e.data);
                    if (msg.success && msg.predictions) {
                        this.handlePredictions(msg.predictions);
                    } else if (msg.error) {
                        console.warn('[MobileAIEngine] backend error:', msg.error);
                    }
                } catch (err) {
                    console.warn('[MobileAIEngine] parse error:', err);
                } finally {
                    this.isProcessing = false;
                }
            };

            ws.onerror = (err) => {
                console.warn('[MobileAIEngine] WS error:', (err as any)?.message);
                this.isProcessing = false;
            };

            ws.onclose = () => {
                this.isProcessing = false;
                if (this.disposed) return;
                this.setStatus('error', 'connection closed');
                this.scheduleReconnect();
            };
        } catch (e: any) {
            console.warn('[MobileAIEngine] init error:', e?.message);
            this.setStatus('error', e?.message);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.disposed) return;
        const idx = Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1);
        const delay = RECONNECT_BACKOFF_MS[idx];
        this.reconnectAttempts++;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.openSocket();
        }, delay);
    }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /** Submit a frame for detection. Throttled by `inferenceInterval`. */
    processFrame(frame: FramePayload): boolean {
        if (this.disposed || this.isPaused) return false;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        if (this.isProcessing) return false;

        const now = Date.now();
        if (now - this.lastInferenceTime < this.inferenceInterval) return false;

        // Track frame dimensions for bbox scaling
        if (frame.width > 0 && frame.height > 0) {
            this.lastFrameSize = { width: frame.width, height: frame.height };
        }

        // Backend accepts bare base64 OR with `data:image/...;base64,` prefix.
        // Send as-is to avoid extra string ops on the JS thread.
        const payload = frame.base64.startsWith('data:')
            ? frame.base64
            : `data:image/jpeg;base64,${frame.base64}`;

        try {
            this.ws.send(payload);
            this.isProcessing = true;
            this.lastInferenceTime = now;
            return true;
        } catch (e) {
            console.warn('[MobileAIEngine] send failed:', e);
            this.isProcessing = false;
            return false;
        }
    }

    /** Get current LERP-smoothed detections (call from render). */
    getSmoothed(): DetectionUpdate {
        const predictions = this.tracker.getSmoothed();
        const target = this.findCentralTarget(predictions);
        this.lastTarget = target;
        return { predictions, target, frameSize: this.lastFrameSize };
    }

    setFPSMode(mode: FpsMode): void {
        if (this.mode === mode) return;
        this.mode = mode;
        this.inferenceInterval = FPS_INTERVALS[mode];
        if (mode === 'rest') {
            this.isPaused = true;
        } else {
            this.isPaused = false;
        }
    }

    setPaused(paused: boolean): void {
        this.isPaused = paused;
    }

    getStatus(): EngineStatus {
        return this.status;
    }

    getMode(): FpsMode {
        return this.mode;
    }

    /** True if we have a confident "lock" on a central target. */
    hasTargetLock(threshold = 0.5): boolean {
        return !!this.lastTarget && this.lastTarget.score >= threshold;
    }

    // ─────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────

    private setStatus(status: EngineStatus, info?: string): void {
        this.status = status;
        this.onStatusUpdate?.(status, info);
    }

    private handlePredictions(raw: RawPrediction[]): void {
        const { width, height } = this.lastFrameSize;
        if (!width || !height) return;

        this.replyCount++;
        const detected = raw.length;

        // Diagnostic: log the first few replies (so we know wiring works) and
        // any time the detection rate drops to zero for a while (so the user
        // can tell if YOLO simply isn't recognising anything in frame).
        if (this.replyCount <= 3) {
            const first = raw[0];
            console.log(
                `[YOLO] reply #${this.replyCount}: ${detected} dets · frame ${width}x${height}` +
                (first ? ` · top=${first.class}@${first.score.toFixed(2)}` : '')
            );
        }
        if (detected === 0) {
            this.emptyStreak++;
            if (this.emptyStreak === 5 || this.emptyStreak === 25) {
                console.log(
                    `[YOLO] ${this.emptyStreak} empty replies in a row — ` +
                    `model sees no COCO objects in frame ${width}x${height}.`
                );
            }
        } else {
            if (this.emptyStreak >= 5) {
                console.log(`[YOLO] detections resumed (${detected})`);
            }
            this.emptyStreak = 0;
        }

        const scaleX = width / this.inputSize;
        const scaleY = height / this.inputSize;

        const scaled: ScaledPrediction[] = raw.map((p) => {
            const bx = p.bbox[0] * scaleX;
            const by = p.bbox[1] * scaleY;
            const bw = p.bbox[2] * scaleX;
            const bh = p.bbox[3] * scaleY;
            return {
                class: p.class,
                score: p.score,
                bbox: [bx, by, bw, bh],
                distance: this.estimateDepth(bh, height),
                track_id: p.track_id,
            };
        });

        this.tracker.update(scaled);

        // Publish smoothed detections immediately so subscribers can update
        // even before the next render tick.
        if (this.onDetectionUpdate) {
            const update = this.getSmoothed();
            this.onDetectionUpdate(update);
        }
    }

    /** Latest raw detection count (before any minScore filtering). */
    getLastDetectionCount(): number {
        return this.tracker.getSmoothed().length;
    }

    private findCentralTarget(preds: ScaledPrediction[]): ScaledPrediction | null {
        if (!preds.length || !this.lastFrameSize.width) return null;
        const cx = this.lastFrameSize.width / 2;
        const cy = this.lastFrameSize.height / 2;
        let best: ScaledPrediction | null = null;
        let minDist = Infinity;
        for (const p of preds) {
            const [x, y, w, h] = p.bbox;
            const bcx = x + w / 2;
            const bcy = y + h / 2;
            const d = Math.hypot(bcx - cx, bcy - cy);
            if (d < minDist) {
                minDist = d;
                best = p;
            }
        }
        return best;
    }

    private estimateDepth(heightPx: number, frameHeight: number): number {
        if (frameHeight <= 0) return 5;
        const hNorm = heightPx / frameHeight;
        if (hNorm <= 0) return 30;
        const dist = 0.5 / hNorm;
        return Math.max(0.5, Math.min(dist, 30));
    }
}

export type { DetectionUpdate, EngineStatus, FpsMode, ScaledPrediction };
