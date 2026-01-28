/**
 * KEPLER Mobile - Dashboard Screen
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
} from 'react-native';
import * as Location from 'expo-location';
import { api } from '../services/api';
import type { MainTabScreenProps } from '../navigation/types';

export default function DashboardScreen({ navigation }: MainTabScreenProps<'Dashboard'>) {
    const [activeMission, setActiveMission] = useState<any>(null);
    const [zoneDescription, setZoneDescription] = useState<string>('');
    const [location, setLocation] = useState<Location.LocationObject | null>(null);

    useEffect(() => {
        requestLocationPermission();
    }, []);

    const requestLocationPermission = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({});
            setLocation(loc);
        }
    };

    const startMission = async () => {
        if (!location) {
            alert('Esperando ubicación GPS...');
            return;
        }

        try {
            // Get zone description from backend
            const zoneData = await api.describeZone(
                location.coords.latitude,
                location.coords.longitude
            );

            if (zoneData.success) {
                setZoneDescription(zoneData.description);

                // Start mission with zone info
                const result = await api.startMission({
                    titulo: `Misión ${new Date().toLocaleDateString()}`,
                    zona: zoneData.location_name,
                    descripcion_ia: zoneData.description,
                });

                if (result.success) {
                    setActiveMission(result);
                    // Navigate to AR Camera
                    navigation.getParent()?.navigate('ARCamera', { missionId: result.mission_id });
                }
            }
        } catch (error) {
            console.error('Error starting mission:', error);
            alert('Error al iniciar misión');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.logo}>🔭 KEPLER</Text>
                    <Text style={styles.subtitle}>Sistema de Exploración</Text>
                </View>

                {/* Mission Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                        {activeMission ? '🚀 Misión Activa' : '📍 Nueva Misión'}
                    </Text>

                    {location && (
                        <Text style={styles.locationText}>
                            📍 {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)}
                        </Text>
                    )}

                    {zoneDescription && (
                        <Text style={styles.descriptionText}>{zoneDescription}</Text>
                    )}

                    <TouchableOpacity
                        style={styles.startButton}
                        onPress={startMission}
                    >
                        <Text style={styles.buttonText}>
                            {activeMission ? '📷 Continuar Exploración' : '🚀 Iniciar Misión'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Misiones</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Objetos</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>0 km</Text>
                        <Text style={styles.statLabel}>Explorado</Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    scrollContent: {
        padding: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 20,
    },
    logo: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#00d4ff',
    },
    subtitle: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    card: {
        backgroundColor: '#1a1a3a',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#2a2a5a',
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 12,
    },
    locationText: {
        fontSize: 12,
        color: '#00d4ff',
        marginBottom: 8,
    },
    descriptionText: {
        fontSize: 14,
        color: '#aaa',
        marginBottom: 16,
        lineHeight: 20,
    },
    startButton: {
        backgroundColor: '#00d4ff',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        color: '#0a0a1a',
        fontSize: 16,
        fontWeight: 'bold',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statCard: {
        flex: 1,
        backgroundColor: '#1a1a3a',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 4,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2a2a5a',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#00d4ff',
    },
    statLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
});
