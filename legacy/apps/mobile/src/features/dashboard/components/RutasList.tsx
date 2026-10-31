/**
 * RutasList - Shows recent routes inside dashboard card with security badges
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DashboardRuta } from '../hooks/useDashboardDetails';

const SECURITY_BADGES: Record<string, { icon: string; label: string; bg: string; text: string }> = {
    seguro: { icon: '✓', label: 'Seguro', bg: 'rgba(81, 207, 102, 0.15)', text: '#51cf66' },
    precaucion: { icon: '⚠', label: 'Precaución', bg: 'rgba(255, 169, 77, 0.15)', text: '#ffa94d' },
    peligro: { icon: '▲', label: 'Peligro', bg: 'rgba(255, 107, 107, 0.15)', text: '#ff6b6b' },
};

function getSecurity(seg?: string) {
    return SECURITY_BADGES[seg?.toLowerCase() ?? ''] || SECURITY_BADGES['seguro'];
}

interface Props {
    items: DashboardRuta[];
    onItemPress?: (item: DashboardRuta) => void;
}

export function RutasList({ items, onItemPress }: Props) {
    if (items.length === 0) {
        return <Text style={s.empty}>Sin rutas planificadas</Text>;
    }

    return (
        <View>
            {items.map((item) => {
                const sec = getSecurity(item.seguridad);
                return (
                    <TouchableOpacity
                        key={item.id}
                        style={s.row}
                        onPress={() => onItemPress?.(item)}
                    >
                        <Text style={s.icon}>🧭</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.name} numberOfLines={1}>{item.nombre || 'Sin nombre'}</Text>
                            <Text style={s.sub}>
                                {item.distancia_km != null ? `${item.distancia_km.toFixed(1)} km` : '— km'}
                                {item.tipo_terreno ? ` · ${item.tipo_terreno}` : ''}
                            </Text>
                        </View>
                        <View style={[s.badge, { backgroundColor: sec.bg }]}>
                            <Text style={[s.badgeText, { color: sec.text }]}>
                                {sec.icon} {sec.label}
                            </Text>
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
