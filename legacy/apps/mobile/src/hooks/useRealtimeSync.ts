/**
 * useRealtimeSync Hook
 * Subscribes to Supabase Realtime channels for live updates
 * Replaces polling with WebSocket-based reactivity
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeTable =
    | 'misiones'
    | 'objetos_exploracion'
    | 'personas_encontradas'
    | 'puntos_interes'
    | 'rutas_exploracion';

interface RealtimeEvent {
    table: RealtimeTable;
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    record: any;
}

type RealtimeCallback = (event: RealtimeEvent) => void;

const WATCHED_TABLES: RealtimeTable[] = [
    'misiones',
    'objetos_exploracion',
    'personas_encontradas',
    'puntos_interes',
    'rutas_exploracion',
];

export function useRealtimeSync(onEvent: RealtimeCallback) {
    const channelRef = useRef<RealtimeChannel | null>(null);
    const callbackRef = useRef(onEvent);
    callbackRef.current = onEvent;

    useEffect(() => {
        const channel = supabase.channel('kepler-dashboard');

        WATCHED_TABLES.forEach((table) => {
            channel.on(
                'postgres_changes' as any,
                { event: '*', schema: 'public', table },
                (payload: any) => {
                    callbackRef.current({
                        table,
                        eventType: payload.eventType,
                        record: payload.new || payload.old,
                    });
                }
            );
        });

        channel.subscribe((status) => {
            console.log('[Realtime] Channel status:', status);
        });

        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, []);

    const isConnected = useCallback(() => {
        return channelRef.current?.state === 'joined';
    }, []);

    return { isConnected };
}
