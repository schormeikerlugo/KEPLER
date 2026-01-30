/**
 * Utils Barrel Export
 * @module @kepler/shared/utils
 * 
 * Re-exports all utility functions
 */

// Validation utilities
export {
    isValidEmail,
    validatePassword,
    validateMissionTitle,
    isValidCoordinates,
    isValidConfidence,
} from './validation';

// Formatting utilities
export {
    formatDate,
    formatDateTime,
    formatRelativeTime,
    formatConfidence,
    formatCoordinates,
    formatDuration,
    formatFileSize,
    truncateText,
} from './format';

// Platform utilities
export {
    detectPlatform,
    isDevelopment,
    hasWebGL,
    hasCameraSupport,
    hasGeolocation,
    getDeviceInfo,
} from './platform';

// Mission utilities
export {
    generateMissionCode,
    calculateMissionDuration,
    isMissionActive,
    getMissionStatusColor,
    getMissionStatusLabel,
    sortMissionsByDate,
} from './mission';
