/**
 * KEPLER Mobile - Map Controls Component
 * Floating control buttons for map interaction
 */
import React from 'react';
import {
    View,
    TouchableOpacity,
    Text,
    StyleSheet,
    ViewStyle,
} from 'react-native';

interface MapControlsProps {
    /** Callback when location button pressed */
    onLocationPress: () => void;
    /** Callback when layer button pressed */
    onLayerPress: () => void;
    /** Callback when refresh button pressed */
    onRefreshPress: () => void;
    /** Current layer icon to display */
    layerIcon: string;
    /** Whether controls are disabled */
    disabled?: boolean;
    /** Custom style for container */
    style?: ViewStyle;
}

/**
 * Floating map controls component
 * Positioned on left side of screen
 */
export function MapControls({
    onLocationPress,
    onLayerPress,
    onRefreshPress,
    layerIcon,
    disabled = false,
    style,
}: MapControlsProps) {
    return (
        <View style={[styles.container, style]}>
            <TouchableOpacity
                style={[styles.button, disabled && styles.buttonDisabled]}
                onPress={onLocationPress}
                disabled={disabled}
                activeOpacity={0.7}
            >
                <Text style={styles.icon}>🎯</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.button, disabled && styles.buttonDisabled]}
                onPress={onLayerPress}
                disabled={disabled}
                activeOpacity={0.7}
            >
                <Text style={styles.icon}>{layerIcon}</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.button}
                onPress={onRefreshPress}
                activeOpacity={0.7}
            >
                <Text style={styles.icon}>🔄</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        gap: 12,
    },
    button: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(10, 15, 20, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 247, 255, 0.3)',
        // Shadow for iOS
        shadowColor: '#00f7ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        // Elevation for Android
        elevation: 5,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    icon: {
        fontSize: 22,
    },
});

export default MapControls;
