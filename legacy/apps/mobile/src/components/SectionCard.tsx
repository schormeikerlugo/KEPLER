/**
 * KEPLER Mobile - Section Card Component
 * 
 * Reusable card container for dashboard sections.
 * Used for POIs, Minerals, Missions, etc.
 * 
 * @module components/SectionCard
 */

import React, { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES } from '../constants/config';

// =============================================================================
// TYPES
// =============================================================================

interface SectionCardProps {
    /** Emoji or icon for the section */
    icon: string;
    /** Section title */
    title: string;
    /** Count badge value (number or null) */
    count?: number | null;
    /** Whether to show count as large number (like Missions) */
    largeCount?: boolean;
    /** Child content to render */
    children: ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * SectionCard - Container for dashboard sections
 * 
 * @param props - SectionCardProps
 * @returns Card with header, optional count badge, and content area
 * 
 * @example
 * <SectionCard icon="🚀" title="Missions" count={21} largeCount>
 *   <MissionsList missions={missions} />
 * </SectionCard>
 */
export function SectionCard({
    icon,
    title,
    count,
    largeCount = false,
    children
}: SectionCardProps) {
    return (
        <View style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Text style={styles.icon}>{icon}</Text>
                    <Text style={styles.title}>{title}</Text>
                </View>

                {/* Count Badge or Large Count */}
                {count !== undefined && count !== null && (
                    largeCount ? (
                        <Text style={styles.largeCount}>{count}</Text>
                    ) : (
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{count}</Text>
                        </View>
                    )
                )}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Content */}
            {children}
        </View>
    );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * NoDataMessage - Placeholder when section has no data
 */
export function NoDataMessage({ message = 'No data available' }: { message?: string }) {
    return <Text style={styles.noData}>{message}</Text>;
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.backgroundSecondary,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    icon: {
        fontSize: FONT_SIZES.xl,
    },
    title: {
        fontSize: FONT_SIZES.xl,
        fontWeight: '500',
        color: COLORS.textPrimary,
    },
    countBadge: {
        backgroundColor: COLORS.backgroundTertiary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs,
        borderRadius: RADIUS.sm,
        borderWidth: 1,
        borderColor: COLORS.cyan,
    },
    countText: {
        fontSize: FONT_SIZES.lg,
        color: COLORS.cyan,
        fontWeight: '600',
    },
    largeCount: {
        fontSize: FONT_SIZES.title,
        fontWeight: '600',
        color: COLORS.cyan,
        textShadowColor: COLORS.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING.md,
    },
    noData: {
        color: COLORS.textMuted,
        fontSize: FONT_SIZES.lg,
    },
});

export default SectionCard;
