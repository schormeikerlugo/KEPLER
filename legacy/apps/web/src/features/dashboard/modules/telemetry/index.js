/**
 * Telemetry Module — Real Data v2
 * --------------------------------
 * Two independent polling loops to avoid hammering external APIs:
 *
 *   • LOCAL  loop (every 2 s): battery, network — purely browser APIs.
 *   • REMOTE loop (every 5 min): weather + air quality + biometrics — backend
 *     call with coords resolved from GPS → sessionStorage → IP proxy.
 *
 * Coord resolution mirrors the sidebar strategy and uses the same keys
 * (`kepler_lat`, `kepler_lng`) so both modules share the same cache.
 *
 * Cache: REMOTE responses are stored in sessionStorage.kepler_telemetry
 * (TTL 5 min) so re-entering the dashboard hydrates instantly.
 *
 * Data-source dot per indicator:
 *   green   = real
 *   yellow  = simulated-coherent
 *   red     = simulated
 */

import { api } from '../../../../js/services/api.js';

const REMOTE_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const LOCAL_INTERVAL_MS = 2 * 1000;          // 2 seconds
const COORDS_RETRY_MS = 8 * 1000;            // 8 s — re-attempt while no coords
const CACHE_KEY = 'kepler_telemetry';
const CACHE_TTL_MS = REMOTE_INTERVAL_MS;

let remoteTimer = null;
let localTimer = null;
let coordsTimer = null;
let batteryManager = null;
let lastSpeedMps = 0;
let lastTelemetryPayload = null;
let resolvedCoords = null;       // { lat, lng, source } when known
let coordsResolutionInFlight = false;

/**
 * Public entry point.
 */
export async function initTelemetry() {
    const els = collectElements();
    if (!els.temp) return; // view not mounted

    // Battery API (web)
    if (navigator.getBattery) {
        try {
            batteryManager = await navigator.getBattery();
            const onBattery = () => updateBattery(els);
            batteryManager.addEventListener('levelchange', onBattery);
            batteryManager.addEventListener('chargingchange', onBattery);
        } catch (e) {
            console.warn('[Telemetry] Battery API unavailable:', e);
        }
    }

    // Hydrate UI from cache (instant feedback)
    const cached = readCache();
    if (cached) {
        lastTelemetryPayload = cached;
        applyRemote(els, cached);
    }

    // Start loops
    startRemoteLoop(els);
    startLocalLoop(els);

    // Track GPS for distance + speed (drives BPM in next remote tick)
    startGPSTracking(els);
}

/* ───────────────────────────────────────────────
 * DOM helpers
 * ─────────────────────────────────────────────── */

function collectElements() {
    return {
        temp: queryValue('telem-temp'),
        o2: queryValue('telem-o2'),
        bpm: queryValue('telem-bpm'),
        rad: queryValue('telem-rad'),
        batt: queryValue('telem-batt'),
        link: queryValue('telem-link'),
        humidity: queryValue('telem-humidity'),
        // parents for source-dot decoration
        parents: {
            temp: document.getElementById('telem-temp'),
            o2: document.getElementById('telem-o2'),
            bpm: document.getElementById('telem-bpm'),
            rad: document.getElementById('telem-rad'),
            batt: document.getElementById('telem-batt'),
            link: document.getElementById('telem-link'),
            humidity: document.getElementById('telem-humidity'),
        }
    };
}

function queryValue(parentId) {
    const parent = document.getElementById(parentId);
    return parent ? parent.querySelector('.telem-value') : null;
}

/* ───────────────────────────────────────────────
 * Coords helpers — GPS → sessionStorage → IP proxy
 * (same keys as sidebar.js so both modules stay in sync)
 * ─────────────────────────────────────────────── */

function readCachedCoords() {
    const lat = parseFloat(sessionStorage.getItem('kepler_lat'));
    const lng = parseFloat(sessionStorage.getItem('kepler_lng'));
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, source: 'cache' };
    return null;
}

function writeCachedCoords(lat, lng) {
    try {
        sessionStorage.setItem('kepler_lat', String(lat));
        sessionStorage.setItem('kepler_lng', String(lng));
    } catch { /* quota — ignore */ }
}

