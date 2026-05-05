/**
 * Types for the mobile capture queue.
 * Field names match the backend `CaptureRequest` schema in
 * `backend/app/api/endpoints/captures.py`.
 */

export type CaptureType = 'persona' | 'poi' | 'object';

export type CaptureStatus =
    | 'pending'      // waiting to be sent
    | 'processing'   // batch in flight
    | 'done'         // backend accepted
    | 'failed';      // exceeded retries

export interface Coords {
    lat: number;
    lng: number;
}

/** Payload the user enqueues. The queue augments it with id/status/timestamps. */
export interface CaptureInput {
    type: CaptureType;
    name: string;
    class_name?: string;
    confidence?: number;
    bbox?: [number, number, number, number];
    track_id?: number | null;
    image_base64: string;        // raw base64 (no data: prefix needed)
    location?: Coords | null;
    heading?: number | null;
    mission_id?: string | null;
    metadata?: Record<string, any>;
}

export interface QueueItem extends CaptureInput {
    id: string;
    status: CaptureStatus;
    attempts: number;
    createdAt: string;            // ISO 8601 used as `captured_at` on the wire
    lastError?: string;
}

export interface QueueSummary {
    pending: number;
    processing: number;
    failed: number;
    done: number;
    total: number;
    /** Last batch result (for UI feedback). */
    lastBatch?: {
        processed: number;
        failed: number;
        reIds: number;
        errorLogs: string[];
    };
}

export interface BatchResultItem {
    success: boolean;
    id?: string;
    name?: string;
    error?: string;
    re_id?: { matched: boolean; name?: string; similarity?: number } | null;
}

export interface BatchResponse {
    success: boolean;
    processed: number;
    failed: number;
    re_identifications: number;
    results?: BatchResultItem[];
}
