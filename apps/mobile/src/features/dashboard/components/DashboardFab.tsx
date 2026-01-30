/**
 * DashboardFab Component
 * Floating action button for menu toggle
 */

import React from 'react';
import { TouchableOpacity, Animated } from 'react-native';
import { styles } from '../styles';

interface DashboardFabProps {
    topInset: number;
    fabRotate: Animated.AnimatedInterpolation<string>;
    onPress: () => void;
}

export function DashboardFab({
    topInset,
    fabRotate,
    onPress,
}: DashboardFabProps) {
    return (
        <TouchableOpacity
            style={[styles.fab, { top: topInset + 16 }]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Animated.Text style={[styles.fabIcon, { transform: [{ rotate: fabRotate }] }]}>
                ☰
            </Animated.Text>
        </TouchableOpacity>
    );
}
