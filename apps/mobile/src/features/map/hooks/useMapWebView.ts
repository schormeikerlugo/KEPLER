/**
 * useMapWebView Hook
 * Handles WebView communication and map control
 */

import { useRef, useState, useCallback } from 'react';
import { WebView } from 'react-native-webview';

export interface MapCoords {
    lat: number;
    lng: number;
    zoom: number;
}

export interface UseMapWebViewReturn {
    webViewRef: React.RefObject<WebView | null>;
    mapReady: boolean;
    coords: MapCoords;
    onMessage: (event: any) => void;
    changeLayer: (tileUrl: string) => void;
    flyToLocation: (lat: number, lng: number, zoom?: number) => void;
    reload: () => void;
}

export function useMapWebView(initialCoords: { lat: number; lng: number }): UseMapWebViewReturn {
    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);
    const [coords, setCoords] = useState<MapCoords>({
        lat: initialCoords.lat,
        lng: initialCoords.lng,
        zoom: 15,
    });

    const onMessage = useCallback((event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);

            if (data.type === 'ready') {
                setMapReady(true);
            }

            if (data.type === 'coords') {
                setCoords({
                    lat: data.lat,
                    lng: data.lng,
                    zoom: data.zoom,
                });
            }
        } catch (e) {
            // Ignore parse errors
        }
    }, []);

    const changeLayer = useCallback((tileUrl: string) => {
        if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`changeLayer('${tileUrl}'); true;`);
        }
    }, []);

    const flyToLocation = useCallback((lat: number, lng: number, zoom: number = 17) => {
        if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
                flyToLocation(${lat}, ${lng}, ${zoom});
                true;
            `);
        }
    }, []);

    const reload = useCallback(() => {
        webViewRef.current?.reload();
    }, []);

    return {
        webViewRef,
        mapReady,
        coords,
        onMessage,
        changeLayer,
        flyToLocation,
        reload,
    };
}
