/**
 * DashboardQuickControls Component
 * Quick action buttons on the right side
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';

interface DashboardQuickControlsProps {
    topInset: number;
    onARPress: () => void;
    onMapPress: () => void;
    onRefreshPress: () => void;
}

export function DashboardQuickControls({
    topInset,
    onARPress,
    onMapPress,
    onRefreshPress,
}: DashboardQuickControlsProps) {
    return (
        <View style={[styles.quickControls, { top: topInset + 16 }]}>
            <TouchableOpacity style={styles.quickBtn} onPress={onARPress}>
                <Text style={styles.quickBtnIcon}>📷</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={onMapPress}>
                <Text style={styles.quickBtnIcon}>🗺️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={onRefreshPress}>
                <Text style={styles.quickBtnIcon}>🔄</Text>
            </TouchableOpacity>
        </View>
    );
}
