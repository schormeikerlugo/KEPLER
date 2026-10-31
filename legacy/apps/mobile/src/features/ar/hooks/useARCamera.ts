/**
 * useARCamera — Top-level orchestrator for the AR screen.
 *
 * Wires together:
 *   • useCameraStream      — pulls frames from expo-camera at 3 FPS
 *   • useYoloDetection     — sends frames to backend, receives bboxes
 *   • useMobileCaptureQueue — persists captures, processes batch
 *   • expo-location        — GPS coords + compass heading
 *   • configService        — low-battery auto-pause + sentinel duration
 *   • expo-battery         — auto-pause when battery < 20%
 *
 * Exposes a single coherent API for the screen so the UI is dumb
 * (only renders state; no business logic).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

import { useCameraStream } from './useCameraStream';
import { useYoloDetection } from './useYoloDetection';
import { useMobileCaptureQueue } from './useMobileCaptureQueue';
import type { CameraRefLike, CapturedFrame } from './cameraTypes';
import type {
    EngineStatus,
    FpsMode,
    ScaledPrediction,
} from '../../../services/ai';
import type { CaptureInput, QueueSummary } from '../../../services/captures';
import { configService } from '../../../services/configService';

const FOCUS_LOCK_THRESHOLD = 0.5;
const SENTINEL_MIN_SCORE = 0.5;       // ignore weak detections in Sentinel
const SENTINEL_BATCH_LIMIT = 5;       // captures per Sentinel tick
const LOW_BATTERY_THRESHOLD = 0.2;    // 20%

interface UseARCameraParams {
    cameraRef: CameraRefLike;
    /** ID of the active mission, attached to every capture. */
    missionId?: string | null;
    /** Master enable switch (e.g. toggled when the screen mounts/unmounts). */
    enabled: boolean;
}

interface UseARCameraReturn {
    // Engine status
    aiOn: boolean;
    setAiOn: (v: boolean) => void;
    engineStatus: EngineStatus;
    engineInfo?: string;

    // Predictions for overlay
    predictions: ScaledPrediction[];
    target: ScaledPrediction | null;
    frameSize: { width: number; height: number };

    // Capture queue
    queueSummary: QueueSummary;
    retryFailed: () => void;

    // Sentinel mode
    sentinelActive: boolean;
    sentinelSecondsLeft: number;
    toggleSentinel: () => void;

    // Quick Capture
    quickCapture: () => Promise<void>;

    // Diagnostics
    streamStatus: ReturnType<typeof useCameraStream>['status'];
    frameCount: number;
    droppedCount: number;
    autoPaused: boolean;
}

