/**
 * KEPLER Mobile - Custom Hooks
 * 
 * Reusable React hooks for common functionality across the app.
 * 
 * @module hooks/useApi
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, TelemetryData, SystemStatus, Mission } from '../services/api';
import { REFRESH_INTERVAL } from '../constants/config';


// =============================================================================
// USE TELEMETRY HOOK
// =============================================================================

/**
 * Hook for fetching and auto-refreshing telemetry data
 * 
 * @param autoRefresh - Whether to auto-refresh data (default: true)
 * @param interval - Refresh interval in ms (default: REFRESH_INTERVAL)
 * @returns Object containing telemetry data, loading state, error, and refresh function
 * 
 * @example
 * const { data, isLoading, refresh } = useTelemetry();
 */
export function useTelemetry(autoRefresh = true, interval = REFRESH_INTERVAL) {
    const [data, setData] = useState<TelemetryData>({
        temperature: 23,
        oxygen: 99,
        bpm: 60,
        radiation: 0.033,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const telemetry = await api.getTelemetry();
            setData(telemetry);
            setLastUpdated(new Date());
        } catch (err) {
            setError('Error fetching telemetry');
            console.error('Telemetry hook error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();

        if (autoRefresh) {
            const timer = setInterval(refresh, interval);
            return () => clearInterval(timer);
        }
    }, [refresh, autoRefresh, interval]);

    return { data, isLoading, error, lastUpdated, refresh };
}


// =============================================================================
// USE SYSTEM STATUS HOOK
// =============================================================================

/**
 * Hook for checking system/backend status
 * 
 * @param autoRefresh - Whether to auto-refresh (default: true)
 * @returns Object containing status data and connection state
 * 
 * @example
 * const { status, isOnline } = useSystemStatus();
 */
export function useSystemStatus(autoRefresh = true) {
    const [status, setStatus] = useState<SystemStatus>({
        backend: false,
        supabase: false,
        ollama: false,
    });
    const [isOnline, setIsOnline] = useState(false);

    const checkStatus = useCallback(async () => {
        try {
            const result = await api.getSystemStatus();
            setStatus(result);
            setIsOnline(result.backend);
        } catch (err) {
            setIsOnline(false);
        }
    }, []);

    useEffect(() => {
        checkStatus();

        if (autoRefresh) {
            const timer = setInterval(checkStatus, REFRESH_INTERVAL);
            return () => clearInterval(timer);
        }
    }, [checkStatus, autoRefresh]);

    return { status, isOnline, checkStatus };
}


// =============================================================================
// USE MISSIONS HOOK
// =============================================================================

/**
 * Hook for fetching missions data
 * 
 * @returns Object containing missions array and refresh function
 * 
 * @example
 * const { missions, refresh } = useMissions();
 */
export function useMissions() {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await api.getMissions();
            setMissions(data);
        } catch (err) {
            console.error('Missions hook error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, REFRESH_INTERVAL);
        return () => clearInterval(timer);
    }, [refresh]);

    return { missions, isLoading, refresh };
}


// =============================================================================
// USE ANIMATION HOOK
// =============================================================================

import { Animated, Easing } from 'react-native';

/**
 * Hook for scanner line animation (used in telemetry updates)
 * 
 * @returns Object containing animation value, isAnimating state, and trigger function
 * 
 * @example
 * const { animValue, isAnimating, trigger } = useScanAnimation();
 */
export function useScanAnimation(duration = 800) {
    const animValue = useRef(new Animated.Value(0)).current;
    const [isAnimating, setIsAnimating] = useState(false);

    const trigger = useCallback(() => {
        setIsAnimating(true);
        animValue.setValue(0);

        Animated.timing(animValue, {
            toValue: 1,
            duration,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start(() => {
            setIsAnimating(false);
        });
    }, [animValue, duration]);

    return { animValue, isAnimating, trigger };
}


/**
 * Hook for continuous glow pulse animation
 * 
 * @returns Animated value for opacity (oscillates between min and max)
 * 
 * @example
 * const glowOpacity = useGlowAnimation();
 */
export function useGlowAnimation(minOpacity = 0.3, maxOpacity = 0.8) {
    const animValue = useRef(new Animated.Value(minOpacity)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(animValue, {
                    toValue: maxOpacity,
                    duration: 2000,
                    useNativeDriver: false,
                }),
                Animated.timing(animValue, {
                    toValue: minOpacity,
                    duration: 2000,
                    useNativeDriver: false,
                }),
            ])
        );

        animation.start();
        return () => animation.stop();
    }, [animValue, minOpacity, maxOpacity]);

    return animValue;
}
