/**
 * sidebar.js
 * Dashboard Right Sidebar
 * Handles: Tips, Profile Stats, Weekly Distance Chart, News
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';
import { profileService } from '../../../js/services/ProfileService.js';

/**
 * Initialize all sidebar modules
 */
export async function initSidebar() {
    const user = await auth.getUser();
    if (!user) return;

    // Run all sidebar initializations in parallel
    await Promise.allSettled([
        initTips(user.id),
        initProfileStats(user.id),
        initWeeklyChart(user.id),
        initNews(user.id),
        initSidebarAvatar()
    ]);

    console.log('[Sidebar] All modules initialized');
}

// ─────────────────────────────────────────────
// TIPS (Consejo del día)
// ─────────────────────────────────────────────

/**
 * Fetch and display a tip from the AI chat logs
 */
async function initTips(userId) {
    const tipEl = document.getElementById('sidebar-tip-text');
    if (!tipEl) return;

    const tip = await fetchLatestTip(userId);
    tipEl.textContent = tip || 'Cuando la IA no ayuda a tocar las estrellas. 🌟';
}

/**
 * Fetch the latest tip from the most recent chat log's messages (jsonb array)
 * chat_logs schema: { id, user_id, title, messages: [{role, content}], created_at }
 */
async function fetchLatestTip(userId) {
    const { data, error } = await supabase
        .from('chat_logs')
        .select('messages')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data || !data.messages) return null;

    // Find the last system or assistant message in the jsonb array
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    const tip = msgs.reverse().find(m => m.role === 'system' || m.role === 'assistant');
    return tip ? truncateText(tip.content, 120) : null;
}

/**
 * Truncate text to a max length with ellipsis
 */
function truncateText(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

// ─────────────────────────────────────────────
// PROFILE STATS (Resistencia + Desgaste)
// ─────────────────────────────────────────────

/**
 * Fetch explorer stats from backend and render 2 progress bars
 */
async function initProfileStats(userId) {
    const container = document.getElementById('sidebar-stats');
    if (!container) return;

    const stats = await fetchExplorerStats();
    renderExplorerBars(container, stats);
}

/**
 * Fetch explorer stats from the backend microservice
 * Optionally sends user lat/lng for real-time weather calculation
 */
async function fetchExplorerStats() {
    try {
        // ── Geolocation: GPS first, IP fallback ──
        let lat = null, lng = null;

        // Attempt 1: GPS (browser/device)
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            console.log(`[Sidebar] Location via GPS: ${lat}, ${lng}`);
        } catch (gpsErr) {
            console.log('[Sidebar] GPS not available, trying IP fallback...');

            // Attempt 2: IP-based geolocation (ipapi.co, free, HTTPS, no key)
            try {
                const ipRes = await fetch('https://ipapi.co/json/');
                if (ipRes.ok) {
                    const ipData = await ipRes.json();
                    lat = ipData.latitude ?? null;
                    lng = ipData.longitude ?? null;
                    console.log(`[Sidebar] Location via IP: ${lat}, ${lng}`);
                }
            } catch (ipErr) {
                console.log('[Sidebar] IP geolocation also failed, using defaults');
            }
        }

        // Build URL with optional coords
        let url = '/api/explorer/stats';
        const params = new URLSearchParams();
        if (lat != null && lng != null) {
            params.set('lat', lat);
            params.set('lng', lng);
        }
        if (params.toString()) url += '?' + params.toString();

        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error('[Sidebar] Explorer stats fetch error:', e);
        return { desgaste_calzado: 0, resistencia: 100, clima_actual: 'fresco' };
    }
}

/**
 * Get dynamic bar color based on value
 *  - Green (good): > 60%
 *  - Yellow (warning): 30–60%
 *  - Red (danger): < 30%
 */
function getBarColor(value, isInverted = false) {
    // For "desgaste" (wear), higher = worse → invert
    const effective = isInverted ? (100 - value) : value;
    if (effective > 60) return '#2ecc71';   // Green
    if (effective > 30) return '#f39c12';   // Yellow/Orange
    return '#e74c3c';                        // Red
}

/**
 * Render exactly 2 explorer stat bars: Desgaste + Resistencia
 */
