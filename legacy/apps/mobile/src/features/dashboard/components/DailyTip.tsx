/**
 * DailyTip - Contextual tip of the day, cached per session
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TIPS = [
    'Mantén tu equipo cargado antes de cada exploración.',
    'Documenta cada hallazgo con notas detalladas.',
    'Verifica el nivel de riesgo de cada POI antes de acercarte.',
    'Toma descansos regulares para mantener tu resistencia.',
    'Usa el análisis de corredor antes de seguir una ruta nueva.',
    'Hidrátate constantemente en terrenos montañosos.',
    'Revisa las alertas del dashboard antes de iniciar misión.',
    'El Sentinel captura automáticamente — confía en él.',
    'Compara personas sin identificar usando el Identity Comparator.',
    'Exporta tus datos regularmente como respaldo.',
    'Usa el mapa táctico para planificar tu ruta de exploración.',
    'Verifica la integridad de tu calzado antes de salir.',
    'El GPS consume batería — monitorea el nivel BATT.',
    'Clasifica los objetos con taxonomía para mejor organización.',
    'Revisa el chat IA para análisis de tus hallazgos.',
    'En terreno rocoso, tu calzado se desgasta más rápido.',
    'Las condiciones climáticas afectan tu resistencia física.',
    'Identifica personas rápido para mejorar tu base de datos.',
    'Guarda rutas seguras para futuras misiones.',
    'Mantén señal de LINK estable para sincronización en tiempo real.',
];

const CACHE_KEY = 'kepler_daily_tip';

export function DailyTip() {
    const [tip, setTip] = useState('');

    useEffect(() => {
        (async () => {
            const today = new Date().toDateString();
            const cached = await AsyncStorage.getItem(CACHE_KEY);

            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (parsed.date === today) {
                        setTip(parsed.tip);
                        return;
                    }
                } catch { /* parse error, generate new */ }
            }

            const newTip = TIPS[Math.floor(Math.random() * TIPS.length)];
            setTip(newTip);
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, tip: newTip }));
        })();
    }, []);

    if (!tip) return null;

    return (
        <View style={s.container}>
            <Text style={s.label}>💡 Consejo del día</Text>
            <Text style={s.tip}>{tip}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(63, 168, 255, 0.08)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        borderLeftWidth: 3,
        borderLeftColor: '#3fa8ff',
    },
    label: {
        color: '#3fa8ff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    tip: {
        color: '#ccc',
        fontSize: 13,
        lineHeight: 18,
    },
});
