/**
 * MissionStartModal - Bottom sheet to configure and start a new mission
 */

import React, { useState, useEffect } from 'react';
import {
    Modal, View, Text, TouchableOpacity, TextInput,
    StyleSheet, ScrollView, ActivityIndicator,
    KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { configService } from '../../../services/configService';
import { supabase } from '../../../services/supabase';

const TERRAIN_OPTIONS = ['llano', 'tierra', 'rocoso', 'montañoso', 'barro'];
const DIFFICULTY_OPTIONS = ['baja', 'moderada', 'alta'];

interface Props {
    visible: boolean;
    onClose: () => void;
    onMissionStarted?: (missionId: string) => void;
}

export function MissionStartModal({ visible, onClose, onMissionStarted }: Props) {
    const [title, setTitle] = useState('');
    const [zone, setZone] = useState('');
    const [terrain, setTerrain] = useState('tierra');
    const [difficulty, setDifficulty] = useState('moderada');
    const [objective, setObjective] = useState('');
    const [loading, setLoading] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

    // Auto-generate title and detect GPS on open
    useEffect(() => {
        if (visible) {
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 12);
            setTitle(`MISION-${dateStr}`);
            detectLocation();
        }
    }, [visible]);

    const detectLocation = async () => {
        setGpsLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                const lat = loc.coords.latitude;
                const lng = loc.coords.longitude;
                setCoords({ lat, lng });
                setZone(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            } else {
                setZone('GPS denegado');
            }
        } catch {
            setZone('GPS no disponible');
        } finally {
            setGpsLoading(false);
        }
    };

    const handleStart = async () => {
        if (!title.trim()) return;
        setLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                Alert.alert('Sesión expirada', 'Inicia sesión de nuevo para crear misiones.');
                return;
            }

            const baseUrl = await configService.getBackendUrl();

            // Backend MissionStartRequest schema (fields aligned):
            //   titulo, zona, clima (required), tipo_terreno, dificultad,
            //   objetivo, coords_inicio
            const body: Record<string, any> = {
                titulo: title,
                zona: zone || 'Zona desconocida',
                clima: {}, // required by schema; empty for now (no live weather on mobile yet)
                tipo_terreno: terrain,
                dificultad: difficulty,
            };
            if (objective.trim()) body.objetivo = objective.trim();
            if (coords) body.coords_inicio = coords;

            const response = await fetch(`${baseUrl}/api/missions/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(body),
            });

            const raw = await response.text();
            let data: any = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }

            if (!response.ok) {
                const detail = data?.detail || data?.error || raw || `HTTP ${response.status}`;
                console.log('[MissionStart] Backend rejected:', response.status, detail);
                Alert.alert(
                    'No se pudo iniciar la misión',
                    typeof detail === 'string' ? detail : JSON.stringify(detail)
                );
                return;
            }

            if (data?.success === false) {
                Alert.alert('No se pudo iniciar la misión', data.error || 'Error desconocido');
                return;
            }

            const missionId = data?.mission_id || data?.id;
            if (!missionId) {
                console.log('[MissionStart] Response without mission_id:', data);
                Alert.alert('Error', 'Respuesta inválida del servidor.');
                return;
            }

            onMissionStarted?.(missionId);
            onClose();
        } catch (error: any) {
            console.log('[MissionStart] Network error:', error?.message || error);
            Alert.alert(
                'Error de conexión',
                `No se pudo conectar al backend.\n\n${error?.message || 'Verifica la URL en Configuración → Servidor.'}`
            );
        } finally {
            setLoading(false);
        }
    };

    const renderChips = (options: string[], selected: string, onSelect: (v: string) => void) => (
        <View style={s.chipsRow}>
            {options.map((opt) => (
                <TouchableOpacity
                    key={opt}
                    style={[s.chip, selected === opt && s.chipActive]}
                    onPress={() => onSelect(opt)}
                >
                    <Text style={[s.chipText, selected === opt && s.chipTextActive]}>
                        {opt}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                style={s.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={s.sheet}>
                    <View style={s.handleBar} />

                    <View style={s.header}>
                        <Text style={s.headerTitle}>🚀 Nueva Misión</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={s.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
                        {/* Title */}
                        <Text style={s.label}>TÍTULO</Text>
                        <TextInput
                            style={s.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholderTextColor="#555"
                        />

                        {/* Zone */}
                        <Text style={s.label}>ZONA GEOGRÁFICA</Text>
                        <View style={s.zoneRow}>
                            <TextInput
                                style={[s.input, { flex: 1 }]}
                                value={zone}
                                onChangeText={setZone}
                                placeholder="Coordenadas GPS"
                                placeholderTextColor="#555"
                            />
                            {gpsLoading && <ActivityIndicator color="#3fa8ff" style={{ marginLeft: 8 }} />}
                        </View>

                        {/* Terrain */}
                        <Text style={s.label}>TERRENO</Text>
                        {renderChips(TERRAIN_OPTIONS, terrain, setTerrain)}

                        {/* Difficulty */}
                        <Text style={s.label}>DIFICULTAD</Text>
                        {renderChips(DIFFICULTY_OPTIONS, difficulty, setDifficulty)}

                        {/* Objective */}
                        <Text style={s.label}>OBJETIVO (opcional)</Text>
                        <TextInput
                            style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                            value={objective}
                            onChangeText={setObjective}
                            multiline
                            placeholder="Describe el objetivo de esta misión..."
                            placeholderTextColor="#555"
                        />

                        <View style={{ height: 20 }} />
                    </ScrollView>

                    {/* Launch Button */}
                    <TouchableOpacity
                        style={[s.launchBtn, loading && { opacity: 0.6 }]}
                        onPress={handleStart}
                        disabled={loading || !title.trim()}
                    >
                        {loading ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={s.launchBtnText}>🚀 DESPEGAR</Text>
                        )}
                    </TouchableOpacity>
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
        maxHeight: '90%',
        borderTopWidth: 1,
        borderColor: 'rgba(63,168,255,0.2)',
    },
    handleBar: {
        width: 40, height: 4, backgroundColor: '#333',
        borderRadius: 2, alignSelf: 'center', marginTop: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingBottom: 8,
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    closeBtn: { color: '#888', fontSize: 22 },
    body: { paddingHorizontal: 16 },
    label: {
        color: '#666', fontSize: 10, fontWeight: '700',
        letterSpacing: 1, marginBottom: 6, marginTop: 14,
    },
    input: {
        backgroundColor: '#1a1a1a',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#fff',
        fontSize: 14,
        borderWidth: 1,
        borderColor: 'rgba(63,168,255,0.15)',
    },
    zoneRow: { flexDirection: 'row', alignItems: 'center' },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#333',
    },
    chipActive: {
        backgroundColor: 'rgba(63,168,255,0.15)',
        borderColor: '#3fa8ff',
    },
    chipText: { color: '#888', fontSize: 12, fontWeight: '500' },
    chipTextActive: { color: '#3fa8ff' },
    launchBtn: {
        margin: 16,
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: '#3fa8ff',
        alignItems: 'center',
    },
    launchBtnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
