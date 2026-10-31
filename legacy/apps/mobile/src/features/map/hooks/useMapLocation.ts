/**
 * useMapLocation Hook
 * Handles geolocation permissions and GPS tracking
 */

import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export interface LocationState {
    location: Location.LocationObject | null;
    loading: boolean;
    error: string | null;
    coords: {
        lat: number;
        lng: number;
    };
}

export interface UseMapLocationReturn extends LocationState {
    refreshLocation: () => Promise<void>;
}

// Default coordinates (Venezuela)
const DEFAULT_COORDS = { lat: 10.4806, lng: -66.9036 };

export function useMapLocation(): UseMapLocationReturn {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [coords, setCoords] = useState(DEFAULT_COORDS);

    const fetchLocation = async () => {
        try {
            setLoading(true);
            setError(null);

            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== 'granted') {
                setError('Permiso de ubicación denegado');
                setLoading(false);
                return;
            }

            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            setLocation(loc);
            setCoords({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
            });
        } catch (e) {
            console.log('Location error:', e);
            setError('Error al obtener ubicación');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocation();
    }, []);

    return {
        location,
        loading,
        error,
        coords,
        refreshLocation: fetchLocation,
    };
}
