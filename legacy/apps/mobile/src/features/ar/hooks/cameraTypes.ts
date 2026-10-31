/**
 * Shared camera-stream types for the AR module.
 */

import type { RefObject } from 'react';
import type { CameraView } from 'expo-camera';

export type CameraStreamStatus =
    | 'idle'
    | 'starting'
    | 'streaming'
    | 'error';

export interface CapturedFrame {
    base64: string;          // raw base64 (no data: prefix)
    width: number;
    height: number;
    /** Time spent in takePictureAsync in ms (for diagnostics). */
    captureMs: number;
    /** Local timestamp at capture. */
    timestamp: number;
}

/**
 * Why we accept a generic ref shape:
 *   `useRef<CameraView>` is the standard, but consumers may also pass a
 *   forwarded ref. Keep it loose to avoid friction.
 */
export type CameraRefLike = RefObject<CameraView | null>;
