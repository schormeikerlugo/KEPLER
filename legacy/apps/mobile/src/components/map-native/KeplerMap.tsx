/**
 * KEPLER Mobile - Main Map Component
 * Native MapLibre implementation with Odradek vector style
 */
import React, { useRef, useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { odradekStyle } from './styles/odradek';

// Initialize MapLibre - required before using any components
MapLibreGL.setAccessToken(null);

interface KeplerMapProps {
    /** Initial center coordinates [lng, lat] */
    center?: [number, number];
    /** Initial zoom level */
    zoom?: number;
    /** Called when map moves/zooms */
    onRegionChange?: (region: { lat: number; lng: number; zoom: number }) => void;
    /** Called when map is ready */
    onMapReady?: () => void;
    /** Reference to camera for programmatic control */
    cameraRef?: React.RefObject<any>;
}

/**
 * Main KEPLER map component using native MapLibre
 * Renders with Odradek vector style (same as web/desktop)
 */
export function KeplerMap({
    center = [-66.9036, 10.4806], // Venezuela default
    zoom = 14,
    onRegionChange,
    onMapReady,
    cameraRef: externalCameraRef,
}: KeplerMapProps) {
    const internalCameraRef = useRef<any>(null);
    const cameraRef = externalCameraRef || internalCameraRef;
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const handleRegionChange = useCallback(() => {
        // This will be called on region change
        // We can get camera position via ref if needed
    }, []);

    const handleMapLoaded = useCallback(() => {
        setIsLoading(false);
        onMapReady?.();
    }, [onMapReady]);

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MapLibreGL.MapView
                style={styles.map}
                mapStyle={JSON.stringify(odradekStyle)}
                logoEnabled={false}
                attributionEnabled={false}
                onDidFinishLoadingMap={handleMapLoaded}
                onRegionDidChange={handleRegionChange}
            >
                <MapLibreGL.Camera
                    ref={cameraRef}
                    defaultSettings={{
                        centerCoordinate: center,
                        zoomLevel: zoom,
                    }}
                    animationMode="flyTo"
                    animationDuration={1000}
                />
            </MapLibreGL.MapView>

            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#00f7ff" />
                    <Text style={styles.loadingText}>Cargando mapa vectorial...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0f14',
    },
    map: {
        flex: 1,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10, 15, 20, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#00f7ff',
        fontSize: 14,
        fontWeight: '500',
    },
    errorContainer: {
        flex: 1,
        backgroundColor: '#0a0f14',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    errorText: {
        color: '#ff6b6b',
        fontSize: 14,
        textAlign: 'center',
    },
});

export default KeplerMap;
