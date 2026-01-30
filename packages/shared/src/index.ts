/**
 * KEPLER Shared Package
 * @module @kepler/shared
 * 
 * Shared types, constants, and utilities across all KEPLER apps
 * (web, desktop, mobile)
 * 
 * @example
 * // Import types
 * import type { Mission, DetectedObject } from '@kepler/shared';
 * 
 * // Import constants
 * import { COLORS, API_CONFIG } from '@kepler/shared';
 * 
 * // Import utilities
 * import { formatDate, detectPlatform } from '@kepler/shared';
 * 
 * // Or import from sub-paths for tree-shaking
 * import { COLORS } from '@kepler/shared/constants';
 * import { formatDate } from '@kepler/shared/utils';
 */

// ============================================================
// Types (re-export all)
// ============================================================
export type {
    // Mission
    Mission,
    MissionStatus,
    MissionStartRequest,
    MissionSummary,
    ClimateSnapshot,
    // Detection
    YOLODetection,
    TrackedDetection,
    DetectedObject,
    SaveObjectRequest,
    BoundingBox,
    // User
    UserProfile,
    UserRank,
    AuthSession,
    LoginCredentials,
    // Telemetry
    TelemetryData,
    NetworkStatus,
    GeoLocation,
    DeviceInfo,
    Platform,
} from './types';

// ============================================================
// Constants (re-export all)
// ============================================================
export {
    // API
    BACKEND,
    SUPABASE,
    OLLAMA,
    FRONTEND,
    API_CONFIG,
    // Theme
    COLORS,
    SPACING,
    RADIUS,
    FONT_SIZE,
    FONT_FAMILY,
    Z_INDEX,
    ANIMATION,
    // App
    APP,
    MISSION,
    DETECTION,
    IMAGE,
    CACHE,
    PAGINATION,
} from './constants';

// ============================================================
// Utils (re-export all)
// ============================================================
export {
    // Validation
    isValidEmail,
    validatePassword,
    validateMissionTitle,
    isValidCoordinates,
    isValidConfidence,
    // Format
    formatDate,
    formatDateTime,
    formatRelativeTime,
    formatConfidence,
    formatCoordinates,
    formatDuration,
    formatFileSize,
    truncateText,
    // Platform
    detectPlatform,
    isDevelopment,
    hasWebGL,
    hasCameraSupport,
    hasGeolocation,
    getDeviceInfo,
    // Mission
    generateMissionCode,
    calculateMissionDuration,
    isMissionActive,
    getMissionStatusColor,
    getMissionStatusLabel,
    sortMissionsByDate,
} from './utils';
