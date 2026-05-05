/**
 * PersonasList - Shows recent personas inside dashboard card
 */

import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { DashboardPersona } from '../hooks/useDashboardDetails';

const AVATAR_COLORS = ['#3fa8ff', '#ff6b6b', '#51cf66', '#ffd43b', '#b197fc'];

interface Props {
    items: DashboardPersona[];
    onItemPress?: (item: DashboardPersona) => void;
}

export function PersonasList({ items, onItemPress }: Props) {
    if (items.length === 0) {
        return <Text style={s.empty}>Sin personas detectadas</Text>;
    }

    return (
        <View>
            {items.map((item, idx) => {
                const initial = (item.nombre || '?')[0].toUpperCase();
                const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];

                return (
                    <TouchableOpacity
                        key={item.id}
                        style={s.row}
                        onPress={() => onItemPress?.(item)}
                    >
                        {item.image_url ? (
                            <Image source={{ uri: item.image_url }} style={s.avatar} />
                        ) : (
                            <View style={[s.avatarPlaceholder, { backgroundColor: avatarColor }]}>
                                <Text style={s.avatarText}>{initial}</Text>
                            </View>
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={s.name} numberOfLines={1}>{item.nombre}</Text>
                            <Text style={s.sub} numberOfLines={1}>
                                {item.contexto || 'Sin contexto'}
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
        gap: 10,
    },
    avatar: { width: 32, height: 32, borderRadius: 16 },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    name: { color: '#fff', fontSize: 13, fontWeight: '500' },
    sub: { color: '#666', fontSize: 10, marginTop: 1 },
    arrow: { color: '#444', fontSize: 18 },
});
