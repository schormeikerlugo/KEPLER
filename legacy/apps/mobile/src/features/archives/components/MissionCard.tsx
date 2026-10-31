import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Mission } from '../../../services/api';
import { styles } from '../styles';

interface MissionCardProps {
    mission: Mission;
    onPress: (id: string) => void;
}

export const MissionCard = ({ mission, onPress }: MissionCardProps) => {
    const isCompleted = mission.status === 'COMPLETADA';

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => onPress(mission.id)}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.missionCode}>{mission.code}</Text>
                <View style={[
                    styles.statusBadge,
                    isCompleted && { backgroundColor: 'rgba(63, 168, 255, 0.1)' }
                ]}>
                    <Text style={[
                        styles.statusText,
                        isCompleted && { color: '#3fa8ff' }
                    ]}>
                        {mission.status}
                    </Text>
                </View>
            </View>

            <View style={styles.cardMeta}>
                <View style={styles.metaRow}>
                    <Text style={styles.metaIcon}>📅</Text>
                    <Text style={styles.metaText}>
                        {new Date(mission.created_at).toLocaleString()}
                    </Text>
                </View>
                <View style={styles.metaRow}>
                    <Text style={styles.metaIcon}>📍</Text>
                    <Text style={styles.metaText}>
                        Sin ubicación
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
};
