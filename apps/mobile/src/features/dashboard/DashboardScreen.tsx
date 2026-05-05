/**
 * KEPLER Mobile - Dashboard Screen
 * Complete dashboard: data, alerts, stats, weather, modals, realtime, notifications
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, SafeAreaView, TouchableOpacity, Text, StatusBar, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

// Hooks
import {
    useDashboardData,
    useDashboardCounts,
    useDashboardDetails,
    useAlerts,
    useExplorerStats,
} from './hooks';
import { useSystemStatus } from '../../hooks';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useNotifications } from '../../hooks/useNotifications';
import Header from '../../components/Header';

// Components
import {
    TelemetryPanel, SectionCard, MissionsSection, StatusModal,
    ObjectsList, PersonasList, POIsList, RutasList,
    AlertsSection, ExplorerStats, WeatherWidget, DailyTip,
    ItemDetailModal, FullViewModal, MissionStartModal,
} from './components';
import type { DetailItem, FullViewTable } from './components';
import { NotificationToast } from '../../components/NotificationToast';
import BitacoraScreen from '../../screens/BitacoraScreen';

// Icons
import { POIsIcon, ObjectsIcon } from '../../components/icons/DashboardIcons';

// Styles
import { styles } from './styles';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function PersonasIcon() { return <Text style={{ fontSize: 20 }}>👤</Text>; }
function RutasIcon() { return <Text style={{ fontSize: 20 }}>🧭</Text>; }

const TABLE_LABELS: Record<string, string> = {
    misiones: 'Misión',
    objetos_exploracion: 'Objeto',
    personas_encontradas: 'Persona',
    puntos_interes: 'POI',
    rutas_exploracion: 'Ruta',
};

function buildDetailItem(item: any, table: DetailItem['table']): DetailItem {
    const common = { id: item.id, table, image_url: item.image_url };
    switch (table) {
        case 'objetos_exploracion':
            return { ...common, nombre: item.nombre || 'Objeto', fields: [
                { label: 'Tipo', value: item.tipo || '—' },
                { label: 'Confianza', value: item.confianza != null ? `${(item.confianza * 100).toFixed(0)}%` : '—' },
                { label: 'Nombre', value: item.nombre || '', editable: true, key: 'nombre' },
            ], badges: item.tipo ? [{ label: item.tipo, color: '#74c0fc' }] : [] };
        case 'personas_encontradas':
            return { ...common, nombre: item.nombre || 'Persona', fields: [
                { label: 'Nombre', value: item.nombre || '', editable: true, key: 'nombre' },
                { label: 'Contexto', value: item.contexto || '', editable: true, key: 'contexto' },
            ] };
        case 'puntos_interes':
            return { ...common, nombre: item.nombre || 'POI', fields: [
                { label: 'Nombre', value: item.nombre || '', editable: true, key: 'nombre' },
                { label: 'Categoría', value: item.poi_categoria || '—' },
                { label: 'Riesgo', value: item.nivel_riesgo || '—' },
                { label: 'Zona', value: item.zona || '—' },
            ], badges: item.nivel_riesgo ? [{ label: item.nivel_riesgo, color: item.nivel_riesgo === 'alto' || item.nivel_riesgo === 'critico' ? '#ff6b6b' : '#51cf66' }] : [] };
        case 'rutas_exploracion':
            return { ...common, nombre: item.nombre || 'Ruta', fields: [
                { label: 'Nombre', value: item.nombre || '', editable: true, key: 'nombre' },
                { label: 'Distancia', value: item.distancia_km != null ? `${item.distancia_km.toFixed(1)} km` : '—' },
                { label: 'Terreno', value: item.tipo_terreno || '—' },
                { label: 'Seguridad', value: item.seguridad || '—' },
            ] };
        default:
            return { ...common, nombre: '—', fields: [] };
    }
}

export default function DashboardScreen() {
    const navigation = useNavigation<NavigationProp>();

    // Data hooks
    const data = useDashboardData();
    const { counts, refetch: refetchCounts } = useDashboardCounts();
    const details = useDashboardDetails();
    const { alerts, totalCount: alertCount } = useAlerts();
    const { stats: explorerStats } = useExplorerStats();
    const { isOnline, systemStatus } = useSystemStatus();

    // Notifications
    const notifs = useNotifications();

    // Load notification history on mount
    useEffect(() => { notifs.loadHistory(); }, []);

    // Realtime sync - auto-refresh on DB changes
    useRealtimeSync(useCallback((event) => {
        const label = TABLE_LABELS[event.table] || event.table;
        if (event.eventType === 'INSERT') {
            notifs.notify('success', `Nuevo ${label} detectado`);
        } else if (event.eventType === 'DELETE') {
            notifs.notify('info', `${label} eliminado`);
        }
        // Refresh relevant data
        data.refreshData();
        refetchCounts();
        details.refetch();
    }, [data, refetchCounts, details]));

    // Modal states
    const [statusVisible, setStatusVisible] = useState(false);
    const [detailItem, setDetailItem] = useState<DetailItem | null>(null);
    const [fullViewTable, setFullViewTable] = useState<FullViewTable | null>(null);
    const [missionStartVisible, setMissionStartVisible] = useState(false);
    const [bitacoraVisible, setBitacoraVisible] = useState(false);

    // Handlers
    const handleMissionPress = useCallback((mission: any) => {
        navigation.navigate('MissionDetail', { missionId: mission.id });
    }, [navigation]);

    const handleItemPress = useCallback((item: any, table: DetailItem['table']) => {
        setDetailItem(buildDetailItem(item, table));
    }, []);

    const handleMissionStarted = useCallback((missionId: string) => {
        notifs.notify('success', 'Misión iniciada — entrando a AR');
        data.refreshData();
        refetchCounts();
        navigation.navigate('ARCamera', { missionId });
    }, [data, refetchCounts, navigation, notifs]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <Header
                currentScreen="Dashboard"
                isOnline={isOnline}
                showStatus={true}
                onStatusPress={() => setStatusVisible(true)}
                onMissionStart={() => setMissionStartVisible(true)}
                onBitacoraPress={() => setBitacoraVisible(true)}
                notificationCount={notifs.unreadCount}
            />

            {/* Notification Toast */}
            <NotificationToast toast={notifs.toast} onDismiss={notifs.dismissToast} />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingTop: 0 }]}
                showsVerticalScrollIndicator={false}
            >
                <DailyTip />

                <TelemetryPanel
                    telemetry={data.telemetry}
                    isScanning={data.isScanning}
                    scanTranslateY={data.scanTranslateY}
                />

                <AlertsSection alerts={alerts} totalCount={alertCount} />

                <ExplorerStats stats={explorerStats} />

                <WeatherWidget weather={explorerStats.weather} />

                <MissionsSection
                    missions={data.missions}
                    onMissionPress={handleMissionPress}
                    onViewAll={() => setFullViewTable('misiones')}
                />

                <SectionCard
                    icon={<ObjectsIcon size={20} color="#fff" />}
                    title="Objetos Encontrados"
                    count={counts.objetos}
                    onPress={() => setFullViewTable('objetos_exploracion')}
                >
                    <ObjectsList items={details.objetos} onItemPress={(i) => handleItemPress(i, 'objetos_exploracion')} />
                </SectionCard>

                <SectionCard
                    icon={<PersonasIcon />}
                    title="Personas Detectadas"
                    count={counts.personas}
                    onPress={() => setFullViewTable('personas_encontradas')}
                >
                    <PersonasList items={details.personas} onItemPress={(i) => handleItemPress(i, 'personas_encontradas')} />
                </SectionCard>

                <SectionCard
                    icon={<POIsIcon size={20} color="#fff" />}
                    title="Puntos de Interés"
                    count={counts.pois}
                    onPress={() => setFullViewTable('puntos_interes')}
                >
                    <POIsList items={details.pois} onItemPress={(i) => handleItemPress(i, 'puntos_interes')} />
                </SectionCard>

                <SectionCard
                    icon={<RutasIcon />}
                    title="Rutas Planificadas"
                    count={counts.rutas}
                    onPress={() => setFullViewTable('rutas_exploracion')}
                >
                    <RutasList items={details.rutas} onItemPress={(i) => handleItemPress(i, 'rutas_exploracion')} />
                </SectionCard>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modals */}
            <StatusModal visible={statusVisible} systemStatus={systemStatus} isSystemOnline={isOnline} onClose={() => setStatusVisible(false)} />

            <ItemDetailModal item={detailItem} visible={detailItem !== null} onClose={() => setDetailItem(null)} />

            {fullViewTable && (
                <FullViewModal
                    visible={true}
                    table={fullViewTable}
                    onClose={() => setFullViewTable(null)}
                    onItemPress={(item) => {
                        const t = fullViewTable;
                        setFullViewTable(null);
                        if (t === 'misiones') {
                            navigation.navigate('MissionDetail', { missionId: item.id });
                        } else {
                            handleItemPress(item, t as DetailItem['table']);
                        }
                    }}
                />
            )}

            <MissionStartModal
                visible={missionStartVisible}
                onClose={() => setMissionStartVisible(false)}
                onMissionStarted={handleMissionStarted}
            />

            {/* Bitácora Modal */}
            <Modal visible={bitacoraVisible} animationType="slide">
                <BitacoraScreen
                    notifications={notifs.history}
                    onClearAll={() => { notifs.clearAll(); setBitacoraVisible(false); }}
                    onBack={() => { notifs.markAllRead(); setBitacoraVisible(false); }}
                />
            </Modal>

            {/* FAB - Start Mission */}
            <TouchableOpacity style={styles.chatFab} onPress={() => setMissionStartVisible(true)}>
                <Text style={styles.chatFabIcon}>🚀</Text>
            </TouchableOpacity>

            {/* Notification Bell FAB */}
            <TouchableOpacity
                style={[styles.chatFab, { bottom: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(63,168,255,0.3)' }]}
                onPress={() => setBitacoraVisible(true)}
            >
                <Text style={{ fontSize: 20 }}>🔔</Text>
                {notifs.unreadCount > 0 && (
                    <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#ff4444', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{notifs.unreadCount}</Text>
                    </View>
                )}
            </TouchableOpacity>
        </SafeAreaView>
    );
}