function renderExplorerBars(container, stats) {
    const desgaste = stats.desgaste_calzado ?? 0;
    const resistencia = stats.resistencia ?? 100;
    const clima = stats.clima_actual || 'fresco';

    const climaEmojis = {
        'caluroso': '🌡️', 'fresco': '🌤️', 'frio': '❄️',
        'viento_fuerte': '💨', 'lluvia': '🌧️', 'tormenta': '⛈️'
    };
    const climaEmoji = climaEmojis[clima] || '🌤️';

    container.innerHTML = `
        <div class="stat-item">
            <div class="stat-header">
                <span class="stat-icon">👟</span>
                <span class="stat-name">Desgaste del Calzado</span>
                <span class="stat-value-label">${desgaste.toFixed(0)}%</span>
            </div>
            <div class="stat-bar-wrapper">
                <div class="stat-bar-fill" style="width: ${desgaste}%; background: ${getBarColor(desgaste, true)}"></div>
            </div>
        </div>
        <div class="stat-item">
            <div class="stat-header">
                <span class="stat-icon">⚡</span>
                <span class="stat-name">Resistencia Física</span>
                <span class="stat-value-label">${resistencia.toFixed(0)}%</span>
            </div>
            <div class="stat-bar-wrapper">
                <div class="stat-bar-fill" style="width: ${resistencia}%; background: ${getBarColor(resistencia)}"></div>
            </div>
        </div>
        <div class="stat-clima">
            <span>${climaEmoji}</span>
            <span class="stat-clima-text">Clima: ${clima.replace('_', ' ')}</span>
            <span class="stat-clima-separator">·</span>
            <span>${new Date().getHours() >= 6 && new Date().getHours() < 19 ? '☀️' : '🌙'}</span>
            <span class="stat-clima-text">${new Date().getHours() >= 6 && new Date().getHours() < 19 ? 'Día' : 'Noche'}</span>
        </div>
    `;
}

// ─────────────────────────────────────────────
// WEEKLY DISTANCE CHART (Canvas mini line chart)
// ─────────────────────────────────────────────

/**
 * Fetch weekly telemetry and draw a mini line chart
 */
async function initWeeklyChart(userId) {
    const canvas = document.getElementById('sidebar-weekly-chart');
    const valueEl = document.getElementById('sidebar-weekly-km');
    if (!canvas) return;

    const dailyData = await fetchWeeklyDistance(userId);
    const totalKm = dailyData.reduce((sum, d) => sum + d.km, 0);

    if (valueEl) valueEl.textContent = `${totalKm.toFixed(1)} KM`;

    drawLineChart(canvas, dailyData);
}

/**
 * Calculate daily distance from telemetry_samples over the last 7 days
 */
async function fetchWeeklyDistance(userId) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get active mission IDs for this user
    const { data: missions } = await supabase
        .from('misiones')
        .select('id')
        .eq('user_id', userId);

    if (!missions || missions.length === 0) return getEmptyWeek();

    const missionIds = missions.map(m => m.id);

    const { data: samples, error } = await supabase
        .from('telemetry_samples')
        .select('lat, lng, timestamp')
        .in('mission_id', missionIds)
        .gte('timestamp', sevenDaysAgo.toISOString())
        .order('timestamp', { ascending: true });

    if (error || !samples || samples.length === 0) return getEmptyWeek();

    return calculateDailyDistances(samples);
}

/**
 * Return an empty week dataset for the chart
 */
function getEmptyWeek() {
    const days = ['Día 1', 'Día 2', 'Día 3', 'Día 4', 'Día 5', 'Día 6', 'Día 7'];
    return days.map(d => ({ label: d, km: 0 }));
}

/**
 * Calculate distance per day from GPS coordinate samples
 */
function calculateDailyDistances(samples) {
    const dayMap = {};

    for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1];
        const curr = samples[i];
        const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        const dayKey = new Date(curr.timestamp).toLocaleDateString('es-VE', { weekday: 'short' });

        dayMap[dayKey] = (dayMap[dayKey] || 0) + dist;
    }

    const entries = Object.entries(dayMap).slice(-7);

    if (entries.length === 0) return getEmptyWeek();

    return entries.map(([label, km]) => ({ label, km: Math.round(km * 100) / 100 }));
}

/**
 * Haversine formula for distance between two lat/lng points (km)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = degToRad(lat2 - lat1);
    const dLon = degToRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degToRad(deg) { return deg * (Math.PI / 180); }

/**
 * Draw a mini line chart on canvas
 */
