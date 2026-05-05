/**
 * POIsList - Shows recent POIs inside dashboard card with risk colors
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DashboardPOI } from '../hooks/useDashboardDetails';

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    bajo: { bg: 'rgba(0, 200, 120, 0.15)', text: '#00c878', label: 'BAJO' },
    medio: { bg: 'rgba(255, 169, 77, 0.15)', text: '#ffa94d', label: 'MEDIO' },
    alto: { bg: 'rgba(255, 107, 107, 0.15)', text: '#ff6b6b', label: 'ALTO' },
    critico: { bg: 'rgba(255, 68, 68, 0.15)', text: '#ff4444', label: 'CRITICO' },
};

function getRisk(nivel?: string) {
    return RISK_COLORS[nivel?.toLowerCase() ?? ''] || { bg: 'rgba(136,136,136,0.15)', text: '#888', label: nivel || '—' };
}

interface Props {
    items: DashboardPOI[];
    onItemPress?: (item: DashboardPOI) => void;
}

export function POIsList({ items, onItemPress }: Props) {
    if (items.length === 0) {
        return <Text style={s.empty}>Sin puntos de interés</Text>;
    }

    return (
        <View>
            {items.map((item) => {
                const risk = getRisk(item.nivel_riesgo);
                return (
                    <TouchableOpacity
                        key={item.id}
                        style={s.row}
                        onPress={() => onItemPress?.(item)}
                    >
                        <Text style={s.icon}>📍</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.name} numberOfLines={1}>{item.nombre || 'Sin nombre'}</Text>
                            <Text style={s.sub} numberOfLines={1}>
                                {item.poi_categoria || item.zona || 'Sin zona'}
                            </Text>
                        </View>
                        <View style={[s.badge, { backgroundColor: risk.bg }]}>
                            <Text style={[s.badgeText, { color: risk.text }]}>{risk.label}</Text>
                        </View>
                        <Text style={s.arrow}>›</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const s = StyleSheet.create({
    empty: { color: '#666', fontSize: 13 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        padding: 12,
        borderRadius: 10,
        marginTop: 6,
        gap: 8,
    },
    icon: { fontSize: 18 },
    name: { color: '#fff', fontSize: 13, fontWeight: '500' },
    sub: { color: '#666', fontSize: 10, marginTop: 1 },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    badgeText: { fontSize: 9, fontWeight: '700' },
    arrow: { color: '#444', fontSize: 18 },
});
