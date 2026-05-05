/**
 * ExplorerStats - Boot wear + physical resistance progress bars
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ExplorerStatsData } from '../hooks/useExplorerStats';

function getBarColor(value: number): string {
    if (value > 60) return '#51cf66';
    if (value > 30) return '#ffd43b';
    return '#ff6b6b';
}

interface Props {
    stats: ExplorerStatsData;
}

export function ExplorerStats({ stats }: Props) {
    return (
        <View style={s.container}>
            <Text style={s.title}>📊 Stats Explorador</Text>
            <View style={s.divider} />

            {/* Boot Wear */}
            <View style={s.statRow}>
                <Text style={s.statIcon}>👟</Text>
                <View style={s.statInfo}>
                    <View style={s.statHeader}>
                        <Text style={s.statLabel}>Calzado</Text>
                        <Text style={[s.statValue, { color: getBarColor(stats.shoeCondition) }]}>
                            {stats.shoeCondition.toFixed(0)}%
                        </Text>
                    </View>
                    <View style={s.barBg}>
                        <View
                            style={[
                                s.barFill,
                                {
                                    width: `${Math.min(100, stats.shoeCondition)}%` as any,
                                    backgroundColor: getBarColor(stats.shoeCondition),
                                },
                            ]}
                        />
                    </View>
                </View>
            </View>

            {/* Physical Resistance */}
            <View style={s.statRow}>
                <Text style={s.statIcon}>⚡</Text>
                <View style={s.statInfo}>
                    <View style={s.statHeader}>
                        <Text style={s.statLabel}>Resistencia</Text>
                        <Text style={[s.statValue, { color: getBarColor(stats.resistance) }]}>
                            {stats.resistance.toFixed(0)}%
                        </Text>
                    </View>
                    <View style={s.barBg}>
                        <View
                            style={[
                                s.barFill,
                                {
                                    width: `${Math.min(100, stats.resistance)}%` as any,
                                    backgroundColor: getBarColor(stats.resistance),
                                },
                            ]}
                        />
                    </View>
                </View>
            </View>

            {/* Missions Completed */}
            <View style={s.missionsStat}>
                <Text style={s.missionsIcon}>🏆</Text>
                <Text style={s.missionsLabel}>Misiones completadas</Text>
                <Text style={s.missionsValue}>{stats.missionsCompleted}</Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: '#121212',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    title: { fontSize: 16, fontWeight: '600', color: '#fff' },
    divider: { height: 1, backgroundColor: '#222', marginVertical: 12 },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        gap: 12,
    },
    statIcon: { fontSize: 22 },
    statInfo: { flex: 1 },
    statHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    statLabel: { color: '#aaa', fontSize: 12, fontWeight: '500' },
    statValue: { fontSize: 12, fontWeight: '700' },
    barBg: {
        height: 6,
        backgroundColor: '#1a1a1a',
        borderRadius: 3,
        overflow: 'hidden',
    },
    barFill: {
        height: 6,
        borderRadius: 3,
    },
    missionsStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#1a1a1a',
        padding: 12,
        borderRadius: 10,
    },
    missionsIcon: { fontSize: 18 },
    missionsLabel: { color: '#aaa', fontSize: 12, flex: 1 },
    missionsValue: { color: '#3fa8ff', fontSize: 18, fontWeight: '700' },
});