export function useARCamera({
    cameraRef,
    missionId,
    enabled,
}: UseARCameraParams): UseARCameraReturn {
    const [aiOn, setAiOn] = useState(true);
    const [autoPaused, setAutoPaused] = useState(false);

    // ─── Live data refs (used inside callbacks without re-creating them) ───
    const locationRef = useRef<{ lat: number; lng: number } | null>(null);
    const headingRef = useRef<number>(0);
    const lastSentinelByTrack = useRef<Map<number, number>>(new Map());
    const lastQuickCaptureRef = useRef<number>(0);

    // ─── Sentinel state ──────────────────────────────────────────────
    const [sentinelActive, setSentinelActive] = useState(false);
    const [sentinelSecondsLeft, setSentinelSecondsLeft] = useState(0);
    const sentinelEndAtRef = useRef<number>(0);
    const [sentinelDurationCfg, setSentinelDurationCfg] = useState(
        () => configService.getSnapshot().sentinelDuration
    );
    const [autoPauseEnabled, setAutoPauseEnabled] = useState(
        () => configService.getSnapshot().lowBatteryAutoPause
    );

    // Subscribe to live config changes (Settings screen edits)
    useEffect(() => {
        const unsub = configService.onChange((c) => {
            setSentinelDurationCfg(c.sentinelDuration);
            setAutoPauseEnabled(c.lowBatteryAutoPause);
        });
        return unsub;
    }, []);

    // ─── GPS watch ───────────────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;
        let sub: Location.LocationSubscription | null = null;

        (async () => {
            try {
                const perm = await Location.getForegroundPermissionsAsync();
                if (perm.status !== 'granted') {
                    const req = await Location.requestForegroundPermissionsAsync();
                    if (req.status !== 'granted') return;
                }
                sub = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 4000,
                        distanceInterval: 5,
                    },
                    (loc) => {
                        locationRef.current = {
                            lat: loc.coords.latitude,
                            lng: loc.coords.longitude,
                        };
                    }
                );
            } catch (e) {
                console.warn('[useARCamera] GPS watch failed:', e);
            }
        })();

        return () => { sub?.remove(); };
    }, [enabled]);

    // ─── Compass heading watch ───────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;
        let sub: Location.LocationSubscription | null = null;

        (async () => {
            try {
                sub = await Location.watchHeadingAsync((reading) => {
                    // `trueHeading` when calibrated, `magHeading` as fallback
                    const h =
                        reading.trueHeading != null && reading.trueHeading >= 0
                            ? reading.trueHeading
                            : reading.magHeading;
                    if (typeof h === 'number') headingRef.current = h;
                });
            } catch (e) {
                console.warn('[useARCamera] Heading watch failed:', e);
            }
        })();

        return () => { sub?.remove(); };
    }, [enabled]);

    // ─── Battery auto-pause ──────────────────────────────────────────
    useEffect(() => {
        if (!enabled || !autoPauseEnabled) {
            setAutoPaused(false);
            return;
        }
        let cancelled = false;
        let levelSub: { remove: () => void } | null = null;

        (async () => {
            let Battery: any;
            try {
                // @ts-ignore — optional dependency, resolved at runtime
                Battery = await import('expo-battery');
            } catch {
                return;
            }
            try {
                const lvl = await Battery.getBatteryLevelAsync();
                if (!cancelled && typeof lvl === 'number') {
                    setAutoPaused(lvl < LOW_BATTERY_THRESHOLD);
                }
                levelSub = Battery.addBatteryLevelListener(({ batteryLevel }: any) => {
                    if (cancelled) return;
                    setAutoPaused(batteryLevel < LOW_BATTERY_THRESHOLD);
                });
            } catch (e) {
                console.warn('[useARCamera] battery watch failed:', e);
            }
        })();

        return () => {
            cancelled = true;
            levelSub?.remove();
        };
    }, [enabled, autoPauseEnabled]);

    // ─── Effective enable flags ──────────────────────────────────────
    const effectiveAi = enabled && aiOn && !autoPaused;
    const effectiveStream = enabled && aiOn && !autoPaused;

    // ─── YOLO engine ─────────────────────────────────────────────────
    const yolo = useYoloDetection({ enabled: effectiveAi });

    // ─── Camera frame stream ─────────────────────────────────────────
    const { sendFrame } = yolo;
    const onFrame = useCallback(
        (frame: CapturedFrame) => {
            sendFrame({
                base64: frame.base64,
                width: frame.width,
                height: frame.height,
            });
        },
        [sendFrame]
    );

    const { status: streamStatus, frameCount, droppedCount, captureOnce } =
        useCameraStream({
            cameraRef,
            enabled: effectiveStream,
            intervalMs: 200,
            quality: 0.45,
            onFrame,
        });

    // ─── Capture queue ───────────────────────────────────────────────
    const { summary: queueSummary, enqueue, retryFailed } = useMobileCaptureQueue();

    // ─── Auto-switch FPS mode based on target lock ───────────────────
    // Depend only on stable bits: the target's track_id (changes rarely)
    // and the AI master flag. Avoid depending on the whole `yolo` return
    // (its identity flips on every smoothing tick).
    const targetLockedKey = yolo.target?.track_id ?? null;
    const setFpsRef = useRef(yolo.setFPSMode);
    setFpsRef.current = yolo.setFPSMode;

    useEffect(() => {
        if (!effectiveAi) return;
        const hasLock = targetLockedKey != null;
        setFpsRef.current(hasLock ? 'focus' : 'explore');
    }, [targetLockedKey, effectiveAi]);

    // ─── Sentinel countdown ──────────────────────────────────────────
    useEffect(() => {
        if (!sentinelActive) {
            setSentinelSecondsLeft(0);
            return;
        }
        const tick = () => {
            const remaining = Math.max(
                0,
                Math.ceil((sentinelEndAtRef.current - Date.now()) / 1000)
            );
            setSentinelSecondsLeft(remaining);
            if (remaining <= 0) {
                setSentinelActive(false);
                Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                ).catch(() => {});
            }
        };
        tick();
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [sentinelActive]);

    // ─── Sentinel: poll the latest predictions every 800ms ───────────
    //
    // We can't react to every predictions change here — the smoothing
    // loop fires ~30Hz and we'd queue captures in a runaway loop.
    // Instead, on a fixed timer we read the *current* predictions via a
    // ref, filter by cooldown-per-track and enqueue one batch.
    const predictionsRef = useRef<ScaledPrediction[]>([]);
    predictionsRef.current = yolo.predictions;

    useEffect(() => {
        if (!sentinelActive) return;
        let inFlight = false;

        const tick = async () => {
            if (inFlight) return;
            const preds = predictionsRef.current;
            if (preds.length === 0) return;

            const now = Date.now();
            const eligible = preds
                .filter((p) => p.score >= SENTINEL_MIN_SCORE)
                .filter((p) => {
                    if (p.track_id == null) return true;
                    const lastSeen = lastSentinelByTrack.current.get(p.track_id) ?? 0;
                    return now - lastSeen > 4000; // 4s cooldown per track
                })
                .slice(0, SENTINEL_BATCH_LIMIT);

            if (eligible.length === 0) return;

            inFlight = true;
            try {
                const frame = await captureOnce({ quality: 0.55 });
                if (!frame) return;
                for (const p of eligible) {
                    if (p.track_id != null) {
                        lastSentinelByTrack.current.set(p.track_id, now);
                    }
                    enqueue(buildCaptureInput({
                        prediction: p,
                        frame,
                        location: locationRef.current,
                        heading: headingRef.current,
                        missionId,
                        source: 'sentinel',
                    }));
                }
            } finally {
                inFlight = false;
            }
        };

        const id = setInterval(tick, 800);
        return () => clearInterval(id);
    }, [sentinelActive, captureOnce, enqueue, missionId]);

    // ─── Public actions ──────────────────────────────────────────────
    const toggleSentinel = useCallback(() => {
        if (sentinelActive) {
            setSentinelActive(false);
            return;
        }
        sentinelEndAtRef.current = Date.now() + sentinelDurationCfg * 1000;
        setSentinelActive(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
            () => {}
        );
    }, [sentinelActive, sentinelDurationCfg]);

    const quickCapture = useCallback(async () => {
        // Cooldown 800ms para no spammear
        const now = Date.now();
        if (now - lastQuickCaptureRef.current < 800) return;
        lastQuickCaptureRef.current = now;

        const frame = await captureOnce({ quality: 0.7 });
        if (!frame) return;

        // Use the central target if available; otherwise enqueue as generic
        const target = yolo.target;
        const input = buildCaptureInput({
            prediction: target,
            frame,
            location: locationRef.current,
            heading: headingRef.current,
            missionId,
            source: 'quick_capture',
        });
        enqueue(input);
    }, [captureOnce, enqueue, yolo.target, missionId]);

    return useMemo<UseARCameraReturn>(
        () => ({
            aiOn,
            setAiOn,
            engineStatus: yolo.status,
            engineInfo: yolo.statusInfo,

            predictions: yolo.predictions,
            target: yolo.target,
            frameSize: yolo.frameSize,

            queueSummary,
            retryFailed,

            sentinelActive,
            sentinelSecondsLeft,
            toggleSentinel,

            quickCapture,

            streamStatus,
            frameCount,
            droppedCount,
            autoPaused,
        }),
        [
            aiOn,
            yolo.status,
            yolo.statusInfo,
            yolo.predictions,
            yolo.target,
            yolo.frameSize,
            queueSummary,
            retryFailed,
            sentinelActive,
            sentinelSecondsLeft,
            toggleSentinel,
            quickCapture,
            streamStatus,
            frameCount,
            droppedCount,
            autoPaused,
        ]
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface BuildCaptureArgs {
    prediction: ScaledPrediction | null;
    frame: CapturedFrame;
    location: { lat: number; lng: number } | null;
    heading: number;
    missionId?: string | null;
    source: 'quick_capture' | 'sentinel';
}

function classifyType(yoloClass: string | undefined): CaptureInput['type'] {
    if (!yoloClass) return 'object';
    const c = yoloClass.toLowerCase();
    if (c === 'person') return 'persona';
    // Could be expanded with other YOLO classes -> 'poi'
    return 'object';
}

function buildName(yoloClass: string | undefined, source: string): string {
    const base = yoloClass ? yoloClass : 'objeto';
    const stamp = new Date().toTimeString().slice(0, 5); // HH:MM
    return `${base} ${stamp} (${source})`;
}

function buildCaptureInput({
    prediction,
    frame,
    location,
    heading,
    missionId,
    source,
}: BuildCaptureArgs): CaptureInput {
    return {
        type: classifyType(prediction?.class),
        name: buildName(prediction?.class, source === 'sentinel' ? 'auto' : 'manual'),
        class_name: prediction?.class,
        confidence: prediction?.score,
        bbox: prediction?.bbox,
        track_id: prediction?.track_id ?? null,
        image_base64: frame.base64,
        location: location ?? null,
        heading,
        mission_id: missionId ?? null,
        metadata: {
            source,
            frame_width: frame.width,
            frame_height: frame.height,
            distance_m: prediction?.distance,
        },
    };
}
