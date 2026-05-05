/**
 * TelemetryPanel Component
 * Displays 8 telemetry indicators in 2 rows with scan animation.
 *
 * Indicators are color-coded by data source:
 *   • Real (open-meteo / device API)        → green dot
 *   • Coherent simulated (BPM, radiation)   → yellow dot
 *   • Pure simulated / unavailable          → red dot
 */

import React from 'react';
import { View, Text, Animated } from 'react-native';
import { TelemetryData } from '../../../services/api';
import { styles } from '../styles';

interface TelemetryPanelProps {
    telemetry: TelemetryData;
    isScanning: boolean;
    scanTranslateY: Animated.AnimatedInterpolation<number>;
}

type SourceKind = 'real' | 'coherent' | 'simulated' | 'unknown';

interface IndicatorConfig {
    key: keyof TelemetryData;
    label: string;
    format: (v: number) => string;
    sourceField: 'weather' | 'air' | 'biometric' | 'device';
}

const ROW_1: IndicatorConfig[] = [
    { key: 'temperature', label: 'TEMP',  format: (v) => `${Number(v).toFixed(0)}°C`, sourceField: 'weather' },
    { key: 'oxygen',      label: 'AIRE',  format: (v) => `${Number(v).toFixed(0)}%`,  sourceField: 'air' },
    { key: 'bpm',         label: 'BPM',   format: (v) => `${Number(v).toFixed(0)}`,   sourceField: 'biometric' },
    { key: 'radiation',   label: 'RAD',   format: (v) => Number(v).toFixed(3),        sourceField: 'biometric' },
];

const ROW_2: IndicatorConfig[] = [
    { key: 'battery',  label: 'BATT', format: (v) => `${Number(v).toFixed(0)}%`,  sourceField: 'device' },
    { key: 'link',     label: 'LINK', format: (v) => `${Number(v).toFixed(0)}%`,  sourceField: 'device' },
    { key: 'humidity', label: 'HUM',  format: (v) => `${Number(v).toFixed(0)}%`,  sourceField: 'weather' },
];

function getValueColor(key: string, value: number): string {
    if (key === 'battery' && value < 20) return '#ff6b6b';
    if (key === 'battery' && value < 50) return '#ffd43b';
    if (key === 'oxygen' && value < 60) return '#ff6b6b'; // air quality below 60% (AQI > 40)
    if (key === 'oxygen' && value < 80) return '#ffd43b';
    if (key === 'radiation' && value > 0.08) return '#ff6b6b';
    if (key === 'bpm' && (value > 120 || value < 45)) return '#ff6b6b';
    return '#fff';
}

function resolveSource(field: IndicatorConfig['sourceField'], telemetry: TelemetryData): SourceKind {
    if (field === 'device') {
        // Real if our hook produced data (battery > 0 typically means we got a reading)
        return 'real';
    }
    const sources = telemetry.data_sources;
    if (!sources) return 'unknown';
    const value = sources[field];
    if (value === 'open-meteo' || value === 'open-meteo-aqi') return 'real';
    if (value === 'simulated-coherent') return 'coherent';
    if (value === 'simulated') return 'simulated';
    return 'unknown';
}

const SOURCE_DOT_COLOR: Record<SourceKind, string> = {
    real: '#00d4aa',
    coherent: '#ffbb33',
    simulated: '#ff4444',
    unknown: '#555',
};

function TelemetryRow({
    indicators,
    telemetry,
}: { indicators: IndicatorConfig[]; telemetry: TelemetryData }) {
    return (
        <View style={styles.telemetryRow}>
            {indicators.map((ind) => {
                const raw = telemetry[ind.key];
                const value = typeof raw === 'number' ? raw : 0;
                const source = resolveSource(ind.sourceField, telemetry);
                return (
                    <View key={ind.key} style={styles.telemetryCard}>
                        <View
                            style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: SOURCE_DOT_COLOR[source],
                            }}
                        />
                        <Text
                            style={[
                                styles.telemetryValue,
                                { color: getValueColor(ind.key as string, value) },
                            ]}
                        >
                            {ind.format(value)}
                        </Text>
                        <Text style={styles.telemetryLabel}>{ind.label}</Text>
                    </View>
                );
            })}
        </View>
    );
}

export function TelemetryPanel({ telemetry, isScanning, scanTranslateY }: TelemetryPanelProps) {
    return (
        <View style={styles.telemetryContainer}>
            <TelemetryRow indicators={ROW_1} telemetry={telemetry} />
            <View style={{ height: 8 }} />
            <TelemetryRow indicators={ROW_2} telemetry={telemetry} />

            {isScanning && (
                <Animated.View
                    style={[
                        styles.scanLine,
                        { transform: [{ translateY: scanTranslateY }] },
                    ]}
                />
            )}
        </View>
    );
}