async function resolveCoords() {
    if (coordsResolutionInFlight) return resolvedCoords;
    coordsResolutionInFlight = true;
    try {
        // 1. Already cached this session? Trust it (sidebar/this module wrote it)
        const cached = readCachedCoords();
        if (cached) {
            resolvedCoords = cached;
            return cached;
        }

        // 2. Try GPS (browser geolocation)
        try {
            let permission = 'unknown';
            if (navigator.permissions) {
                try {
                    const status = await navigator.permissions.query({ name: 'geolocation' });
                    permission = status.state;
                } catch { /* not supported */ }
            }
            if (permission !== 'denied') {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 6000,
                        maximumAge: 60000,
                        enableHighAccuracy: false,
                    });
                });
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                writeCachedCoords(lat, lng);
                resolvedCoords = { lat, lng, source: 'gps' };
                console.log(`[Telemetry] Coords via GPS: ${lat}, ${lng}`);
                return resolvedCoords;
            }
        } catch (gpsErr) {
            console.log('[Telemetry] GPS denied/unavailable, falling back to IP…');
        }

        // 3. IP geolocation proxy (server-side, avoids CORS)
        try {
            const res = await fetch('/api/utils/geolocate');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.latitude && data.longitude) {
                    writeCachedCoords(data.latitude, data.longitude);
                    resolvedCoords = {
                        lat: data.latitude,
                        lng: data.longitude,
                        source: 'ip',
                    };
                    console.log(`[Telemetry] Coords via IP: ${data.latitude}, ${data.longitude}`);
                    return resolvedCoords;
                }
            }
        } catch (ipErr) {
            console.log('[Telemetry] IP proxy unavailable');
        }

        return null;
    } finally {
        coordsResolutionInFlight = false;
    }
}

/* ───────────────────────────────────────────────
 * REMOTE loop — backend (weather + AQ + bio)
 * ─────────────────────────────────────────────── */

function startRemoteLoop(els) {
    if (remoteTimer) clearInterval(remoteTimer);
    if (coordsTimer) clearInterval(coordsTimer);

    const fetchOnce = async () => {
        const coords = resolvedCoords || (await resolveCoords());
        const opts = coords
            ? { lat: coords.lat, lng: coords.lng, speed_mps: lastSpeedMps }
            : { speed_mps: lastSpeedMps };

        const data = await api.getTelemetry(opts);
        if (!data) return;

        lastTelemetryPayload = data;
        writeCache(data);
        applyRemote(els, data);

        // Surface diagnostic info
        if (!coords) {
            console.warn('[Telemetry] No coords yet — payload is simulated. Will retry.');
        }
    };

    // First tick (kicks off coord resolution + fetch)
    fetchOnce();

    // Every 5 min: full remote refresh
    remoteTimer = setInterval(fetchOnce, REMOTE_INTERVAL_MS);

    // Until coords resolve, retry quickly so the UI promotes from simulated→real
    coordsTimer = setInterval(async () => {
        if (resolvedCoords) {
            clearInterval(coordsTimer);
            coordsTimer = null;
            return;
        }
        const coords = await resolveCoords();
        if (coords) {
            clearInterval(coordsTimer);
            coordsTimer = null;
            // Force an immediate refresh now that we have coords
            fetchOnce();
        }
    }, COORDS_RETRY_MS);
}

function applyRemote(els, data) {
    const sources = data.data_sources || {};

    // Weather
    setText(els.temp, fmtTemp(data.temperature));
    setSourceDot(els.parents.temp, sources.weather);

    setText(els.humidity, fmtPct(data.humidity));
    setSourceDot(els.parents.humidity, sources.weather);

    // Air → oxygen_level
    setText(els.o2, fmtPct(data.oxygen_level));
    setSourceDot(els.parents.o2, sources.air);
    decorateO2(els.parents.o2, data);

    // Biometrics
    setText(els.bpm, data.heart_rate != null ? `${data.heart_rate}` : '--');
    setSourceDot(els.parents.bpm, sources.biometric);

    setText(els.rad, data.radiation != null ? `${data.radiation}` : '--');
    setSourceDot(els.parents.rad, sources.biometric);

    // Wind direction visual on the temp-suit indicator? No — we add a small
    // arrow on the humidity card title via dataset (used by CSS).
    if (els.parents.humidity && data.wind_direction != null) {
        els.parents.humidity.dataset.windDir = data.wind_direction;
    }
}

function decorateO2(parent, data) {
    if (!parent) return;
    if (data.air_category) {
        parent.dataset.airCategory = data.air_category;
        parent.title = `Calidad del aire: ${data.air_category} · AQI ${data.air_quality_aqi ?? '?'} · PM2.5 ${data.pm2_5 ?? '?'}µg/m³`;
    }
}

/* ───────────────────────────────────────────────
 * LOCAL loop — battery + network
 * ─────────────────────────────────────────────── */

function startLocalLoop(els) {
    if (localTimer) clearInterval(localTimer);

    const tick = () => {
        updateBattery(els);
        updateNetwork(els);
    };
    tick();
    localTimer = setInterval(tick, LOCAL_INTERVAL_MS);
}

