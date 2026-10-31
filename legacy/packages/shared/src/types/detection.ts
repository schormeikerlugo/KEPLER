/**
 * Detection Types
 * @module @kepler/shared/types/detection
 */

/**
 * Bounding box coordinates [x, y, width, height]
 */
export type BoundingBox = [number, number, number, number];

/**
 * Raw detection from YOLO model
 */
export interface YOLODetection {
    class: string;
    confidence: number;
    bbox: BoundingBox;
    frameId?: number;
}

/**
 * Tracked detection with temporal consistency
 */
export interface TrackedDetection extends YOLODetection {
    trackId: number;
    age: number;
    velocity?: { x: number; y: number };
}

/**
 * Object saved to database after user confirmation
 */
export interface DetectedObject {
    id: string;
    mission_id?: string;
    user_id?: string;
    nombre: string;
    descripcion?: string;
    clasificacion?: string;
    subcategoria?: string;
    genero?: string;
    imagen_url?: string;
    latitud?: number;
    longitud?: number;
    created_at: string;
}

/**
 * Request to save a new detected object
 */
export interface SaveObjectRequest {
    mission_id: string;
    nombre: string;
    clasificacion?: string;
    imagen_base64?: string;
    latitud?: number;
    longitud?: number;
}
