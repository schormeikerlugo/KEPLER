/**
 * MapQuickControls Component
 * Quick action buttons on the right side of the map
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';

interface MapQuickControlsProps {
    topInset: number;
    layerIcon: string;
    disabled: boolean;
    onLocationPress: () => void;
    onLayerPress: () => void;
}

export function MapQuickControls({
    topInset,
    layerIcon,
    disabled,
    onLocationPress,
    onLayerPress,
}: MapQuickControlsProps) {
    return (
        <View style={[styles.quickControls, { top: topInset + 16 }]}>
            <TouchableOpacity
                style={styles.quickBtn}
                onPress={onLocationPress}
                disabled={disabled}
            >
                <Text style={styles.quickBtnIcon}>🎯</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.quickBtn}
                onPress={onLayerPress}
                disabled={disabled}
            >
                <Text style={styles.quickBtnIcon}>{layerIcon}</Text>
            </TouchableOpacity>
        </View>
    );
}
