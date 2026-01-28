/**
 * Profile Stats Module
 * Handles loading and displaying user exploration statistics
 */

import { supabase } from '../../../js/auth.js';

/**
 * Load and display user stats from database
 */
export async function loadStats(userId) {
    try {
        // Get missions count
        const { count: missionsCount } = await supabase
            .from('misiones')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // Get objects count
        const { count: objectsCount } = await supabase
            .from('objetos_exploracion')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // Get POIs (checkpoints)
        const { count: poisCount } = await supabase
            .from('objetos_exploracion')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('tipo', ['checkpoint', 'punto_asentamiento']);

        // Calculate total hours (from completed missions)
        const { data: missions } = await supabase
            .from('misiones')
            .select('inicio_at, fin_at')
            .eq('user_id', userId)
            .eq('estado', 'completada');

        let totalHours = 0;
        if (missions) {
            missions.forEach(m => {
                if (m.inicio_at && m.fin_at) {
                    const diff = new Date(m.fin_at) - new Date(m.inicio_at);
                    totalHours += diff / (1000 * 60 * 60);
                }
            });
        }

        // Update UI
        updateStatsUI({
            missions: missionsCount || 0,
            objects: objectsCount || 0,
            pois: poisCount || 0,
            hours: totalHours.toFixed(1)
        });

    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

/**
 * Update stats display in UI
 */
function updateStatsUI(stats) {
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues.length >= 4) {
        statValues[0].textContent = stats.missions;
        statValues[1].textContent = stats.objects;
        statValues[2].textContent = stats.pois;
        statValues[3].textContent = stats.hours;
    }
}
