/**
 * MissionsSection Component
 * Missions list with colored status badges (up to 10 items)
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Mission } from '../../../services/api';
import { MissionsIcon } from '../../../components/icons/DashboardIcons';
import { styles } from '../styles';

interface MissionsSectionProps {
    missions: Mission[];
    onMissionPress?: (mission: Mission) => void;
    onViewAll?: () => void;
}

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
    ACTIVA: { label: 'ACTIVA', bg: 'rgba(81, 207, 102, 0.15)', text: '#51cf66' },
    activa: { label: 'ACTIVA', bg: 'rgba(81, 207, 102, 0.15)', text: '#51cf66' },
    COMPLETADA: { label: 'COMPLETADA', bg: 'rgba(63, 168, 255, 0.15)', text: '#3fa8ff' },
    completada: { label: 'COMPLETADA', bg: 'rgba(63, 168, 255, 0.15)', text: '#3fa8ff' },
    fallida: { label: 'FALLIDA', bg: 'rgba(255, 107, 107, 0.15)', text: '#ff6b6b' },
    abortada: { label: 'ABORTADA', bg: 'rgba(255, 107, 107, 0.15)', text: '#ff6b6b' },
    planificada: { label: 'PLANIFICADA', bg: 'rgba(136, 136, 136, 0.15)', text: '#888' },
};

function getStatusBadge(status: string) {
    return STATUS_BADGES[status] || STATUS_BADGES['planificada'];
}

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
        return '';
    }
}

export function MissionsSection({ missions, onMissionPress, onViewAll }: MissionsSectionProps) {
    return (
        <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                    <MissionsIcon size={20} color="#fff" />
                    <Text style={styles.sectionTitle}>Misiones</Text>
                </View>
                <Text style={styles.missionCount}>{missions.length}</Text>
            </View>
            <View style={styles.sectionDivider} />

            {missions.length === 0 ? (
                <Text style={styles.noDataText}>Sin misiones activas</Text>
            ) : (
                missions.slice(0, 10).map((mission) => {
                    const badge = getStatusBadge(mission.status);
                    return (
                        <TouchableOpacity
                            key={mission.id}
                            style={styles.missionItem}
                            onPress={() => onMissionPress?.(mission)}
                        >
                            <Text style={styles.missionIcon}>🚀</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.missionCode} numberOfLines={1}>
                                    {mission.code}
                                </Text>
                                <Text style={styles.missionDate}>
                                    {formatDate(mission.created_at)}
                                </Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                                <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                                    {badge.label}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })
            )}

            {onViewAll && missions.length > 0 && (
                <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll}>
                    <Text style={styles.viewAllText}>VER TODO ›</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
