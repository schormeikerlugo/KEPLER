/**
 * useArchives Hook
 * Manages mission list fetching and filtering
 */
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api, Mission } from '../../../services/api';
import { MissionStatus } from '../types';

export function useArchives() {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [filter, setFilter] = useState<MissionStatus>('ALL');
    const [loading, setLoading] = useState(true);

    const fetchMissions = useCallback(async () => {
        setLoading(true);
        const data = await api.getMissions();
        setMissions(data);
        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchMissions();
        }, [fetchMissions])
    );

    const filteredMissions = missions.filter(m => {
        if (filter === 'ALL') return true;
        if (filter === 'ACTIVA') return m.status !== 'COMPLETADA';
        if (filter === 'COMPLETADA') return m.status === 'COMPLETADA';
        return true;
    });

    return {
        missions: filteredMissions,
        loading,
        filter,
        setFilter,
        refresh: fetchMissions
    };
}
