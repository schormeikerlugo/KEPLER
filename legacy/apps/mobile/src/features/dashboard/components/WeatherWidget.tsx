/**
 * WeatherWidget - Current weather conditions display
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WeatherData } from '../hooks/useExplorerStats';

interface Props {
    weather: WeatherData | null;
}

export function WeatherWidget({ weather }: Props) {
    if (!weather) return null;

    return (
        <View style={s.container}>
            <View style={s.mainRow}>
                <Text style={s.emoji}>{weather.emoji}</Text>
                <View>
                    <Text style={s.temp}>{weather.temperature.toFixed(0)}°C</Text>
                    <Text style={s.desc}>{weather.description}</Text>
                </View>
                <View style={s.dayBadge}>
                    <Text style={s.dayText}>{weather.isDayTime ? '☀️ Día' : '🌙 Noche'}</Text>
                </View>
            </View>

            <View style={s.detailsRow}>
                <View style={s.detail}>
                    <Text style={s.detailLabel}>💨 Viento</Text>
                    <Text style={s.detailValue}>{weather.windSpeed.toFixed(0)} km/h</Text>
                </View>
                <View style={s.detail}>
                    <Text style={s.detailLabel}>💧 Humedad</Text>
                    <Text style={s.detailValue}>{weather.humidity.toFixed(0)}%</Text>
                </View>
                <View style={s.detail}>
                    <Text style={s.detailLabel}>🌡️ Presión</Text>
                    <Text style={s.detailValue}>{weather.pressure.toFixed(0)} hPa</Text>
                </View>
            </View>

            <Text style={s.location}>📍 {weather.locationName}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: '#121212',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    emoji: { fontSize: 36 },
    temp: { color: '#fff', fontSize: 24, fontWeight: '700' },
    desc: { color: '#888', fontSize: 12 },
    dayBadge: {
        marginLeft: 'auto',
        backgroundColor: '#1a1a1a',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    dayText: { color: '#aaa', fontSize: 11 },
    detailsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 14,
        backgroundColor: '#1a1a1a',
        borderRadius: 10,
        padding: 12,
    },
    detail: { alignItems: 'center', flex: 1 },
    detailLabel: { color: '#666', fontSize: 10, marginBottom: 4 },
    detailValue: { color: '#fff', fontSize: 13, fontWeight: '600' },
    location: {
        color: '#555',
        fontSize: 11,
        marginTop: 10,
        textAlign: 'center',
    },
});
