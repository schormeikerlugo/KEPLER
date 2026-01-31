/**
 * KEPLER Mobile - Dashboard Screen
 * Orchestrator component that composes all dashboard modules
 * 
 * Structure:
 * - hooks/      → State management (menu, data)
 * - components/ → UI elements (menu, cards, sections)
 * - constants/  → Configuration (menu items)
 * - styles/     → StyleSheet definitions
 */

import React, { useState } from 'react';
import { View, ScrollView, SafeAreaView, TouchableOpacity, Text, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

// Hooks
import { useDashboardMenu, useDashboardData } from './hooks';

// Components
import {
    DashboardMenu,
    DashboardHeader,
    TelemetryPanel,
    SectionCard,
    MissionsSection,
    StatusModal,
    DashboardToast,
} from './components';

// Icons
import { POIsIcon, MineralsIcon, ObjectsIcon } from '../../components/icons/DashboardIcons';

// Styles
import { styles } from './styles';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ============================================================
// Main Component
// ============================================================

export default function DashboardScreen() {
    const navigation = useNavigation<NavigationProp>();
    const insets = useSafeAreaInsets();

    // ============================================================
    // Hooks
    // ============================================================

    const menu = useDashboardMenu();
    const data = useDashboardData();

    // ============================================================
    // Local State
    // ============================================================

    const [statusVisible, setStatusVisible] = useState(false);

    // ============================================================
    // Handlers
    // ============================================================

    const handleNavigate = (screen: string) => {
        menu.closeMenu();

        if (screen === 'ARCamera') {
            navigation.navigate('ARCamera', { missionId: 'new' });
        } else {
            (navigation as any).navigate(screen);
        }
    };

    const handleARPress = () => {
        menu.showToast('📷 Abriendo cámara AR...');
        navigation.navigate('ARCamera', { missionId: 'new' });
    };

    const handleMapPress = () => {
        (navigation as any).navigate('Map');
    };

    const handleRefreshPress = () => {
        data.refreshData();
        menu.showToast('🔄 Datos actualizados');
    };

    // ============================================================
    // Render
    // ============================================================

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Header Tile (Fixed at top) */}
            <View style={{ paddingTop: insets.top }}>
                <DashboardHeader
                    isSystemOnline={data.isSystemOnline}
                    onStatusPress={() => setStatusVisible(true)}
                    onMenuPress={menu.toggleMenu}
                />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingTop: 0 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Telemetry Panel */}
                <TelemetryPanel
                    telemetry={data.telemetry}
                    isScanning={data.isScanning}
                    scanTranslateY={data.scanTranslateY}
                />

                {/* POIs Section */}
                <SectionCard
                    icon={<POIsIcon size={20} color="#fff" />}
                    title="POIs"
                    count={data.pois}
                />

                {/* Minerals Section */}
                <SectionCard
                    icon={<MineralsIcon size={20} color="#fff" />}
                    title="Minerals"
                    count={data.minerals}
                />

                {/* Objects Section */}
                <SectionCard
                    icon={<ObjectsIcon size={20} color="#fff" />}
                    title="Objects"
                    count={data.objects}
                />

                {/* Missions Section */}
                <MissionsSection missions={data.missions} />

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Sliding Menu (from right) */}
            <DashboardMenu
                visible={menu.menuOpen}
                menuTranslateX={menu.menuTranslateX}
                overlayOpacity={menu.overlayOpacity}
                topInset={insets.top}
                currentScreen="Dashboard"
                onClose={menu.closeMenu}
                onNavigate={handleNavigate}
            />

            {/* Status Modal */}
            <StatusModal
                visible={statusVisible}
                systemStatus={data.systemStatus}
                isSystemOnline={data.isSystemOnline}
                onClose={() => setStatusVisible(false)}
            />

            {/* Chat FAB (Bottom Right) */}
            <TouchableOpacity style={styles.chatFab} onPress={handleARPress}>
                <Text style={styles.chatFabIcon}>💬</Text>
            </TouchableOpacity>

            {/* Toast */}
            <DashboardToast
                bottomInset={insets.bottom}
                message={menu.toast.message}
                visible={menu.toast.visible}
            />
        </SafeAreaView>
    );
}