function updateBattery(els) {
    if (!els.batt) return;
    if (batteryManager) {
        const pct = Math.floor(batteryManager.level * 100);
        els.batt.textContent = `${pct}%`;
        setSourceDot(els.parents.batt, 'real');
        if (els.parents.batt) {
            els.parents.batt.dataset.charging = batteryManager.charging ? '1' : '0';
        }
    } else {
        // Fallback: keep last backend value or 100
        const fallback = (lastTelemetryPayload && lastTelemetryPayload.battery_level) || 100;
        els.batt.textContent = `${fallback}%`;
        setSourceDot(els.parents.batt, 'simulated');
    }
}

function updateNetwork(els) {
    if (!els.link) return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
        // downlink: Mbps; cap at 100 for visual purposes
        const downlink = typeof conn.downlink === 'number' ? conn.downlink : 0;
        const pct = Math.max(0, Math.min(100, Math.round((downlink / 100) * 100)));
        const eff = (conn.effectiveType || '').toUpperCase();
        els.link.textContent = `${pct}%`;
        setSourceDot(els.parents.link, 'real');
        if (els.parents.link) {
            els.parents.link.title = `Conexión: ${eff || '?'} · ${downlink || '?'} Mbps`;
            els.parents.link.dataset.netType = eff;
        }
    } else {
        els.link.textContent = '—';
        setSourceDot(els.parents.link, 'simulated');
    }
}

/* ───────────────────────────────────────────────
 * GPS tracking — distance + last speed
 * ─────────────────────────────────────────────── */

function startGPSTracking() {
    import('../../../../js/engines/GPSEngine.js').then(module => {
        const GPSEngine = module.GPSEngine;
        const gps = new GPSEngine();

        let totalDistanceKm = 0;
        let lastPos = null;
        let lastTimestamp = null;

        gps.onPositionUpdate = (pos) => {
            // Speed for next BPM calc
            if (typeof pos.speed === 'number' && pos.speed >= 0) {
                lastSpeedMps = pos.speed;
            } else if (lastPos && lastTimestamp) {
                const dt = (Date.now() - lastTimestamp) / 1000;
                if (dt > 0) {
                    const distKm = haversineDistance(lastPos.lat, lastPos.lng, pos.lat, pos.lng);
                    lastSpeedMps = (distKm * 1000) / dt;
                }
            }
            // Distance accumulator
            if (lastPos && pos.source !== 'IP') {
                const dist = haversineDistance(lastPos.lat, lastPos.lng, pos.lat, pos.lng);
                if (dist > 0.001 && dist < 1.0) totalDistanceKm += dist;
            }
            lastPos = pos;
            lastTimestamp = Date.now();

            // Promote these coords for the remote loop
            if (typeof pos.lat === 'number' && typeof pos.lng === 'number') {
                writeCachedCoords(pos.lat, pos.lng);
                if (!resolvedCoords || resolvedCoords.source === 'ip') {
                    resolvedCoords = { lat: pos.lat, lng: pos.lng, source: pos.source || 'gps' };
                }
            }
        };

        gps.start();
    }).catch(e => console.warn('[Telemetry] GPS unavailable:', e));
}

/* ───────────────────────────────────────────────
 * Cache (sessionStorage)
 * ─────────────────────────────────────────────── */

function readCache() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !obj.ts || Date.now() - obj.ts > CACHE_TTL_MS) return null;
        return obj.data;
    } catch { return null; }
}

function writeCache(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch { /* quota — ignore */ }
}

/* ───────────────────────────────────────────────
 * UI helpers
 * ─────────────────────────────────────────────── */

function setText(el, value) {
    if (el) el.textContent = value;
}

function fmtTemp(v) {
    return (v == null || isNaN(v)) ? '--°C' : `${Number(v).toFixed(1)}°C`;
}

function fmtPct(v) {
    return (v == null || isNaN(v)) ? '--%' : `${Math.round(Number(v))}%`;
}

/**
 * Decorates the indicator with a colored data-source dot.
 *   green:   real         → real sensor or external API
 *   yellow:  simulated-coherent
 *   red:     simulated
 */
function setSourceDot(parent, source) {
    if (!parent) return;
    let cls = 'unknown';
    if (source === 'open-meteo' || source === 'open-meteo-aqi' || source === 'real') {
        cls = 'real';
    } else if (source === 'simulated-coherent') {
        cls = 'coherent';
    } else if (source === 'simulated') {
        cls = 'simulated';
    }
    parent.dataset.sourceState = cls;
}

/* Haversine — km between two GPS coordinates */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
