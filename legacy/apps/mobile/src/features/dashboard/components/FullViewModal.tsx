/**
 * FullViewModal - Full-screen modal with all records + search
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal, View, Text, TouchableOpacity, FlatList,
    TextInput, StyleSheet, SafeAreaView,
} from 'react-native';
import { supabase } from '../../../services/supabase';

export type FullViewTable = 'misiones' | 'objetos_exploracion' | 'personas_encontradas' | 'puntos_interes' | 'rutas_exploracion';

interface Column {
    key: string;
    label: string;
    width?: number;
    format?: (value: any) => string;
    color?: (value: any) => string;
}

const TABLE_CONFIG: Record<FullViewTable, { title: string; orderBy: string; columns: Column[] }> = {
    misiones: {
        title: 'Todas las Misiones',
        orderBy: 'inicio_at',
        columns: [
            { key: 'codigo', label: 'Código', width: 140 },
            { key: 'estado', label: 'Estado', width: 100, color: (v) => v === 'activa' ? '#51cf66' : v === 'completada' ? '#3fa8ff' : '#888' },
            { key: 'inicio_at', label: 'Fecha', format: (v) => v ? new Date(v).toLocaleDateString() : '—' },
        ],
    },
    objetos_exploracion: {
        title: 'Todos los Objetos',
        orderBy: 'created_at',
        columns: [
            { key: 'nombre', label: 'Nombre', width: 140 },
            { key: 'tipo', label: 'Tipo', width: 100 },
            { key: 'confianza', label: 'Conf.', format: (v) => v != null ? `${(v * 100).toFixed(0)}%` : '—', color: (v) => v < 0.5 ? '#ff6b6b' : '#51cf66' },
        ],
    },
    personas_encontradas: {
        title: 'Todas las Personas',
        orderBy: 'created_at',
        columns: [
            { key: 'nombre', label: 'Nombre', width: 160 },
            { key: 'contexto', label: 'Contexto' },
        ],
    },
    puntos_interes: {
        title: 'Todos los POIs',
        orderBy: 'created_at',
        columns: [
            { key: 'nombre', label: 'Nombre', width: 140 },
            { key: 'nivel_riesgo', label: 'Riesgo', width: 80, color: (v) => v === 'alto' || v === 'critico' ? '#ff6b6b' : v === 'medio' ? '#ffa94d' : '#51cf66' },
            { key: 'zona', label: 'Zona' },
        ],
    },
    rutas_exploracion: {
        title: 'Todas las Rutas',
        orderBy: 'created_at',
        columns: [
            { key: 'nombre', label: 'Nombre', width: 140 },
            { key: 'distancia_km', label: 'Distancia', format: (v) => v != null ? `${v.toFixed(1)} km` : '—' },
            { key: 'seguridad', label: 'Seguridad', color: (v) => v === 'peligro' ? '#ff6b6b' : v === 'precaucion' ? '#ffa94d' : '#51cf66' },
        ],
    },
};

interface Props {
    visible: boolean;
    table: FullViewTable;
    onClose: () => void;
    onItemPress?: (item: any) => void;
}

export function FullViewModal({ visible, table, onClose, onItemPress }: Props) {
    const [data, setData] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const config = TABLE_CONFIG[table];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data: rows } = await supabase
                .from(table)
                .select('*')
                .eq('user_id', session.user.id)
                .order(config.orderBy, { ascending: false })
                .limit(100);

            setData(rows ?? []);
        } catch (error) {
            console.log('[FullView] Error:', error);
        } finally {
            setLoading(false);
        }
    }, [table, config.orderBy]);

    useEffect(() => {
        if (visible) {
            fetchData();
            setSearch('');
        }
    }, [visible, fetchData]);

    const filtered = search
        ? data.filter(item =>
            Object.values(item).some(v =>
                String(v).toLowerCase().includes(search.toLowerCase())
            )
        )
        : data;

    const renderRow = ({ item }: { item: any }) => (
        <TouchableOpacity style={s.row} onPress={() => onItemPress?.(item)}>
            {config.columns.map((col) => {
                const raw = item[col.key];
                const text = col.format ? col.format(raw) : String(raw ?? '—');
                const color = col.color ? col.color(raw) : '#ccc';
                return (
                    <Text
                        key={col.key}
                        style={[s.cell, col.width ? { width: col.width } : { flex: 1 }, { color }]}
                        numberOfLines={1}
                    >
                        {text}
                    </Text>
                );
            })}
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} animationType="slide">
            <SafeAreaView style={s.container}>
                {/* Header */}
                <View style={s.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={s.backBtn}>← Volver</Text>
                    </TouchableOpacity>
                    <Text style={s.title}>{config.title}</Text>
                    <Text style={s.count}>{filtered.length}</Text>
                </View>

                {/* Search */}
                <View style={s.searchRow}>
                    <TextInput
                        style={s.searchInput}
                        placeholder="Buscar..."
                        placeholderTextColor="#555"
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                {/* Column Headers */}
                <View style={s.colHeaders}>
                    {config.columns.map((col) => (
                        <Text
                            key={col.key}
                            style={[s.colHeader, col.width ? { width: col.width } : { flex: 1 }]}
                        >
                            {col.label}
                        </Text>
                    ))}
                </View>

                {/* Data List */}
                <FlatList
                    data={filtered}
                    renderItem={renderRow}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    ListEmptyComponent={
                        <Text style={s.empty}>
                            {loading ? 'Cargando...' : 'Sin resultados'}
                        </Text>
                    }
                />
            </SafeAreaView>
        </Modal>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    backBtn: { color: '#3fa8ff', fontSize: 14, fontWeight: '600' },
    title: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
    count: {
        color: '#3fa8ff',
        fontSize: 14,
        fontWeight: '700',
        backgroundColor: 'rgba(63,168,255,0.15)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 8,
    },
    searchRow: { paddingHorizontal: 16, marginBottom: 12 },
    searchInput: {
        backgroundColor: '#121212',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 14,
        borderWidth: 1,
        borderColor: 'rgba(63,168,255,0.15)',
    },
    colHeaders: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    colHeader: {
        color: '#666',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    row: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#111',
    },
    cell: { fontSize: 13 },
    empty: {
        color: '#555',
        textAlign: 'center',
        padding: 40,
        fontSize: 14,
    },
});
