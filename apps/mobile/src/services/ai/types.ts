/**
 * Shared types for the YOLO inference subsystem (mobile).
 *
 * Mirrors the wire format of the backend WebSocket at `/api/ws/detect`:
 *   { success: true, predictions: [{ class, score, bbox, track_id? }], image_size: [w, h] }
 *
 * `bbox` is in [x, y, w, h] top-left origin, in the model input space (640x640).
 * The engine scales bboxes back to the source frame size before publishing.
 */

export type FpsMode = 'explore' | 'focus' | 'rest';

export type EngineStatus =
    | 'idle'
    | 'connecting'
    | 'ready'
    | 'error'
    | 'closed';

export interface RawPrediction {
    class: string;
    score: number;
    bbox: [number, number, number, number]; // [x, y, w, h] in model space
    track_id?: number;
}

export interface BackendMessage {
    success?: boolean;
    error?: string;
    predictions?: RawPrediction[];
    image_size?: [number, number];
}

/** Detection scaled to source frame coords + estimated distance. */
export interface ScaledPrediction {
    class: string;
    score: number;
    bbox: [number, number, number, number]; // [x, y, w, h] in frame space
    distance: number;                        // meters (rough estimate)
    track_id?: number;
}

export interface DetectionUpdate {
    predictions: ScaledPrediction[];
    target: ScaledPrediction | null;        // most central prediction
    frameSize: { width: number; height: number };
}

/** Frame payload sent to the engine (capture taken by the camera). */
export interface FramePayload {
    base64: string;                         // raw base64 (no data: prefix needed)
    width: number;                          // source frame width
    height: number;                         // source frame height
}

export interface EngineConfig {
    /** Override the WS URL. Defaults to configService.getWsUrl() + /api/ws/detect */
    wsUrl?: string;
    /** Backend model input size (square). Default 640. */
    inputSize?: number;
    /** Initial FPS mode. Default 'explore'. */
    initialMode?: FpsMode;
}
