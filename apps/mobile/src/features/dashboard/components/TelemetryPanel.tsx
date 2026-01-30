/**
 * TelemetryPanel Component
 * Displays telemetry data with scan animation
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

export function TelemetryPanel({
    telemetry,
    isScanning,
    scanTranslateY,
}: TelemetryPanelProps) {
    return (
        <View style={styles.telemetryContainer}>
            <View style={styles.telemetryRow}>
                {/* Temperature */}
                <View style={styles.telemetryCard}>
                    <Text style={styles.telemetryValue}>{telemetry.temperature.toFixed(0)}°C</Text>
                    <Text style={styles.telemetryLabel}>TEMP</Text>
                </View>

                {/* Oxygen */}
                <View style={styles.telemetryCard}>
                    <Text style={styles.telemetryValue}>{telemetry.oxygen.toFixed(0)}%</Text>
                    <Text style={styles.telemetryLabel}>O2</Text>
                </View>

                {/* BPM */}
                <View style={styles.telemetryCard}>
                    <Text style={styles.telemetryValue}>{telemetry.bpm.toFixed(0)}</Text>
                    <Text style={styles.telemetryLabel}>BPM</Text>
                </View>

                {/* Radiation */}
                <View style={styles.telemetryCard}>
                    <Text style={styles.telemetryValue}>{telemetry.radiation.toFixed(3)}</Text>
                    <Text style={styles.telemetryLabel}>RAD</Text>
                </View>
            </View>

            {/* Scanner line */}
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
