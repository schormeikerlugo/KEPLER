/**
 * Validation Utilities
 * @module @kepler/shared/utils/validation
 * 
 * Pure validation functions for forms and data
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 * @returns Error message or null if valid
 */
export function validatePassword(password: string): string | null {
    if (password.length < 6) {
        return 'La contraseña debe tener al menos 6 caracteres';
    }
    return null;
}

/**
 * Validate mission title
 */
export function validateMissionTitle(title: string): string | null {
    const trimmed = title.trim();

    if (trimmed.length < 3) {
        return 'El título debe tener al menos 3 caracteres';
    }

    if (trimmed.length > 100) {
        return 'El título no puede exceder 100 caracteres';
    }

    return null;
}

/**
 * Check if coordinates are valid
 */
export function isValidCoordinates(lat: number, lng: number): boolean {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        !isNaN(lat) && !isNaN(lng)
    );
}

/**
 * Check if confidence score is valid
 */
export function isValidConfidence(confidence: number): boolean {
    return typeof confidence === 'number' && confidence >= 0 && confidence <= 1;
}
