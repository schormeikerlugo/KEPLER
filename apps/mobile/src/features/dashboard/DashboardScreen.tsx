/**
 * KEPLER Mobile - Dashboard Screen
 * Orchestrator component that composes all dashboard modules
 */

import React, { useState } from 'react';
import { View, ScrollView, SafeAreaView, TouchableOpacity, Text, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

// Hooks
import { useDashboardData } from './hooks';
import { useSystemStatus } from '../../hooks';
import Header from '../../components/Header';

// Components
import {
    TelemetryPanel,
    SectionCard,
    MissionsSection,
    StatusModal,
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

    // Hooks
    // We can keep useDashboardData for telemetry/missions but use global status for Header
    const data = useDashboardData();
    const { isOnline, systemStatus, checkStatus } = useSystemStatus();

    // Local State
    const [statusVisible, setStatusVisible] = useState(false);

    // Handlers
    const handleARPress = () => {
        navigation.navigate('ARCamera', { missionId: 'new' });
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Shared Header (Fixed) */}
            <Header
                currentScreen="Dashboard"
                isOnline={isOnline}
                showStatus={true}
                onStatusPress={() => setStatusVisible(true)}
            />

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

            {/* Status Modal - Using local visibility but global data */}
            <StatusModal
                visible={statusVisible}
                systemStatus={systemStatus}
                isSystemOnline={isOnline}
                onClose={() => setStatusVisible(false)}
            />

            {/* Chat FAB (Bottom Right) */}
            <TouchableOpacity style={styles.chatFab} onPress={handleARPress}>
                <Text style={styles.chatFabIcon}>💬</Text>
            </TouchableOpacity>

        </SafeAreaView>
    );
}
