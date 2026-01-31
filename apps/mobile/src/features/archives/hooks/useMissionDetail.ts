/**
 * useMissionDetail Hook
 * Manages single mission details and actions
 */
import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../../services/api';
import { MissionDetail } from '../types';

export function useMissionDetail(missionId: string) {
    const navigation = useNavigation();
    const [mission, setMission] = useState<MissionDetail | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchDetails = useCallback(async () => {
        setLoading(true);
        const data = await api.getMissionDetails(missionId);
        setMission(data);
        setLoading(false);
    }, [missionId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    const completeMission = async () => {
        if (!mission) return;

        const success = await api.updateMission(mission.id, { status: 'COMPLETADA' });
        if (success) {
            setMission(prev => prev ? { ...prev, status: 'COMPLETADA' } : null);
            Alert.alert('Misión Finalizada', 'La misión ha sido marcada como completada.');
        }
    };

    const deleteMission = async () => {
        if (!mission) return;

        const success = await api.deleteMission(mission.id);
        if (success) {
            navigation.goBack();
        } else {
            Alert.alert('Error', 'No se pudo eliminar la misión.');
        }
    };

    return {
        mission,
        loading,
        completeMission,
        deleteMission,
        refresh: fetchDetails
    };
}
