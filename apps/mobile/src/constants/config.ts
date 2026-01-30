/**
 * KEPLER Mobile - Configuration Constants
 * 
 * Central configuration file for the mobile app.
 * All configurable values should be defined here for easy maintenance.
 * 
 * @module constants/config
 */

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * Backend API base URL
 * Change this to your local IP when testing on physical device
 */
export const API_BASE_URL = 'http://192.168.68.114:8000';

/**
 * API request timeout in milliseconds
 */
export const API_TIMEOUT = 5000;

/**
 * Data refresh interval in milliseconds (telemetry, missions, etc.)
 */
export const REFRESH_INTERVAL = 5000;


// =============================================================================
// THEME COLORS
// =============================================================================

/**
 * Primary color palette - matches web design
 */
export const COLORS = {
    // Backgrounds
    background: '#000000',
    backgroundSecondary: '#1a1a1a',
    backgroundTertiary: '#252525',

    // Accent colors
    cyan: '#3fa8ff',
    cyanLight: 'rgba(63, 168, 255, 0.8)',
    cyanDim: 'rgba(63, 168, 255, 0.3)',

    // Status colors
    success: '#00ff88',
    warning: '#ffaa00',
    error: '#ff4444',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#666666',

    // Borders
    border: '#333333',
    borderActive: '#3fa8ff',
} as const;


// =============================================================================
// TYPOGRAPHY
// =============================================================================

/**
 * Font sizes used throughout the app
 */
export const FONT_SIZES = {
    xs: 8,
    sm: 10,
    md: 12,
    lg: 14,
    xl: 16,
    xxl: 18,
    xxxl: 20,
    title: 24,
} as const;

/**
 * Letter spacing for different text styles
 */
export const LETTER_SPACING = {
    normal: 0,
    wide: 2,
    wider: 4,
    widest: 8,
} as const;


// =============================================================================
// SPACING & LAYOUT
// =============================================================================

/**
 * Consistent spacing values
 */
export const SPACING = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
} as const;

/**
 * Border radius values
 */
export const RADIUS = {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
} as const;


// =============================================================================
// ANIMATION DURATIONS
// =============================================================================

/**
 * Animation timing values in milliseconds
 */
export const ANIMATION = {
    fast: 200,
    normal: 500,
    slow: 800,
    scanLine: 800,
    glowPulse: 2000,
} as const;


// =============================================================================
// SCREEN NAMES
// =============================================================================

/**
 * Navigation screen names - use these instead of magic strings
 */
export const SCREENS = {
    LOGIN: 'Login',
    DASHBOARD: 'Dashboard',
    MAP: 'Map',
    ARCHIVES: 'Archives',
    PROFILE: 'Profile',
    AR_CAMERA: 'ARCamera',
} as const;


// =============================================================================
// APP METADATA
// =============================================================================

export const APP_INFO = {
    name: 'KEPLER',
    version: '0.5.0',
    description: 'Sistema de Exploración con IA',
} as const;
