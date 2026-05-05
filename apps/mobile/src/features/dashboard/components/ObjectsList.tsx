/**
 * ObjectsList - Shows recent objects inside dashboard card
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DashboardObject } from '../hooks/useDashboardDetails';

const CATEGORY_COLORS: Record<string, string> = {
    mineral: '#ff6b6b',
    energia: '#ff6b6b',
    animales: '#ffa94d',
    plantas: '#69db7c',
    tecnologia: '#74c0fc',
    artefacto: '#b197fc',
    lugares: '#20c997',
};

function getCategoryColor(tipo: string): string {
    return CATEGORY_COLORS[tipo?.toLowerCase()] || '#868e96';
}

interface Props {
    items: DashboardObject[];
    onItemPress?: (item: DashboardObject) => void;
}

export function ObjectsList({ items, onItemPress }: Props) {
    if (items.length === 0) {
        return <Text style={s.empty}>Sin objetos detectados</Text>;
    }

    return (
        <View>
            {items.map((item) => (
                <TouchableOpacity
                    key={item.id}
                    style={s.row}
                    onPress={() => onItemPress?.(item)}
                >
                    <View style={[s.dot, { backgroundColor: getCategoryColor(item.tipo) }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.name} numberOfLines={1}>{item.nombre || 'Sin nombre'}</Text>
                        <Text style={s.sub}>{item.tipo || 'Desconocido'}</Text>
                    </View>
                    {item.confianza != null && (
                        <Text style={[s.conf, item.confianza < 0.5 && { color: '#ff6b6b' }]}>
                            {(item.confianza * 100).toFixed(0)}%
                        </Text>
                    )}
                    <Text style={s.arrow}>›</Text>
                </TouchableOpacity>
            ))}
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
        gap: 10,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    name: { color: '#fff', fontSize: 13, fontWeight: '500' },
    sub: { color: '#666', fontSize: 10, marginTop: 1 },
    conf: { color: '#888', fontSize: 11, fontWeight: '600' },
    arrow: { color: '#444', fontSize: 18 },
});
