/**
 * useDashboardData Hook
 *
 * Coordinates the two telemetry pipelines:
 *   • REMOTE (every 5 min): backend `/api/realtime-telemetry?lat&lng&speed_mps`
 *     using cached GPS from expo-location.
 *   • LOCAL  (every 2 s):    `useDeviceTelemetry` for battery + network.
 *
 * Missions are fetched alongside the remote tick. The visual scan animation
 * runs on every refresh.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { api, TelemetryData, Mission, TelemetryQuery } from '../../../services/api';
import { useDeviceTelemetry } from './useDeviceTelemetry';

export interface UseDashboardDataReturn {
    telemetry: TelemetryData;
    missions: Mission[];
    isScanning: boolean;
    scanAnim: Animated.Value;
    scanTranslateY: Animated.AnimatedInterpolation<number>;
    refreshData: () => Promise<void>;
}

const REMOTE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — Open-Meteo cadence

const INITIAL: TelemetryData = {
    temperature: 0,
    humidity: 0,
    oxygen: 0,
    bpm: 0,
    radiation: 0,
    suitTemp: 0,
    battery: 100,
    link: 0,
};

export function useDashboardData(): UseDashboardDataReturn {
    const [remote, setRemote] = useState<TelemetryData>(INITIAL);
    const [missions, setMissions] = useState<Mission[]>([]);
    const lastSpeedRef = useRef<number>(0);

    const device = useDeviceTelemetry();

    // Scanning animation
    const [isScanning, setIsScanning] = useState(false);
    const scanAnim = useRef(new Animated.Value(0)).current;
    const scanTranslateY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-10, 90],
    });

    const runScanAnimation = useCallback(() => {
        setIsScanning(true);
        scanAnim.setValue(0);
        Animated.timing(scanAnim, {
            toValue: 1,
            duration: 720,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start(() => setIsScanning(false));
    }, [scanAnim]);

    /**
     * Fetch GPS coords (best effort — non-blocking if denied).
     * Updates lastSpeedRef from the location reading.
     */
    const fetchCoords = useCallback(async (): Promise<TelemetryQuery> => {
        try {
            const Location = await import('expo-location');
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') {
                const req = await Location.requestForegroundPermissionsAsync();
                if (req.status !== 'granted') return { speed_mps: lastSpeedRef.current };
            }
            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            if (typeof pos.coords.speed === 'number' && pos.coords.speed >= 0) {
                lastSpeedRef.current = pos.coords.speed;
            }
            return {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                speed_mps: lastSpeedRef.current,
            };
        } catch (e) {
            console.warn('[useDashboardData] GPS unavailable:', e);
            return { speed_mps: lastSpeedRef.current };
        }
    }, []);

    /** Pull remote telemetry + missions */
    const refreshData = useCallback(async () => {
        runScanAnimation();
        const query = await fetchCoords();
        const [telemetryData, missionsData] = await Promise.all([
            api.getTelemetry(query),
            api.getMissions(),
        ]);
        setRemote(telemetryData);
        setMissions(missionsData);
    }, [runScanAnimation, fetchCoords]);

    // Remote loop: 5 minutes
    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, REMOTE_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [refreshData]);

    // Combine remote + device into the final telemetry object.
    // Device overrides battery/link (those are the only "real" values mobile-side).
    const telemetry: TelemetryData = {
        ...remote,
        battery: device.available ? device.battery : remote.battery,
        battery_charging: device.battery_charging,
        link: device.link_type !== 'unknown' ? device.link : remote.link,
        link_type: device.link_type,
    };

    return {
        telemetry,
        missions,
        isScanning,
        scanAnim,
        scanTranslateY,
        refreshData,
    };
}
