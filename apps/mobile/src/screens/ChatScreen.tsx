/**
 * ChatScreen - IA Chat (Cortex) placeholder
 * TODO: Implement Mistral streaming chat
 */

import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function ChatScreen() {
    const navigation = useNavigation();

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={s.back}>← Volver</Text>
                </TouchableOpacity>
                <Text style={s.title}>🤖 Chat IA (Cortex)</Text>
            </View>
            <View style={s.body}>
                <Text style={s.emoji}>🧠</Text>
                <Text style={s.heading}>Cortex IA</Text>
                <Text style={s.desc}>
                    Chat streaming con Mistral 7B.{'\n'}
                    Analiza misiones, objetos y rutas con contexto.
                </Text>
                <Text style={s.status}>Próximamente en mobile</Text>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    back: { color: '#3fa8ff', fontSize: 14, fontWeight: '600' },
    title: { color: '#fff', fontSize: 16, fontWeight: '700' },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emoji: { fontSize: 60, marginBottom: 16 },
    heading: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12 },
    desc: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22 },
    status: { color: '#3fa8ff', fontSize: 12, fontWeight: '600', marginTop: 24, letterSpacing: 1 },
});
