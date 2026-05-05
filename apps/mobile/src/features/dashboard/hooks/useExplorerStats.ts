/**
 * useExplorerStats Hook
 * Fetches explorer stats (boot wear, resistance, weather) from backend
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { configService } from '../../../services/configService';

export interface WeatherData {
    temperature: number;
    description: string;
    windSpeed: number;
    humidity: number;
    pressure: number;
    locationName: string;
    isDayTime: boolean;
    emoji: string;
}

export interface ExplorerStatsData {
    shoeCondition: number;  // 0-100 (100 = new)
    resistance: number;     // 0-100
    weather: WeatherData | null;
    missionsCompleted: number;
}

const DEFAULT_WEATHER: WeatherData = {
    temperature: 28,
    description: 'Estable',
    windSpeed: 12,
    humidity: 55,
    pressure: 1013,
    locationName: 'Ubicación desconocida',
    isDayTime: true,
    emoji: '☀️',
};

function getWeatherEmoji(desc: string, isDayTime: boolean): string {
    const d = desc.toLowerCase();
    if (d.includes('lluvia') || d.includes('rain')) return '🌧️';
    if (d.includes('tormenta') || d.includes('storm')) return '⛈️';
    if (d.includes('nublado') || d.includes('cloud')) return '☁️';
    if (d.includes('nieve') || d.includes('snow')) return '❄️';
    return isDayTime ? '☀️' : '🌙';
}

export function useExplorerStats() {
    const [stats, setStats] = useState<ExplorerStatsData>({
        shoeCondition: 100,
        resistance: 100,
        weather: null,
        missionsCompleted: 0,
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            let lat: number | null = null;
            let lng: number | null = null;

            // Try GPS
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                try {
                    const loc = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                    });
                    lat = loc.coords.latitude;
                    lng = loc.coords.longitude;
                } catch { /* GPS failed, continue */ }
            }

            // Build URL
            const baseUrl = await configService.getBackendUrl();
            let url = `${baseUrl}/api/explorer/stats`;
            if (lat && lng) url += `?lat=${lat}&lng=${lng}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const desgaste = data.desgaste_calzado ?? 0;
                const isDayTime = new Date().getHours() >= 6 && new Date().getHours() < 19;

                const weatherRaw = data.clima_actual || data.weather || {};
                const weatherDesc = weatherRaw.descripcion || weatherRaw.description || 'Estable';

                setStats({
                    shoeCondition: Math.max(0, 100 - desgaste),
                    resistance: data.resistencia ?? 100,
                    weather: {
                        temperature: weatherRaw.temperatura ?? weatherRaw.temperature ?? 28,
                        description: weatherDesc,
                        windSpeed: weatherRaw.viento ?? weatherRaw.wind_speed ?? 0,
                        humidity: weatherRaw.humedad ?? weatherRaw.humidity ?? 50,
                        pressure: weatherRaw.presion ?? weatherRaw.pressure ?? 1013,
                        locationName: weatherRaw.location_name ?? weatherRaw.ubicacion ?? 'Mi ubicación',
                        isDayTime,
                        emoji: getWeatherEmoji(weatherDesc, isDayTime),
                    },
                    missionsCompleted: data.misiones_completadas ?? 0,
                });
            } else {
                // Use defaults with mock weather
                setStats(prev => ({ ...prev, weather: DEFAULT_WEATHER }));
            }
        } catch (error) {
            console.log('[ExplorerStats] Error:', error);
            setStats(prev => ({ ...prev, weather: DEFAULT_WEATHER }));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 60000); // Every minute
        return () => clearInterval(interval);
    }, [fetchStats]);

    return { stats, loading, refetch: fetchStats };
}
