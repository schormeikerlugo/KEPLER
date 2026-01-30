/**
 * Application Constants
 * @module @kepler/shared/constants/app
 * 
 * App-wide constants and limits
 */

/**
 * App metadata
 */
export const APP = {
    NAME: 'KEPLER',
    VERSION: '0.5.0',
    CODENAME: 'Holographic Interface',
} as const;

/**
 * Mission limits
 */
export const MISSION = {
    MAX_ACTIVE: 1,              // Only 1 active mission at a time
    CODE_LENGTH: 8,             // Mission code length
    MIN_TITLE_LENGTH: 3,
    MAX_TITLE_LENGTH: 100,
} as const;

/**
 * Detection/AI settings
 */
export const DETECTION = {
    CONFIDENCE_THRESHOLD: 0.5,  // Minimum confidence to show
    MAX_DETECTIONS: 20,         // Max objects per frame
    TRACK_MAX_AGE: 30,          // Frames before losing track
    NMS_THRESHOLD: 0.45,        // Non-max suppression
} as const;

/**
 * Image settings
 */
export const IMAGE = {
    MAX_WIDTH: 1920,
    MAX_HEIGHT: 1080,
    QUALITY: 0.85,              // JPEG quality
    THUMBNAIL_SIZE: 200,
    FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/**
 * Cache settings
 */
export const CACHE = {
    SESSION_TTL: 60 * 60 * 24,      // 24 hours
    MODEL_CACHE_KEY: 'kepler_yolo_model',
    MISSION_CACHE_KEY: 'kepler_active_mission',
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
} as const;
