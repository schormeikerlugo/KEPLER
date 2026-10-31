/**
 * useDashboardCounts Hook
 * Fetches real counts from Supabase for dashboard cards
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabase';

export interface DashboardCounts {
    objetos: number;
    personas: number;
    pois: number;
    rutas: number;
    misionesActivas: number;
}

export function useDashboardCounts() {
    const [counts, setCounts] = useState<DashboardCounts>({
        objetos: 0,
        personas: 0,
        pois: 0,
        rutas: 0,
        misionesActivas: 0,
    });
    const [loading, setLoading] = useState(true);

    const fetchCounts = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const userId = session.user.id;

            const [objRes, persRes, poisRes, rutasRes, misRes] = await Promise.all([
                supabase.from('objetos_exploracion').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('personas_encontradas').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('puntos_interes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('rutas_exploracion').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('misiones').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('estado', 'activa'),
            ]);

            setCounts({
                objetos: objRes.count ?? 0,
                personas: persRes.count ?? 0,
                pois: poisRes.count ?? 0,
                rutas: rutasRes.count ?? 0,
                misionesActivas: misRes.count ?? 0,
            });
        } catch (error) {
            console.log('[Counts] Error fetching counts:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCounts();
        const interval = setInterval(fetchCounts, 15000);
        return () => clearInterval(interval);
    }, [fetchCounts]);

    return { counts, loading, refetch: fetchCounts };
}
