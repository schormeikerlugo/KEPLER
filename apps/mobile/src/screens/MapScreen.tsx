/**
 * KEPLER Mobile - Map Screen
 * GPS tracking and mission visualization
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

export default function MapScreen() {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [region, setRegion] = useState({
        latitude: 10.4806,
        longitude: -66.9036,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });

    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);
                setRegion({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });
            }
        })();
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>🗺️ Mapa de Exploración</Text>
            </View>

            <MapView
                style={styles.map}
                region={region}
                onRegionChangeComplete={setRegion}
                showsUserLocation
                showsMyLocationButton
                mapType="satellite"
            >
                {location && (
                    <Marker
                        coordinate={{
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                        }}
                        title="Tu ubicación"
                        description="Posición actual del explorador"
                    />
                )}
            </MapView>

            {/* Info Panel */}
            <View style={styles.infoPanel}>
                <Text style={styles.infoText}>
                    📍 {location ? `${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}` : 'Obteniendo ubicación...'}
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    header: {
        padding: 16,
        backgroundColor: '#0a0a1a',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#00d4ff',
        textAlign: 'center',
    },
    map: {
        flex: 1,
    },
    infoPanel: {
        position: 'absolute',
        bottom: 100,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(10, 10, 26, 0.9)',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2a2a5a',
    },
    infoText: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
    },
});
