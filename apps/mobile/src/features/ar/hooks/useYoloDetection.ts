/**
 * useYoloDetection
 * ----------------
 * React hook around `MobileAIEngine`. Owns one WebSocket connection while
 * mounted and exposes:
 *
 *   • `predictions`     — current detections (one snapshot per backend reply)
 *   • `target`          — most central detection (for QuickCapture / focus mode)
 *   • `status`          — connection state for the StatusBadge UI
 *   • `frameSize`       — last frame dims (for DetectionOverlay scaling)
 *   • `sendFrame`       — push a base64 frame to the engine
 *   • `setFPSMode`      — switch explore/focus/rest
 *   • `setPaused`       — temporarily stop sending without closing WS
 *
 * Smoothing strategy
 * ------------------
 * Detection arrives every ~150–300ms. Instead of running a JS smoothing
 * loop (which costs many React re-renders), we publish only when a fresh
 * detection arrives and let `DetectionOverlay` tween each bbox to its
 * new position with `Animated.timing` on the **native driver** (60fps,
 * off the JS thread). That gives the smoothest possible motion without
 * spamming React.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    MobileAIEngine,
    DetectionUpdate,
    EngineStatus,
    FpsMode,
    ScaledPrediction,
} from '../../../services/ai/MobileAIEngine';
import type { FramePayload } from '../../../services/ai/types';
import { configService } from '../../../services/configService';

interface UseYoloDetectionParams {
    /** While false, the hook is fully idle (no WS, no frames). */
    enabled: boolean;
    /** Initial FPS mode. Default 'explore'. */
    initialMode?: FpsMode;
}

interface UseYoloDetectionReturn {
    predictions: ScaledPrediction[];
    target: ScaledPrediction | null;
    status: EngineStatus;
    statusInfo?: string;
    frameSize: { width: number; height: number };
    /** Submit a frame; returns true if accepted. */
    sendFrame: (frame: FramePayload) => boolean;
    setFPSMode: (mode: FpsMode) => void;
    setPaused: (paused: boolean) => void;
    /** Read the latest target lock without re-rendering. */
    hasTargetLock: () => boolean;
}

const EMPTY_FRAME = { width: 0, height: 0 };

export function useYoloDetection(
    { enabled, initialMode = 'explore' }: UseYoloDetectionParams
): UseYoloDetectionReturn {
    const [predictions, setPredictions] = useState<ScaledPrediction[]>([]);
    const [target, setTarget] = useState<ScaledPrediction | null>(null);
    const [status, setStatus] = useState<EngineStatus>('idle');
    const [statusInfo, setStatusInfo] = useState<string | undefined>();
    const [frameSize, setFrameSize] = useState(EMPTY_FRAME);

    const engineRef = useRef<MobileAIEngine | null>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    // Lifecycle: open / close engine when `enabled` flips
    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        const engine = new MobileAIEngine({ initialMode });
        engineRef.current = engine;

        // Publish only when a fresh detection arrives. The overlay uses
        // native-driver Animated transitions to interpolate visually.
        engine.onDetectionUpdate = (update: DetectionUpdate) => {
            if (cancelled) return;
            setFrameSize((prev) =>
                prev.width === update.frameSize.width &&
                prev.height === update.frameSize.height
                    ? prev
                    : update.frameSize
            );
            setPredictions(update.predictions);
            setTarget((prev) => {
                const next = update.target;
                if (prev === next) return prev;
                if (prev == null && next == null) return prev;
                if (
                    prev != null &&
                    next != null &&
                    prev.track_id === next.track_id &&
                    prev.class === next.class
                ) {
                    return prev;
                }
                return next;
            });
        };
        engine.onStatusUpdate = (s, info) => {
            if (cancelled) return;
            setStatus(s);
            setStatusInfo(info);
        };

        engine.init();

        // Reconnect on backend URL change
        const unsub = configService.onChange(() => {
            // Tear down and re-create. New URL will be picked up.
            if (cancelled) return;
            engine.dispose();
            const replacement = new MobileAIEngine({ initialMode });
            replacement.onDetectionUpdate = engine.onDetectionUpdate;
            replacement.onStatusUpdate = engine.onStatusUpdate;
            engineRef.current = replacement;
            replacement.init();
        });

        return () => {
            cancelled = true;
            unsub();
            engine.dispose();
            engineRef.current = null;
            setPredictions([]);
            setTarget(null);
            setStatus('idle');
            setStatusInfo(undefined);
        };
    }, [enabled, initialMode]);

    const sendFrame = useCallback((frame: FramePayload): boolean => {
        const e = engineRef.current;
        if (!e) return false;
        return e.processFrame(frame);
    }, []);

    const setFPSMode = useCallback((mode: FpsMode): void => {
        engineRef.current?.setFPSMode(mode);
    }, []);

    const setPaused = useCallback((paused: boolean): void => {
        engineRef.current?.setPaused(paused);
    }, []);

    const hasTargetLock = useCallback((): boolean => {
        return engineRef.current?.hasTargetLock() ?? false;
    }, []);

    return useMemo(
        () => ({
            predictions,
            target,
            status,
            statusInfo,
            frameSize,
            sendFrame,
            setFPSMode,
            setPaused,
            hasTargetLock,
        }),
        [predictions, target, status, statusInfo, frameSize, sendFrame, setFPSMode, setPaused, hasTargetLock]
    );
}
