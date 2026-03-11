/**
 * Telemetry Module (Adapted for Dashboard v2)
 * Polls backend via api.getTelemetry() every 2s
 * Updates the horizontal telemetry bar indicators
 */

import { api } from '../../../../js/services/api.js';

/**
 * Initialize telemetry polling and GPS distance tracking
 */
export async function initTelemetry() {
    const els = collectElements();
    if (!els.temp) return; // Safety check

    let batteryManager = null;
    if (navigator.getBattery) {
        navigator.getBattery().then(b => batteryManager = b);
    }

    // Start polling loop
    startPolling(els, batteryManager);

    // Start GPS distance tracking
    startGPSTracking(els);
}

/**
 * Collect all telemetry DOM elements (.telem-value inside each indicator)
 */
function collectElements() {
    return {
        temp: queryValue('telem-temp'),
        o2: queryValue('telem-o2'),
        bpm: queryValue('telem-bpm'),
        rad: queryValue('telem-rad'),
        batt: queryValue('telem-batt'),
        link: queryValue('telem-link'),
        tempS: queryValue('telem-temp-s'),
        humidity: queryValue('telem-humidity')
    };
}

/**
 * Get the .telem-value span inside an indicator by parent ID
 */
function queryValue(parentId) {
    const parent = document.getElementById(parentId);
    return parent ? parent.querySelector('.telem-value') : null;
}

/**
 * Start the 2-second polling loop that fetches telemetry from the backend
 */
function startPolling(els, batteryManager) {
    const update = async () => {
        if (!els.temp) return; // View unmounted

        try {
            const data = await api.getTelemetry();
            const values = extractValues(data);

            // Update DOM
            if (els.temp) els.temp.textContent = `${values.temp}°C`;
            if (els.o2) els.o2.textContent = `${values.o2}%`;
            if (els.bpm) els.bpm.textContent = `${values.bpm}`;
            if (els.rad) els.rad.textContent = `${values.rad}`;
            if (els.link) els.link.textContent = `${values.link}%`;
            if (els.tempS) els.tempS.textContent = `${values.tempS}°C`;
            if (els.humidity) els.humidity.textContent = `${values.humidity}%`;

            // Battery — use real device battery if available
            updateBattery(els.batt, batteryManager, values);

        } catch (err) {
            console.error('[Telemetry] Polling error:', err);
        }

        setTimeout(update, 2000);
    };

    update();
}

/**
 * Extract and normalize values from backend data, with simulation fallback
 */
function extractValues(data) {
    if (data) {
        return {
            temp: data.temperature ?? 20,
            o2: data.oxygen_level ?? 96,
            bpm: data.heart_rate ?? 75,
            rad: data.radiation ?? 0.011,
            batt: data.battery_level ?? 100,
            link: data.signal_strength ?? 98,
            tempS: data.suit_temperature ?? 20,
            humidity: data.humidity ?? 55
        };
    }

    // Simulate when backend is offline
    return {
        temp: parseFloat((20 + Math.random() * 0.5).toFixed(1)),
        o2: parseFloat((96 + Math.random() * 0.2).toFixed(1)),
        bpm: Math.floor(75 + Math.random() * 5),
        rad: parseFloat((0.011 + Math.random() * 0.005).toFixed(3)),
        batt: 100,
        link: parseFloat((97 + Math.random() * 2).toFixed(1)),
        tempS: parseFloat((20 + Math.random() * 0.3).toFixed(1)),
        humidity: parseFloat((55 + Math.random() * 5).toFixed(1))
    };
}

/**
 * Update battery display using device API or backend data
 */
function updateBattery(el, batteryManager, values) {
    if (!el) return;
    if (batteryManager) {
        el.textContent = `${Math.floor(batteryManager.level * 100)}%`;
    } else {
        el.textContent = `${values.batt}%`;
    }
}

/**
 * Start GPS tracking for the DIST indicator (if available)
 */
function startGPSTracking(els) {
    import('../../../../js/engines/GPSEngine.js').then(module => {
        const GPSEngine = module.GPSEngine;
        const gps = new GPSEngine();

        let totalDistanceKm = 0;
        let lastPos = null;

        gps.onPositionUpdate = (pos) => {
            if (lastPos && pos.source !== 'IP') {
                const dist = haversineDistance(lastPos.lat, lastPos.lng, pos.lat, pos.lng);
                if (dist > 0.001 && dist < 1.0) totalDistanceKm += dist;
            }
            lastPos = pos;
        };

        gps.start();
    }).catch(e => console.warn('[Telemetry] GPS unavailable:', e));
}

/**
 * Haversine formula: distance in km between two GPS coordinates
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
