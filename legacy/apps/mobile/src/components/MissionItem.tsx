/**
 * KEPLER Mobile - Mission Item Component
 * 
 * Individual mission row displayed in the missions section.
 * 
 * @module components/MissionItem
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES } from '../constants/config';
import { Mission } from '../services/api';

// =============================================================================
// TYPES
// =============================================================================

interface MissionItemProps {
    /** Mission data object */
    mission: Mission;
    /** Callback when mission is pressed */
    onPress?: (mission: Mission) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * MissionItem - Displays a single mission row
 * 
 * @param props - MissionItemProps
 * @returns Touchable row with mission code and status
 * 
 * @example
 * <MissionItem 
 *   mission={{ id: '1', code: 'MISION-123', status: 'ACTIVA' }}
 *   onPress={(m) => console.log('Selected:', m.id)}
 * />
 */
export function MissionItem({ mission, onPress }: MissionItemProps) {
    /**
     * Handle press event - calls onPress callback if provided
     */
    const handlePress = () => {
        if (onPress) {
            onPress(mission);
        }
    };

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={handlePress}
            activeOpacity={0.7}
        >
            <Text style={styles.icon}>🚀</Text>
            <View style={styles.content}>
                <Text style={styles.code}>
                    {mission.code} {mission.status}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundTertiary,
        padding: SPACING.lg,
        borderRadius: RADIUS.lg,
        marginTop: SPACING.sm,
        gap: SPACING.md,
    },
    icon: {
        fontSize: 20,
    },
    content: {
        flex: 1,
    },
    code: {
        fontSize: FONT_SIZES.md,
        color: COLORS.textPrimary,
        fontWeight: '500',
    },
});

export default MissionItem;
