/**
 * useAlerts Hook
 * Fetches actionable alerts from Supabase (same logic as web alerts.js)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabase';

export interface AlertItem {
    id: string;
    nombre: string;
    detail?: string;
}

export interface AlertGroup {
    id: string;
    title: string;
    icon: string;
    borderColor: string;
    items: AlertItem[];
}

export function useAlerts() {
    const [alerts, setAlerts] = useState<AlertGroup[]>([]);
    const [totalCount, setTotalCount] = useState(0);

    const fetchAlerts = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const userId = session.user.id;

            const [poisRes, persRes, misRes, objRes] = await Promise.all([
                // POIs needing verification
                supabase
                    .from('puntos_interes')
                    .select('id, nombre, nivel_riesgo')
                    .eq('user_id', userId)
                    .or('descripcion.is.null,nivel_riesgo.in.(alto,critico,peligro)')
                    .order('created_at', { ascending: false })
                    .limit(3),
                // High threat personas
                supabase
                    .from('personas_encontradas')
                    .select('id, nombre, contexto')
                    .eq('user_id', userId)
                    .or('contexto.ilike.%peligro%,contexto.ilike.%hostil%,contexto.ilike.%amenaza%')
                    .order('created_at', { ascending: false })
                    .limit(3),
                // Missions without documentation
                supabase
                    .from('misiones')
                    .select('id, codigo, estado, descripcion_ia')
                    .eq('user_id', userId)
                    .eq('estado', 'completada')
                    .or('descripcion_ia.is.null,descripcion_ia.eq.')
                    .order('inicio_at', { ascending: false })
                    .limit(3),
                // Low confidence objects
                supabase
                    .from('objetos_exploracion')
                    .select('id, nombre, confianza')
                    .eq('user_id', userId)
                    .lt('confianza', 0.5)
                    .order('created_at', { ascending: false })
                    .limit(3),
            ]);

            const groups: AlertGroup[] = [];

            const poisItems = (poisRes.data ?? []).map(p => ({
                id: p.id,
                nombre: p.nombre || 'POI sin nombre',
                detail: p.nivel_riesgo,
            }));
            if (poisItems.length > 0) {
                groups.push({
                    id: 'pois',
                    title: 'POIs por verificar',
                    icon: '📍',
                    borderColor: '#ffa94d',
                    items: poisItems,
                });
            }

            const persItems = (persRes.data ?? []).map(p => ({
                id: p.id,
                nombre: p.nombre,
                detail: p.contexto,
            }));
            if (persItems.length > 0) {
                groups.push({
                    id: 'personas',
                    title: 'Personas amenazantes',
                    icon: '⚠️',
                    borderColor: '#ff6b6b',
                    items: persItems,
                });
            }

            const misItems = (misRes.data ?? []).map((m: any) => ({
                id: m.id,
                nombre: m.codigo || 'Misión',
                detail: 'Sin documentación IA',
            }));
            if (misItems.length > 0) {
                groups.push({
                    id: 'misiones',
                    title: 'Misiones sin documentar',
                    icon: '📋',
                    borderColor: '#74c0fc',
                    items: misItems,
                });
            }

            const objItems = (objRes.data ?? []).map(o => ({
                id: o.id,
                nombre: o.nombre || 'Objeto',
                detail: `${((o.confianza ?? 0) * 100).toFixed(0)}% confianza`,
            }));
            if (objItems.length > 0) {
                groups.push({
                    id: 'objetos',
                    title: 'Objetos baja confianza',
                    icon: '🔍',
                    borderColor: '#b197fc',
                    items: objItems,
                });
            }

            setAlerts(groups);
            setTotalCount(groups.reduce((sum, g) => sum + g.items.length, 0));
        } catch (error) {
            console.log('[Alerts] Error:', error);
        }
    }, []);

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 30000);
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    return { alerts, totalCount, refetch: fetchAlerts };
}
