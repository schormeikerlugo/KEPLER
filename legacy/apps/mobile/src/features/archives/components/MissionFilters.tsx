import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { styles } from '../styles';
import { MissionStatus } from '../types';

interface MissionFiltersProps {
    current: MissionStatus;
    onChange: (status: MissionStatus) => void;
}

export const MissionFilters = ({ current, onChange }: MissionFiltersProps) => {
    const filters: { id: MissionStatus; label: string; color: string }[] = [
        { id: 'ALL', label: 'TODAS', color: '#fff' },
        { id: 'ACTIVA', label: '🟢 EN CURSO', color: '#00ff88' },
        { id: 'COMPLETADA', label: '🔵 COMPLETADO', color: '#3fa8ff' },
    ];

    return (
        <View style={styles.filterContainer}>
            {filters.map(filter => (
                <TouchableOpacity
                    key={filter.id}
                    style={[
                        styles.filterPill,
                        current === filter.id && styles.filterPillActive
                    ]}
                    onPress={() => onChange(filter.id)}
                >
                    <Text style={[
                        styles.filterText,
                        current === filter.id && styles.filterTextActive
                    ]}>
                        {filter.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};
