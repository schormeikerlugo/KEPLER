/**
 * KEPLER Mobile - Design Theme
 * Matches the web holographic style (Death Stranding inspired)
 */

// Colors - Holographic theme
export const colors = {
    // Backgrounds
    bgPrimary: '#000000',
    bgSecondary: '#111111',
    bgCard: '#212121',
    bgCardLight: '#323232',

    // Holographic cyan (main accent)
    cyan: '#3fa8ff',
    cyanLight: 'rgba(63, 168, 255, 0.8)',
    cyanDim: 'rgba(63, 168, 255, 0.3)',
    cyanGlow: 'rgba(63, 168, 255, 0.5)',

    // Status colors
    success: '#51cf66',
    warning: '#ffd43b',
    error: '#ff6b6b',
    info: '#74c0fc',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#666666',

    // Borders
    border: 'rgba(63, 168, 255, 0.3)',
    borderActive: 'rgba(63, 168, 255, 0.8)',

    // Mars red (secondary accent)
    marsRed: '#ff6b6b',
};

// Typography
export const typography = {
    fontFamily: 'System', // Will use system font, Jura not available natively

    sizes: {
        xs: 10,
        sm: 12,
        md: 14,
        lg: 16,
        xl: 20,
        xxl: 24,
        xxxl: 32,
        title: 40,
    },
};

// Spacing
export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

// Border radius
export const radius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 20,
    full: 9999,
};

// Common styles
export const commonStyles = {
    // Card with holographic border
    card: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
    },

    // Glowing card
    cardGlow: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.cyanDim,
        padding: spacing.lg,
        shadowColor: colors.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },

    // Primary button
    buttonPrimary: {
        backgroundColor: colors.cyan,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        alignItems: 'center' as const,
    },

    // Outline button
    buttonOutline: {
        backgroundColor: 'transparent',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.cyan,
        alignItems: 'center' as const,
    },

    // Text styles
    title: {
        fontSize: typography.sizes.xxxl,
        fontWeight: 'bold' as const,
        color: colors.cyan,
    },

    heading: {
        fontSize: typography.sizes.xl,
        fontWeight: '600' as const,
        color: colors.textPrimary,
    },

    body: {
        fontSize: typography.sizes.md,
        color: colors.textSecondary,
    },

    caption: {
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
    },
};

export default {
    colors,
    typography,
    spacing,
    radius,
    commonStyles,
};
