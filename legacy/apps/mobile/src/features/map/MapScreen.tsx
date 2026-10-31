/**
 * KEPLER Mobile - Map Screen
 * Orchestrator component that composes all map modules
 * 
 * Structure:
 * - hooks/      → State management (location, menu, webview)
 * - components/ → UI elements (menu, modals, controls)
 * - constants/  → Configuration (layers, menu items)
 * - styles/     → StyleSheet definitions
 * - templates/  → WebView HTML generator
 */

import React, { useState, useMemo } from 'react';
import { View, ActivityIndicator, Text, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

// Hooks
import { useMapLocation, useMapMenu, useMapWebView } from './hooks';

// Components
import {
    MapFab,
    MapMenu,
    MapLayerModal,
    MapSearchModal,
    MapQuickControls,
    MapCoordsWidget,
    MapStatusBadge,
    MapToast,
} from './components';

// Constants & Templates
import { getLayerById, MapLayer, MenuActionId } from './constants';
import { generateMapHtml } from './templates';
import { styles } from './styles';

// ============================================================
// Main Component
// ============================================================

export default function MapScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    // ============================================================
    // Hooks
    // ============================================================

    const location = useMapLocation();
    const menu = useMapMenu();
    const webView = useMapWebView(location.coords);

    // ============================================================
    // Local State
    // ============================================================

    const [currentLayerId, setCurrentLayerId] = useState('dark');
    const [showLayerModal, setShowLayerModal] = useState(false);
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // ============================================================
    // Computed Values
    // ============================================================

    const currentLayer = useMemo(() => getLayerById(currentLayerId), [currentLayerId]);

    const mapHtml = useMemo(() => generateMapHtml({
        lat: location.coords.lat,
        lng: location.coords.lng,
        tileUrl: currentLayer.url,
    }), [location.coords.lat, location.coords.lng, currentLayer.url]);

    // ============================================================
    // Handlers
    // ============================================================

    const handleMenuAction = (actionId: MenuActionId) => {
        menu.closeMenu();

        switch (actionId) {
            case 'objects':
                menu.showToast('📦 Panel de objetos (próximamente)');
                break;
            case 'search':
                setShowSearchModal(true);
                break;
            case 'filters':
                menu.showToast('📊 Filtros (próximamente)');
                break;
            case 'location':
                handleGoToLocation();
                break;
            case 'layers':
                setShowLayerModal(true);
                break;
            case 'refresh':
                webView.reload();
                menu.showToast('🔄 Mapa recargado');
                break;
            case 'exit':
                navigation.goBack();
                break;
        }
    };

    const handleGoToLocation = () => {
        if (location.location) {
            webView.flyToLocation(
                location.location.coords.latitude,
                location.location.coords.longitude,
            );
            menu.showToast('🎯 Ubicación centrada');
        } else {
            menu.showToast('⚠️ GPS no disponible');
        }
    };

    const handleSelectLayer = (layer: MapLayer) => {
        setCurrentLayerId(layer.id);
        webView.changeLayer(layer.url);
        setShowLayerModal(false);
        menu.showToast(`🗺️ Mapa: ${layer.name}`);
    };

    // ============================================================
    // Loading State
    // ============================================================

    if (location.loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00f7ff" />
                <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
            </View>
        );
    }

    // ============================================================
    // Render
    // ============================================================

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Map WebView */}
            <WebView
                ref={webView.webViewRef}
                source={{ html: mapHtml }}
                style={styles.map}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
                onMessage={webView.onMessage}
                originWhitelist={['*']}
                mixedContentMode="always"
            />

            {/* Loading Overlay */}
            {!webView.mapReady && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#00f7ff" />
                    <Text style={styles.loadingText}>Cargando mapa...</Text>
                </View>
            )}

            {/* FAB Button */}
            <MapFab
                topInset={insets.top}
                fabRotate={menu.fabRotate}
                onPress={menu.toggleMenu}
            />

            {/* Sliding Menu */}
            <MapMenu
                visible={menu.menuOpen}
                menuTranslateX={menu.menuTranslateX}
                overlayOpacity={menu.overlayOpacity}
                topInset={insets.top}
                onClose={menu.closeMenu}
                onAction={handleMenuAction}
            />

            {/* Quick Controls */}
            <MapQuickControls
                topInset={insets.top}
                layerIcon={currentLayer.icon}
                disabled={!webView.mapReady}
                onLocationPress={handleGoToLocation}
                onLayerPress={() => setShowLayerModal(true)}
            />

            {/* Coords Widget */}
            <MapCoordsWidget
                bottomInset={insets.bottom}
                lat={webView.coords.lat}
                lng={webView.coords.lng}
                zoom={webView.coords.zoom}
            />

            {/* Status Badge */}
            <MapStatusBadge
                bottomInset={insets.bottom}
                isReady={webView.mapReady}
            />

            {/* Search Modal */}
            <MapSearchModal
                visible={showSearchModal}
                topInset={insets.top}
                searchQuery={searchQuery}
                onChangeQuery={setSearchQuery}
                onClose={() => setShowSearchModal(false)}
            />

            {/* Layer Modal */}
            <MapLayerModal
                visible={showLayerModal}
                currentLayerId={currentLayerId}
                onSelectLayer={handleSelectLayer}
                onClose={() => setShowLayerModal(false)}
            />

            {/* Toast */}
            <MapToast
                bottomInset={insets.bottom}
                message={menu.toast.message}
                visible={menu.toast.visible}
            />
        </View>
    );
}
