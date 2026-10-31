/**
 * KEPLER Mobile - Telemetry Card Component
 * 
 * Individual telemetry card showing a single metric.
 * Used in the telemetry row on Dashboard.
 * 
 * @module components/TelemetryCard
 */

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES } from '../constants/config';

// =============================================================================
// TYPES
// =============================================================================

interface TelemetryCardProps {
    /** The numeric value to display */
    value: number;
    /** Unit/suffix to append (e.g., "°C", "%") */
    unit?: string;
    /** Label text below the value */
    label: string;
    /** Number of decimal places for the value */
    decimals?: number;
    /** Animated opacity for glow effect */
    glowOpacity?: Animated.Value;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * TelemetryCard - Displays a single telemetry metric
 * 
 * @param props - TelemetryCardProps
 * @returns Animated card with value, unit, and label
 * 
 * @example
 * <TelemetryCard 
 *   value={23.5} 
 *   unit="°C" 
 *   label="TEMPERATURA"
 *   decimals={0}
 * />
 */
export function TelemetryCard({
    value,
    unit = '',
    label,
    decimals = 0,
    glowOpacity
}: TelemetryCardProps) {
    // Format value with specified decimal places
    const formattedValue = value.toFixed(decimals);

    // Create animated style if glowOpacity is provided
    const animatedStyle = glowOpacity ? { shadowOpacity: glowOpacity } : {};

    return (
        <Animated.View style={[styles.card, animatedStyle]}>
            <Text style={styles.value}>
                {formattedValue}{unit}
            </Text>
            <Text style={styles.label}>{label}</Text>
        </Animated.View>
    );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: COLORS.backgroundTertiary,
        borderRadius: RADIUS.lg,
        paddingVertical: SPACING.lg,
        paddingHorizontal: SPACING.sm,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
        // Glow effect
        shadowColor: COLORS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        elevation: 5,
    },
    value: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
        // Text glow
        textShadowColor: COLORS.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 4,
    },
    label: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.textMuted,
        letterSpacing: 1,
    },
});

export default TelemetryCard;
