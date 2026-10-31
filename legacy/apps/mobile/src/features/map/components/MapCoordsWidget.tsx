/**
 * MapCoordsWidget Component
 * Displays current map coordinates and zoom level
 */

import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

interface MapCoordsWidgetProps {
    bottomInset: number;
    lat: number;
    lng: number;
    zoom: number;
}

export function MapCoordsWidget({
    bottomInset,
    lat,
    lng,
    zoom,
}: MapCoordsWidgetProps) {
    return (
        <View style={[styles.coordsWidget, { bottom: bottomInset + 20 }]}>
            <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>LAT</Text>
                <Text style={styles.coordValue}>{lat.toFixed(5)}</Text>
            </View>
            <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>LNG</Text>
                <Text style={styles.coordValue}>{lng.toFixed(5)}</Text>
            </View>
            <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>ZOOM</Text>
                <Text style={styles.coordValue}>{zoom.toFixed(1)}</Text>
            </View>
        </View>
    );
}
