/**
 * BitacoraScreen - Notification history with filters
 */

import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, FlatList, SafeAreaView,
    StyleSheet, Alert,
} from 'react-native';
import type { AppNotification, NotificationType } from '../hooks/useNotifications';

const TYPE_CONFIG: Record<NotificationType, { icon: string; label: string; color: string }> = {
    critical: { icon: '🚨', label: 'Crítico', color: '#ff4444' },
    warning: { icon: '⚠️', label: 'Alerta', color: '#ffa94d' },
    success: { icon: '✅', label: 'Éxito', color: '#51cf66' },
    info: { icon: 'ℹ️', label: 'Info', color: '#3fa8ff' },
};

const FILTER_OPTIONS: (NotificationType | 'all')[] = ['all', 'critical', 'warning', 'success', 'info'];

interface Props {
    notifications: AppNotification[];
    onClearAll: () => void;
    onBack: () => void;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function BitacoraScreen({ notifications, onClearAll, onBack }: Props) {
    const [filter, setFilter] = useState<NotificationType | 'all'>('all');

    const filtered = filter === 'all'
        ? notifications
        : notifications.filter(n => n.type === filter);

    // Count per type
    const counts = {
        all: notifications.length,
        critical: notifications.filter(n => n.type === 'critical').length,
        warning: notifications.filter(n => n.type === 'warning').length,
        success: notifications.filter(n => n.type === 'success').length,
        info: notifications.filter(n => n.type === 'info').length,
    };

    const handleClear = () => {
        Alert.alert(
            'Limpiar historial',
            '¿Eliminar todas las notificaciones?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: onClearAll },
            ]
        );
    };

    const renderItem = ({ item }: { item: AppNotification }) => {
        const config = TYPE_CONFIG[item.type];
        return (
            <View style={[s.item, !item.read && s.itemUnread]}>
                <Text style={s.itemIcon}>{config.icon}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.itemMessage}>{item.message}</Text>
                    <Text style={s.itemTime}>{formatTime(item.timestamp)}</Text>
                </View>
                {!item.read && <View style={[s.unreadDot, { backgroundColor: config.color }]} />}
            </View>
        );
    };

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={onBack}>
                    <Text style={s.backBtn}>← Volver</Text>
                </TouchableOpacity>
                <Text style={s.title}>🔔 Bitácora</Text>
                <TouchableOpacity onPress={handleClear}>
                    <Text style={s.clearBtn}>Limpiar</Text>
                </TouchableOpacity>
            </View>

            {/* Filter Chips */}
            <View style={s.filtersRow}>
                {FILTER_OPTIONS.map((f) => {
                    const label = f === 'all' ? 'Todas' : TYPE_CONFIG[f].label;
                    const count = counts[f];
                    const active = filter === f;
                    return (
                        <TouchableOpacity
                            key={f}
                            style={[s.filterChip, active && s.filterChipActive]}
                            onPress={() => setFilter(f)}
                        >
                            <Text style={[s.filterText, active && s.filterTextActive]}>
                                {label} {count > 0 ? `(${count})` : ''}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* List */}
            <FlatList
                data={filtered}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                ListEmptyComponent={
                    <Text style={s.empty}>Sin notificaciones</Text>
                }
            />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    backBtn: { color: '#3fa8ff', fontSize: 14, fontWeight: '600' },
    title: { color: '#fff', fontSize: 16, fontWeight: '700' },
    clearBtn: { color: '#ff6b6b', fontSize: 13, fontWeight: '600' },
    filtersRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 12,
        gap: 6,
    },
    filterChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: '#121212',
    },
    filterChipActive: {
        backgroundColor: 'rgba(63,168,255,0.15)',
        borderWidth: 1,
        borderColor: '#3fa8ff',
    },
    filterText: { color: '#888', fontSize: 11, fontWeight: '500' },
    filterTextActive: { color: '#3fa8ff' },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 6,
        backgroundColor: '#121212',
        borderRadius: 12,
        gap: 10,
    },
    itemUnread: {
        borderLeftWidth: 3,
        borderLeftColor: '#3fa8ff',
    },
    itemIcon: { fontSize: 18 },
    itemMessage: { color: '#ddd', fontSize: 13 },
    itemTime: { color: '#555', fontSize: 10, marginTop: 2 },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },
    empty: {
        color: '#555',
        textAlign: 'center',
        padding: 40,
        fontSize: 14,
    },
});
