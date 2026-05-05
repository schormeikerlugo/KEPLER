/**
 * useCameraStream — Continuous frame capture for `expo-camera`.
 *
 * Purpose
 * -------
 * `expo-camera` does not expose a Frame Processor (that's vision-camera).
 * To stream frames into the YOLO backend, we have to call
 * `cameraRef.current.takePictureAsync({ base64: true, ... })` in a loop.
 *
 * Realistic FPS on Android mid-tier: 2–4 FPS. iOS modern: 4–6 FPS. That's
 * enough for "explore" mode (the engine throttles to 333ms anyway).
 *
 * Important traits
 * ----------------
 *   • **Drop, don't queue.** If a `takePictureAsync` is still in flight when
 *     the next interval fires, we skip — never enqueue. Avoids the
 *     pathological backlog that crashes mid-tier Androids.
 *
 *   • **Single in-flight promise.** Tracked with `inFlightRef`.
 *
 *   • **`skipProcessing: true`** for ~30% lower latency at the cost of
 *     possibly-wrong EXIF rotation (we don't display the frame, only send it).
 *
 *   • **`shutterSound: false`** — we're streaming, not taking photos.
 *
 *   • **`exif: false`** — saves bytes.
 *
 *   • **Quality 0.5** (lower than web's 0.6) — JPEG base64 in RN is
 *     surprisingly heavy on the JS bridge. 0.5 keeps payload <60 KB at
 *     640×640 native.
 *
 *   • **Pause-aware.** When `enabled` flips to false, the interval clears
 *     and any in-flight promise is dropped on resolve.
 *
 *   • **No leaks.** Cleanup in `useEffect` return.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CameraRefLike, CameraStreamStatus, CapturedFrame } from './cameraTypes';

interface UseCameraStreamParams {
    cameraRef: CameraRefLike;
    /** While false, no frames are captured. Default false. */
    enabled: boolean;
    /** Target capture interval in ms. Default 333 (~3 FPS). */
    intervalMs?: number;
    /** JPEG quality 0..1. Default 0.5. */
    quality?: number;
    /** Called for each successful frame capture. */
    onFrame?: (frame: CapturedFrame) => void;
    /** Called when capture fails. */
    onError?: (error: Error) => void;
}

interface UseCameraStreamReturn {
    status: CameraStreamStatus;
    /** Frames successfully captured since mount. */
    frameCount: number;
    /** Frames dropped because previous capture was still in flight. */
    droppedCount: number;
    /** Last captureMs (ms). 0 if no frame yet. */
    lastCaptureMs: number;
    /** Force capture a single frame outside the loop (for QuickCapture). */
    captureOnce: (opts?: { quality?: number }) => Promise<CapturedFrame | null>;
}

const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_QUALITY = 0.45;

export function useCameraStream({
    cameraRef,
    enabled,
    intervalMs = DEFAULT_INTERVAL_MS,
    quality = DEFAULT_QUALITY,
    onFrame,
    onError,
}: UseCameraStreamParams): UseCameraStreamReturn {
    const [status, setStatus] = useState<CameraStreamStatus>('idle');
    const [frameCount, setFrameCount] = useState(0);
    const [droppedCount, setDroppedCount] = useState(0);
    const [lastCaptureMs, setLastCaptureMs] = useState(0);

    // Mutable refs avoid re-creating the loop when callbacks change
    const onFrameRef = useRef(onFrame);
    const onErrorRef = useRef(onError);
    const inFlightRef = useRef(false);
    const cancelledRef = useRef(false);
    const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

    onFrameRef.current = onFrame;
    onErrorRef.current = onError;

    /** Take a single frame. Returns null if camera not ready or in flight. */
    const captureOnce = useCallback(
        async (opts?: { quality?: number }): Promise<CapturedFrame | null> => {
            const cam = cameraRef.current;
            if (!cam) return null;

            const t0 = Date.now();
            try {
                const photo = await cam.takePictureAsync({
                    quality: opts?.quality ?? quality,
                    base64: true,
                    exif: false,
                    skipProcessing: true,
                    shutterSound: false,
                });

                if (!photo || !photo.base64) return null;

                const frame: CapturedFrame = {
                    base64: photo.base64,
                    width: photo.width,
                    height: photo.height,
                    captureMs: Date.now() - t0,
                    timestamp: Date.now(),
                };
                return frame;
            } catch (e: any) {
                onErrorRef.current?.(e instanceof Error ? e : new Error(String(e)));
                return null;
            }
        },
        [cameraRef, quality]
    );

    // Main loop
    useEffect(() => {
        if (!enabled) {
            setStatus('idle');
            return;
        }

        cancelledRef.current = false;
        inFlightRef.current = false;
        setStatus('starting');

        const tick = async () => {
            if (cancelledRef.current) return;

            const cam = cameraRef.current;
            if (!cam) return;

            // Drop if previous capture still resolving
            if (inFlightRef.current) {
                setDroppedCount((c) => c + 1);
                return;
            }

            inFlightRef.current = true;
            const t0 = Date.now();

            try {
                const photo = await cam.takePictureAsync({
                    quality,
                    base64: true,
                    exif: false,
                    skipProcessing: true,
                    shutterSound: false,
                });

                if (cancelledRef.current) return;
                if (!photo || !photo.base64) return;

                const captureMs = Date.now() - t0;
                const frame: CapturedFrame = {
                    base64: photo.base64,
                    width: photo.width,
                    height: photo.height,
                    captureMs,
                    timestamp: Date.now(),
                };

                setStatus('streaming');
                setFrameCount((c) => c + 1);
                setLastCaptureMs(captureMs);
                onFrameRef.current?.(frame);
            } catch (e: any) {
                if (cancelledRef.current) return;
                setStatus('error');
                onErrorRef.current?.(e instanceof Error ? e : new Error(String(e)));
            } finally {
                inFlightRef.current = false;
            }
        };

        // Kick off immediately, then on interval
        tick();
        intervalIdRef.current = setInterval(tick, intervalMs);

        return () => {
            cancelledRef.current = true;
            if (intervalIdRef.current) {
                clearInterval(intervalIdRef.current);
                intervalIdRef.current = null;
            }
        };
    }, [enabled, intervalMs, quality, cameraRef]);

    return {
        status,
        frameCount,
        droppedCount,
        lastCaptureMs,
        captureOnce,
    };
}
