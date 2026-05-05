/**
 * ItemDetailModal - Generic detail modal for any dashboard item
 * Supports: objetos, personas, POIs, rutas
 */

import React, { useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, ScrollView,
    TextInput, Image, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';

export interface DetailItem {
    id: string;
    table: 'objetos_exploracion' | 'personas_encontradas' | 'puntos_interes' | 'rutas_exploracion';
    nombre: string;
    image_url?: string;
    fields: { label: string; value: string; editable?: boolean; key?: string }[];
    badges?: { label: string; color: string }[];
}

interface Props {
    item: DetailItem | null;
    visible: boolean;
    onClose: () => void;
    onSave?: (id: string, updates: Record<string, string>) => void;
    onDelete?: (id: string) => void;
}

export function ItemDetailModal({ item, visible, onClose, onSave, onDelete }: Props) {
    const [edits, setEdits] = useState<Record<string, string>>({});

    if (!item) return null;

    const handleSave = () => {
        if (onSave && Object.keys(edits).length > 0) {
            onSave(item.id, edits);
        }
        setEdits({});
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                style={s.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={s.sheet}>
                    {/* Handle bar */}
                    <View style={s.handleBar} />

                    {/* Header */}
                    <View style={s.header}>
                        <Text style={s.title} numberOfLines={1}>{item.nombre}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={s.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Badges */}
                    {item.badges && item.badges.length > 0 && (
                        <View style={s.badgesRow}>
                            {item.badges.map((b, i) => (
                                <View key={i} style={[s.badge, { backgroundColor: b.color + '22' }]}>
                                    <Text style={[s.badgeText, { color: b.color }]}>{b.label}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
                        {/* Image */}
                        {item.image_url && (
                            <Image source={{ uri: item.image_url }} style={s.image} resizeMode="cover" />
                        )}

                        {/* Fields */}
                        {item.fields.map((field, idx) => (
                            <View key={idx} style={s.fieldRow}>
                                <Text style={s.fieldLabel}>{field.label}</Text>
                                {field.editable ? (
                                    <TextInput
                                        style={s.fieldInput}
                                        value={edits[field.key || field.label] ?? field.value}
                                        onChangeText={(text) =>
                                            setEdits(prev => ({ ...prev, [field.key || field.label]: text }))
                                        }
                                        placeholderTextColor="#555"
                                    />
                                ) : (
                                    <Text style={s.fieldValue}>{field.value || '—'}</Text>
                                )}
                            </View>
                        ))}

                        <View style={{ height: 20 }} />
                    </ScrollView>

                    {/* Actions */}
                    <View style={s.actions}>
                        {onDelete && (
                            <TouchableOpacity
                                style={s.deleteBtn}
                                onPress={() => { onDelete(item.id); onClose(); }}
                            >
                                <Text style={s.deleteBtnText}>Eliminar</Text>
                            </TouchableOpacity>
                        )}
                        {onSave && (
                            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                                <Text style={s.saveBtnText}>Guardar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0d1218',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '85%',
        borderTopWidth: 1,
        borderColor: 'rgba(63,168,255,0.2)',
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingBottom: 8,
    },
    title: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
    closeBtn: { color: '#888', fontSize: 22, paddingLeft: 16 },
    badgesRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    body: { paddingHorizontal: 16 },
    image: {
        width: '100%',
        height: 180,
        borderRadius: 12,
        marginBottom: 16,
        backgroundColor: '#1a1a1a',
    },
    fieldRow: { marginBottom: 14 },
    fieldLabel: {
        color: '#666',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    fieldValue: { color: '#ccc', fontSize: 14 },
    fieldInput: {
        color: '#fff',
        fontSize: 14,
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(63,168,255,0.2)',
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#222',
    },
    deleteBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ff6b6b',
        alignItems: 'center',
    },
    deleteBtnText: { color: '#ff6b6b', fontWeight: '600', fontSize: 14 },
    saveBtn: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#3fa8ff',
        alignItems: 'center',
    },
    saveBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
});
