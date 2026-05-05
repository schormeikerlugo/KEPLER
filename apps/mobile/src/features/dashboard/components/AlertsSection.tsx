/**
 * AlertsSection - Actionable alerts panel (POIs, personas, missions, objects)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertGroup } from '../hooks/useAlerts';

interface Props {
    alerts: AlertGroup[];
    totalCount: number;
}

export function AlertsSection({ alerts, totalCount }: Props) {
    if (alerts.length === 0) return null;

    return (
        <View style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>🚨 Alertas</Text>
                <View style={s.badge}>
                    <Text style={s.badgeText}>{totalCount}</Text>
                </View>
            </View>
            <View style={s.divider} />

            {alerts.map((group) => (
                <View key={group.id} style={[s.group, { borderLeftColor: group.borderColor }]}>
                    <Text style={s.groupTitle}>
                        {group.icon} {group.title} ({group.items.length})
                    </Text>
                    {group.items.map((item) => (
                        <TouchableOpacity key={item.id} style={s.item}>
                            <Text style={s.itemName} numberOfLines={1}>{item.nombre}</Text>
                            {item.detail && (
                                <Text style={[s.itemDetail, { color: group.borderColor }]}>
                                    {item.detail}
                                </Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: '#121212',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: { fontSize: 16, fontWeight: '600', color: '#fff' },
    badge: {
        backgroundColor: 'rgba(255, 107, 107, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },
    badgeText: { color: '#ff6b6b', fontSize: 13, fontWeight: '700' },
    divider: { height: 1, backgroundColor: '#222', marginVertical: 12 },
    group: {
        borderLeftWidth: 3,
        paddingLeft: 12,
        marginBottom: 12,
    },
    groupTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#aaa',
        marginBottom: 6,
        letterSpacing: 0.3,
    },
    item: {
        backgroundColor: '#1a1a1a',
        padding: 10,
        borderRadius: 8,
        marginTop: 4,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemName: { color: '#fff', fontSize: 12, flex: 1 },
    itemDetail: { fontSize: 10, fontWeight: '600', marginLeft: 8 },
});
