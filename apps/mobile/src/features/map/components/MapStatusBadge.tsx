/**
 * MapStatusBadge Component
 * Shows GPS/map ready status
 */

import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

interface MapStatusBadgeProps {
    bottomInset: number;
    isReady: boolean;
}

export function MapStatusBadge({
    bottomInset,
    isReady,
}: MapStatusBadgeProps) {
    return (
        <View style={[styles.statusBadge, { bottom: bottomInset + 20 }]}>
            <View style={[styles.statusDot, isReady && styles.statusOnline]} />
            <Text style={styles.statusText}>
                {isReady ? 'GPS ACTIVO' : 'CARGANDO'}
            </Text>
        </View>
    );
}
