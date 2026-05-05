/**
 * useMobileCaptureQueue
 * ---------------------
 * Thin React wrapper around the singleton `captureQueue`.
 *
 *   • Starts the background processor on mount (idempotent — safe to mount
 *     multiple times across the app).
 *   • Exposes a live summary (counts) for the UI counter.
 *   • Exposes `enqueue` for QuickCapture / Sentinel.
 *
 * The processor is NOT stopped on unmount because the queue is global —
 * captures should keep flowing even after the user leaves the AR screen.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import {
    captureQueue,
    QueueSummary,
    CaptureInput,
} from '../../../services/captures';

interface UseMobileCaptureQueueReturn {
    summary: QueueSummary;
    enqueue: (input: CaptureInput) => string;
    retryFailed: () => void;
    clearDone: () => void;
}

const EMPTY: QueueSummary = {
    pending: 0,
    processing: 0,
    failed: 0,
    done: 0,
    total: 0,
};

export function useMobileCaptureQueue(): UseMobileCaptureQueueReturn {
    const [summary, setSummary] = useState<QueueSummary>(EMPTY);
    const startedRef = useRef(false);

    useEffect(() => {
        if (!startedRef.current) {
            captureQueue.start();
            startedRef.current = true;
        }
        const unsub = captureQueue.onChange(setSummary);
        return () => { unsub(); };
    }, []);

    const enqueue = useCallback((input: CaptureInput): string => {
        const id = captureQueue.enqueue(input);
        // Light haptic so the user feels the capture happened
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return id;
    }, []);

    const retryFailed = useCallback(() => {
        captureQueue.retryFailed();
    }, []);

    const clearDone = useCallback(() => {
        captureQueue.clearDone();
    }, []);

    return { summary, enqueue, retryFailed, clearDone };
}
