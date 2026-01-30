/**
 * MissionsSection Component
 * Missions list section
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Mission } from '../../../services/api';
import { MissionsIcon } from '../../../components/icons/DashboardIcons';
import { styles } from '../styles';

interface MissionsSectionProps {
    missions: Mission[];
    onMissionPress?: (mission: Mission) => void;
}

export function MissionsSection({
    missions,
    onMissionPress,
}: MissionsSectionProps) {
    return (
        <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                    <MissionsIcon size={20} color="#fff" />
                    <Text style={styles.sectionTitle}>Missions</Text>
                </View>
                <Text style={styles.missionCount}>{missions.length}</Text>
            </View>
            <View style={styles.sectionDivider} />

            {missions.length === 0 ? (
                <Text style={styles.noDataText}>No missions active</Text>
            ) : (
                missions.slice(0, 5).map((mission) => (
                    <TouchableOpacity
                        key={mission.id}
                        style={styles.missionItem}
                        onPress={() => onMissionPress?.(mission)}
                    >
                        <Text style={styles.missionIcon}>🚀</Text>
                        <Text style={styles.missionCode}>
                            {mission.code} {mission.status}
                        </Text>
                    </TouchableOpacity>
                ))
            )}
        </View>
    );
}
