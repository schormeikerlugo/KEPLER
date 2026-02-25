/**
 * Telemetry Module
 * Handles real-time telemetry polling and display updates
 */

import { api } from '../../../../js/services/api.js';

export async function initTelemetry() {
    const tTemp = document.getElementById('telem-temp');
    const tO2 = document.getElementById('telem-o2');
    const tBpm = document.getElementById('telem-bpm');
    const tRad = document.getElementById('telem-rad');
    const tPwr = document.getElementById('telem-pwr');
    const tDist = document.getElementById('telem-dist');
    const tCrew = document.getElementById('telem-crew');
    const tNearbyObj = document.getElementById('telem-nearby-obj');

    // Init Battery
    let batteryManager = null;
    if (navigator.getBattery) {
        navigator.getBattery().then(b => batteryManager = b);
    }

    const update = async () => {
        if (!document.getElementById('telem-temp')) return;

        try {
            const data = await api.getTelemetry();

            if (data) {
                if (tTemp) tTemp.textContent = data.temperature + '°C';
                if (tO2) tO2.textContent = data.oxygen_level + '%';
                if (tBpm) tBpm.textContent = data.heart_rate;
                if (tRad) tRad.textContent = data.radiation;
            } else {
                // Fallback Simulation
                if (tTemp) tTemp.textContent = (20 + Math.random() * 0.5).toFixed(1) + '°C';
                if (tO2) tO2.textContent = (96 + Math.random() * 0.2).toFixed(1) + '%';
                if (tBpm) tBpm.textContent = Math.floor(75 + Math.random() * 5);
                if (tRad) tRad.textContent = (0.011 + Math.random() * 0.001).toFixed(3);
            }

            // Update Battery
            if (tPwr) {
                if (batteryManager) {
                    tPwr.textContent = Math.floor(batteryManager.level * 100) + '%';
                    if (batteryManager.level <= 0.2) tPwr.style.color = '#ff4444';
                    else tPwr.style.color = '';
                } else {
                    tPwr.textContent = '100%';
                }
            }

            // Sync Nearby Objects from the UI Data Grid
            if (tNearbyObj) {
                const globalObjCount = document.getElementById('objects-count');
                tNearbyObj.textContent = globalObjCount ? globalObjCount.textContent : '0';
            }

            // Active Crew (Simulated or fetched)
            if (tCrew) {
                // Fetch active missions from Supabase
                const { supabase } = await import('../../../../js/auth.js');
                const { count, error } = await supabase
                    .from('misiones')
                    .select('*', { count: 'exact', head: true })
                    .eq('estado', 'activa');

                if (!error && count !== null) {
                    tCrew.textContent = Math.max(1, count); // at least 1 (self)
                }
            }

        } catch (err) {
            console.error('Telemetry error:', err);
        }

        setTimeout(update, 2000);
    };

    update();

    // Init GPS Check for Status Badge & Distance Calculation
    import('../../../../js/engines/GPSEngine.js').then(module => {
        const GPSEngine = module.GPSEngine;
        const gps = new GPSEngine();

        let totalDistanceKm = 0;
        let lastPos = null;

        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        gps.onPositionUpdate = (pos) => {
            const el = document.getElementById('dash-gps-status');
            if (el) {
                const source = pos.source || 'GPS';
                el.textContent = `[${source}]`;

                if (source === 'GPS') el.style.color = '#00ff00';
                else if (source === 'MANUAL') el.style.color = 'orange';
                else el.style.color = '#ffff00';
            }

            // Calculate Distance
            if (lastPos && pos.source !== 'IP') {
                const dist = calculateDistance(lastPos.lat, lastPos.lng, pos.lat, pos.lng);
                // Only add if reasonable (e.g. less than 1km jump to avoid GPS spikes)
                if (dist > 0.001 && dist < 1.0) {
                    totalDistanceKm += dist;
                }
            }
            lastPos = pos;

            if (tDist) {
                tDist.textContent = totalDistanceKm.toFixed(2) + ' km';
            }
        };

        gps.start(); // Will fallback to IP/Manual if needed
    }).catch(e => console.error("Failed to load GPS for Dashboard", e));
}
