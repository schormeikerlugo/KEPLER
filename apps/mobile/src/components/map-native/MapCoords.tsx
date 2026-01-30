/**
 * KEPLER Mobile - Coordinates Widget
 * Displays LAT, LNG, ZOOM in real-time
 */
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    ViewStyle,
} from 'react-native';

interface MapCoordsProps {
    /** Latitude value */
    lat: number;
    /** Longitude value */
    lng: number;
    /** Zoom level */
    zoom: number;
    /** Custom style */
    style?: ViewStyle;
}

/**
 * Coordinate display widget
 * Shows current map center position and zoom level
 */
export function MapCoords({ lat, lng, zoom, style }: MapCoordsProps) {
    return (
        <View style={[styles.container, style]}>
            <View style={styles.row}>
                <Text style={styles.label}>LAT</Text>
                <Text style={styles.value}>{lat.toFixed(5)}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.label}>LNG</Text>
                <Text style={styles.value}>{lng.toFixed(5)}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.label}>ZOOM</Text>
                <Text style={styles.value}>{zoom.toFixed(1)}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        right: 16,
        backgroundColor: 'rgba(10, 15, 20, 0.9)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(0, 247, 255, 0.2)',
        minWidth: 130,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    label: {
        fontSize: 10,
        color: '#446688',
        fontWeight: '600',
        letterSpacing: 1,
    },
    value: {
        fontSize: 12,
        color: '#00f7ff',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontWeight: '500',
    },
});

export default MapCoords;
