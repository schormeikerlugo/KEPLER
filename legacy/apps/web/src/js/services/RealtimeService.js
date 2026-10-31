import { supabase } from '../auth.js';

export class RealtimeService {
    constructor() {
        this.channel = null;
        this.userCache = {}; // Cache user emails
        this.init();
    }

    init() {
        console.log("RealtimeService: Connecting...");

        this.channel = supabase
            .channel('public:misiones') // Listen to misiones table
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'misiones' },
                (payload) => {
                    this.handleMissionEvent(payload);
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log("Realtime: Connected to Missions Channel ✅");
                    // Status is now shown in dashboard service check
                } else {
                    console.warn(`Realtime Status: ${status}`, err);
                }

                if (status === 'CHANNEL_ERROR') {
                    console.error("Realtime Error: Check if 'misiones' table has Realtime enabled in Supabase Dashboard > Database > Replication.");
                }
            });
    }

    /**
     * Get user display name from user_id (with caching)
     * Fetches from profiles table for custom display names
     */
    async getUserDisplayName(userId) {
        if (!userId) return 'Sistema';
        if (this.userCache[userId]) return this.userCache[userId];

        try {
            // Try to get from profiles table first
            const { data, error } = await supabase
                .from('profiles')
                .select('display_name, username')
                .eq('id', userId)
                .single();

            if (!error && data) {
                const name = data.display_name || data.username || `Usuario-${userId.substring(0, 6)}`;
                this.userCache[userId] = name;
                return name;
            }

            // Fallback: Use short UUID
            const shortId = userId.substring(0, 6);
            this.userCache[userId] = `Usuario-${shortId}`;
            return this.userCache[userId];
        } catch (e) {
            const shortId = userId.substring(0, 6);
            this.userCache[userId] = `Usuario-${shortId}`;
            return this.userCache[userId];
        }
    }

    async handleMissionEvent(payload) {
        if (!window.kepler || !window.kepler.notify) return;

        console.log("Realtime Event:", payload);

        const { eventType, new: newRec, old: oldRec } = payload;
        const userDisplayName = await this.getUserDisplayName(newRec?.user_id || oldRec?.user_id);

        const missionCtx = { source: 'realtime', mission: { id: newRec?.id, codigo: newRec?.codigo, zona: newRec?.zona || oldRec?.zona, estado: newRec?.estado }, user: userDisplayName };

        if (eventType === 'INSERT') {
            window.kepler.notify.info(`📡 NUEVA MISIÓN DETECTADA`, { ...missionCtx, event: 'INSERT' });
            window.kepler.notify.success(`Código: ${newRec.codigo || 'S/N'} | Zona: ${newRec.zona || 'Sin definir'}\n👤 por ${userDisplayName}`, { ...missionCtx, event: 'INSERT' });
        }
        else if (eventType === 'UPDATE') {
            if (newRec.estado !== oldRec?.estado) {
                if (newRec.estado === 'completada') {
                    await this.showMissionCompletionStats(newRec, userDisplayName);
                }
                else if (newRec.estado === 'activa') {
                    window.kepler.notify.warning(`🚀 MISIÓN ACTIVADA: ${newRec.codigo}\n👤 por ${userDisplayName}`, { ...missionCtx, event: 'ACTIVATED' });
                }
            }
        }
        else if (eventType === 'DELETE') {
            window.kepler.notify.warning(`⚠️ Misión eliminada del registro central.\n👤 por ${userDisplayName}`, { ...missionCtx, event: 'DELETE' });
        }
    }

    async showMissionCompletionStats(mission, userDisplayName = 'Sistema') {
        try {
            // Dynamically import api to get mission objects
            const { api } = await import('./api.js');
            const objects = await api.getMissionObjects(mission.id);

            // Calculate stats
            const totalObjects = objects?.length || 0;
            const manualObjects = objects?.filter(o => o.metadata?.source === 'manual')?.length || 0;
            const checkpoints = objects?.filter(o => o.tipo === 'checkpoint' || o.tipo === 'punto_asentamiento')?.length || 0;

            // Calculate duration
            const startTime = mission.inicio_at ? new Date(mission.inicio_at) : null;
            const endTime = mission.fin_at ? new Date(mission.fin_at) : new Date();
            let duration = 'N/A';
            if (startTime) {
                const diffMs = endTime - startTime;
                const mins = Math.floor(diffMs / 60000);
                const hrs = Math.floor(mins / 60);
                duration = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
            }

            const statsCtx = {
                source: 'realtime', event: 'COMPLETED',
                mission: { id: mission.id, codigo: mission.codigo, zona: mission.zona, estado: 'completada' },
                stats: { totalObjects, manualObjects, checkpoints, duration },
                user: userDisplayName
            };

            window.kepler.notify.success(
                `✅ MISIÓN COMPLETADA: ${mission.codigo}\n` +
                `👤 por ${userDisplayName}\n` +
                `📍 Zona: ${mission.zona || 'Sin definir'}\n` +
                `⏱️ Duración: ${duration}\n` +
                `📦 Objetos registrados: ${totalObjects}\n` +
                `✋ Objetos manuales: ${manualObjects}\n` +
                `🏕️ Puntos de asentamiento: ${checkpoints}`,
                statsCtx
            );
        } catch (e) {
            console.error('Error fetching mission stats:', e);
            window.kepler.notify.success(`✅ MISIÓN COMPLETADA: ${mission.codigo}\n👤 por ${userDisplayName}`, { source: 'realtime', event: 'COMPLETED', mission: { codigo: mission.codigo } });
        }
    }
}
