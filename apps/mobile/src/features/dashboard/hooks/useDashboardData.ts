/**
 * useDashboardData Hook
 * Handles telemetry, system status, and missions data fetching
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { api, TelemetryData, SystemStatus, Mission } from '../../../services/api';

export interface UseDashboardDataReturn {
    // Data
    telemetry: TelemetryData;
    missions: Mission[];
    pois: number;
    minerals: number;
    objects: number;

    // Status
    isScanning: boolean;

    // Animation
    scanAnim: Animated.Value;
    scanTranslateY: Animated.AnimatedInterpolation<number>;

    // Actions
    refreshData: () => Promise<void>;
}

export function useDashboardData(): UseDashboardDataReturn {
    // Data state
    const [telemetry, setTelemetry] = useState<TelemetryData>({
        temperature: 23,
        oxygen: 99,
        bpm: 60,
        radiation: 0.033,
    });
    // systemStatus removed
    const [missions, setMissions] = useState<Mission[]>([]);
    const [pois] = useState(0);
    const [minerals] = useState(0);
    const [objects] = useState(0);

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
        }).start(() => {
            setIsScanning(false);
        });
    }, [scanAnim]);

    const refreshData = useCallback(async () => {
        runScanAnimation();

        const [telemetryData, missionsData] = await Promise.all([
            api.getTelemetry(),
            api.getMissions(),
        ]);

        setTelemetry(telemetryData);
        setMissions(missionsData);
    }, [runScanAnimation]);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 5000);
        return () => clearInterval(interval);
    }, [refreshData]);

    return {
        telemetry,
        missions,
        pois,
        minerals,
        objects,
        isScanning,
        scanAnim,
        scanTranslateY,
        refreshData,
    };
}
