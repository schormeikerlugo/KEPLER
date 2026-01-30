/**
 * UI Theme Constants
 * @module @kepler/shared/constants/theme
 * 
 * Design tokens for consistent styling across platforms
 * These mirror the CSS variables in apps/web/src/css/tokens.css
 */

/**
 * Color palette - Cyberpunk/Sci-Fi theme
 */
export const COLORS = {
    // Primary colors
    PRIMARY: '#3FA8FF',      // Cyan - main accent
    PRIMARY_LIGHT: '#6BC1FF',
    PRIMARY_DARK: '#2A8AD8',

    // Semantic colors
    SUCCESS: '#00d4aa',      // Green - confirmations
    WARNING: '#ffaa00',      // Orange - warnings
    ERROR: '#ff4444',        // Red - errors/danger
    INFO: '#3FA8FF',         // Cyan - informational

    // Background layers
    BACKDROP: '#0a0f19',     // Deep space background
    SURFACE: '#0d1520',      // Card backgrounds
    SURFACE_LIGHT: '#141d2a',

    // Text colors
    TEXT_PRIMARY: '#ffffff',
    TEXT_SECONDARY: 'rgba(255, 255, 255, 0.7)',
    TEXT_MUTED: 'rgba(255, 255, 255, 0.4)',

    // Borders and glows
    BORDER: 'rgba(63, 168, 255, 0.2)',
    GLOW_CYAN: 'rgba(63, 168, 255, 0.3)',
    GLOW_RED: 'rgba(255, 68, 68, 0.3)',
} as const;

/**
 * Spacing scale (in pixels)
 */
export const SPACING = {
    XS: 4,
    SM: 8,
    MD: 16,
    LG: 24,
    XL: 32,
    XXL: 48,
} as const;

/**
 * Border radius values
 */
export const RADIUS = {
    SM: 4,
    MD: 8,
    LG: 12,
    XL: 16,
    FULL: 9999,
} as const;

/**
 * Typography sizes
 */
export const FONT_SIZE = {
    XS: 10,
    SM: 12,
    MD: 14,
    LG: 16,
    XL: 20,
    XXL: 24,
    DISPLAY: 32,
} as const;

/**
 * Font family
 */
export const FONT_FAMILY = {
    PRIMARY: 'Jura',
    MONO: 'JetBrains Mono',
    FALLBACK: 'system-ui, sans-serif',
} as const;

/**
 * Z-index layers
 */
export const Z_INDEX = {
    BASE: 0,
    DROPDOWN: 100,
    MODAL: 200,
    TOAST: 300,
    TOOLTIP: 400,
    OVERLAY: 500,
} as const;

/**
 * Animation durations (in ms)
 */
export const ANIMATION = {
    FAST: 150,
    NORMAL: 250,
    SLOW: 400,
    VERY_SLOW: 600,
} as const;