function drawLineChart(canvas, data) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const padding = { top: 10, right: 10, bottom: 25, left: 10 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    if (data.length === 0) return;

    const maxVal = Math.max(...data.map(d => d.km), 0.1);
    const stepX = chartW / (data.length - 1 || 1);

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#3FA8FF';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    data.forEach((point, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartH - (point.km / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw gradient fill below line
    const gradient = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
    gradient.addColorStop(0, 'rgba(63, 168, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(63, 168, 255, 0)');

    ctx.lineTo(padding.left + (data.length - 1) * stepX, H - padding.bottom);
    ctx.lineTo(padding.left, H - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw data points
    data.forEach((point, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartH - (point.km / maxVal) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#3FA8FF';
        ctx.fill();
    });

    // Draw X labels
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    data.forEach((point, i) => {
        const x = padding.left + i * stepX;
        ctx.fillText(point.label, x, H - 5);
    });
}

// ─────────────────────────────────────────────
// NEWS (Novedades de la IA)
// ─────────────────────────────────────────────

/**
 * Fetch and render the latest notifications as news items
 * Also bind the expand button to open the AI analysis modal
 */
async function initNews(userId) {
    const list = document.getElementById('sidebar-news-list');
    if (!list) return;

    const news = await fetchLatestNews(userId);
    renderNewsList(list, news);

    // Bind expand/close for AI analysis modal
    bindAnalysisModal(userId);
}

/**
 * Fetch top 3 info/suggestion notifications
 */
async function fetchLatestNews(userId) {
    const { data, error } = await supabase
        .from('user_notifications')
        .select('message')
        .eq('user_id', userId)
        .in('type', ['info', 'success'])
        .order('created_at', { ascending: false })
        .limit(3);

    if (error) { console.error('[Sidebar] News fetch error:', error); return []; }
    return data || [];
}

/**
 * Render news items as a list
 */
function renderNewsList(list, news) {
    if (news.length === 0) {
        list.innerHTML = '<li class="sidebar-news-item">No hay novedades recientes</li>';
        return;
    }

    list.innerHTML = news.map(item => `
        <li class="sidebar-news-item">${truncateText(item.message, 80)}</li>
    `).join('');
}

/**
 * Bind expand/close buttons for the AI analysis modal
 */
function bindAnalysisModal(userId) {
    const expandBtn = document.getElementById('sidebar-news-expand');
    const closeBtn = document.getElementById('ia-analysis-close');
    const modal = document.getElementById('ia-analysis-modal');

    if (expandBtn && modal) {
        expandBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            populateAnalysis(userId);
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
}

/**
 * Populate the AI analysis modal sections with real data insights
 */
async function populateAnalysis(userId) {
    await Promise.allSettled([
        populateRouteAnalysis(userId),
        populateDiscoveryAnalysis(userId),
        populateZoneAnalysis(userId)
    ]);
}

/**
 * Analyze rutas_planificadas and suggest optimizations
 */
async function populateRouteAnalysis(userId) {
    const el = document.getElementById('ia-route-analysis');
    if (!el) return;

    const { data } = await supabase
        .from('rutas_planificadas')
        .select('nombre, distancia_total, estado_seguridad')
        .eq('user_id', userId);

    if (!data || data.length === 0) {
        el.textContent = 'No hay rutas registradas para analizar.';
        return;
    }

    const safest = data.filter(r => r.estado_seguridad === 'Seguro');
    const risky = data.filter(r => r.estado_seguridad === 'Riesgo Alto');
    const totalKm = data.reduce((sum, r) => sum + Number(r.distancia_total || 0), 0);

    el.textContent = `Tienes ${data.length} rutas planificadas (${totalKm.toFixed(1)} km total). ` +
        `${safest.length} son seguras. ` +
        (risky.length > 0 ? `⚠️ ${risky.length} ruta(s) de riesgo alto detectadas — se recomienda explorar alternativas.` : '✅ No hay rutas de alto riesgo.');
}

/**
 * Summarize recent object discoveries
 */
async function populateDiscoveryAnalysis(userId) {
    const el = document.getElementById('ia-discovery-analysis');
    if (!el) return;

    const { count: totalObjects } = await supabase
        .from('objetos_exploracion')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    const { count: lowConf } = await supabase
        .from('objetos_exploracion')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('confianza', 0.5);

    el.textContent = `Has registrado ${totalObjects || 0} objetos en total. ` +
        (lowConf > 0 ? `🔍 ${lowConf} objeto(s) requieren re-escaneo (confianza < 50%).` : '✅ Todos los objetos tienen buena confianza de identificación.');
}

/**
 * Show current telemetry zone info
 */
async function populateZoneAnalysis(userId) {
    const el = document.getElementById('ia-zone-analysis');
    if (!el) return;

    const { data } = await supabase
        .from('mission_telemetry')
        .select('temperature, radiation_level, oxygen_level')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (!data) {
        el.textContent = 'Sin lecturas de telemetría activas. Inicia una misión para obtener datos en tiempo real.';
        return;
    }

    el.textContent = `Última lectura — Temp: ${data.temperature}°C | Radiación: ${data.radiation_level} mSv/h | O2: ${data.oxygen_level}%. ` +
        (data.radiation_level > 0.05 ? '⚠️ Niveles de radiación elevados en la zona.' : '✅ Zona dentro de parámetros seguros.');
}

// ─────────────────────────────────────────────
// SIDEBAR AVATAR (Profile Image)
// ─────────────────────────────────────────────

/**
 * Load the user's avatar into the sidebar profile section (oval style matching header)
 */
async function initSidebarAvatar() {
    const avatarEl = document.getElementById('sidebar-avatar');
    const nameEl = document.getElementById('sidebar-profile-name');
    if (!avatarEl) return;

    const profile = await profileService.getProfile();
    const avatarDisplay = await profileService.getAvatarDisplay();

    if (nameEl) nameEl.textContent = profile?.display_name || profile?.full_name || 'Explorer';

    if (avatarDisplay.type === 'image') {
        // Create an img tag inside the oval, just like the header does
        avatarEl.innerHTML = `<img src="${avatarDisplay.value}" alt="Avatar" />`;
        avatarEl.style.background = 'none';
    } else {
        avatarEl.textContent = avatarDisplay.value;
        avatarEl.innerHTML = avatarDisplay.value;
    }
}
