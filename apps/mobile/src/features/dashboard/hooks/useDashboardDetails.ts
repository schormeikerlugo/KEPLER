/**
 * useDashboardDetails Hook
 * Fetches recent items from each Supabase table for dashboard card previews
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabase';

export interface DashboardObject {
    id: string;
    nombre: string;
    tipo: string;
    categoria_id?: string;
    categoria_nombre?: string;
    confianza?: number;
    created_at: string;
}

export interface DashboardPersona {
    id: string;
    nombre: string;
    contexto?: string;
    image_url?: string;
    created_at: string;
}

export interface DashboardPOI {
    id: string;
    nombre: string;
    poi_categoria?: string;
    categoria_id?: string;
    nivel_riesgo?: string;
    zona?: string;
    created_at: string;
}

export interface DashboardRuta {
    id: string;
    nombre: string;
    distancia_km?: number;
    seguridad?: string;
    tipo_terreno?: string;
    created_at: string;
}

export interface DashboardDetails {
    objetos: DashboardObject[];
    personas: DashboardPersona[];
    pois: DashboardPOI[];
    rutas: DashboardRuta[];
    loading: boolean;
}

export function useDashboardDetails(): DashboardDetails & { refetch: () => Promise<void> } {
    const [objetos, setObjetos] = useState<DashboardObject[]>([]);
    const [personas, setPersonas] = useState<DashboardPersona[]>([]);
    const [pois, setPois] = useState<DashboardPOI[]>([]);
    const [rutas, setRutas] = useState<DashboardRuta[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const userId = session.user.id;

            const [objRes, persRes, poisRes, rutasRes] = await Promise.all([
                supabase
                    .from('objetos_exploracion')
                    .select('id, nombre, tipo, categoria_id, confianza, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(5),
                supabase
                    .from('personas_encontradas')
                    .select('id, nombre, contexto, image_url, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(5),
                supabase
                    .from('puntos_interes')
                    .select('id, nombre, poi_categoria, categoria_id, nivel_riesgo, zona, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(5),
                supabase
                    .from('rutas_exploracion')
                    .select('id, nombre, distancia_km, seguridad, tipo_terreno, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(5),
            ]);

            setObjetos((objRes.data as DashboardObject[]) ?? []);
            setPersonas((persRes.data as DashboardPersona[]) ?? []);
            setPois((poisRes.data as DashboardPOI[]) ?? []);
            setRutas((rutasRes.data as DashboardRuta[]) ?? []);
        } catch (error) {
            console.log('[Details] Error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 30000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    return { objetos, personas, pois, rutas, loading, refetch: fetchAll };
}
