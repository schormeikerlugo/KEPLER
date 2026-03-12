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
// TIPS (Consejo del día — context-aware + standard pool)
// ─────────────────────────────────────────────

// Standard explorer tips pool
const STANDARD_TIPS = [
    '🧭 Siempre verifica tu brújula antes de adentrarte en zona desconocida.',
    '💧 Hidratación: lleva al menos 1L de agua por cada 5 km de exploración.',
    '📷 Documenta todo hallazgo con foto antes de manipularlo.',
    '🔋 Carga completa todos tus dispositivos antes de salir a campo.',
    '🗺️ Marca tu punto de partida como POI antes de explorar.',
    '🌡️ Monitorea la temperatura cada hora, los cambios bruscos indican tormentas.',
    '👥 Nunca explores zonas de riesgo alto sin un compañero de apoyo.',
    '🎒 Revisa tu equipo 24h antes de cada misión, no el mismo día.',
    '📡 Verifica la cobertura GPS de tu zona antes de iniciar una ruta.',
    '🔦 Lleva siempre una fuente de luz extra, incluso en misiones diurnas.',
    '🧤 Usa guantes al manipular muestras minerales o biológicas.',
    '⏰ Planifica tu regreso con margen: calcula 30% más de tiempo del estimado.',
    '📝 El mejor reporte de misión se escribe las primeras 2h después de finalizar.',
    '🌿 Aprende a identificar 5 plantas comunes de tu zona. Puede salvarte.',
    '🧊 En terreno rocoso, cada paso debe ser deliberado. La prisa causa lesiones.',
    '📻 Establece un horario de comunicación fijo con tu base de operaciones.',
    '🏕️ Un buen campamento tiene: agua cerca, terreno elevado y protección del viento.',
    '🔬 Las muestras se degradan: etiqueta con fecha, hora y coordenadas al recolectar.',
    '⚡ Si ves relámpagos, busca refugio bajo. Evita crestas y árboles aislados.',
    '🐍 En terreno desconocido, golpea el suelo con un bastón antes de pisar.'
];

/**
 * Generate and display a contextual or random tip
 */
async function initTips(userId) {
    const tipEl = document.getElementById('sidebar-tip-text');
    if (!tipEl) return;

    // Check sessionStorage cache (one tip per session)
    const cached = sessionStorage.getItem('kepler-tip');
    if (cached) {
        tipEl.textContent = cached;
        return;
    }

    // Try to generate a context-aware tip
    const contextTip = await generateContextTip(userId);
    const tip = contextTip || pickRandomTip();

    tipEl.textContent = tip;
    sessionStorage.setItem('kepler-tip', tip);
}

/**
 * Generate a tip based on the explorer's current data
 */
async function generateContextTip(userId) {
    const tips = [];

    try {
        // Fetch explorer stats (shoe condition, resistance)
        const token = await auth.getToken();
        const baseUrl = import.meta.env.VITE_SUPABASE_URL.startsWith('/')
            ? '' : import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, '').replace(':8443', ':8000');
        const apiBase = baseUrl || '/api';

        const statsRes = await fetch(`${apiBase}/api/explorer/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (statsRes.ok) {
            const stats = await statsRes.json();
            const condicion = Math.max(0, 100 - (stats.desgaste_calzado || 0));
            const resistencia = stats.resistencia || 100;
            const clima = stats.clima_actual || 'fresco';

            // Shoe condition warnings
            if (condicion < 20) {
                tips.push('⚠️ Tu calzado está al límite. Reemplázalo antes de la próxima misión o arriesgas una lesión en campo.');
            } else if (condicion < 40) {
                tips.push('👟 Tu calzado muestra desgaste considerable. Planifica un cambio pronto, especialmente para terreno rocoso.');
            }

            // Resistance warnings
            if (resistencia < 30) {
                tips.push('🛌 Tu resistencia está baja. Descansa al menos 8h antes de iniciar una nueva misión.');
            } else if (resistencia < 50) {
                tips.push('⚡ Resistencia moderada. Evita misiones de larga distancia hoy, prioriza recorridos cortos.');
            }

            // Weather-based tips
            if (clima === 'tormenta') {
                tips.push('⛈️ Tormenta detectada. No inicies misiones de campo. Usa este tiempo para documentar hallazgos.');
            } else if (clima === 'lluvia') {
                tips.push('🌧️ Lluvia en tu zona. Protege el equipo electrónico y evita rutas con pendiente.');
            } else if (clima === 'caluroso') {
                tips.push('🌡️ Clima caluroso. Duplica tu hidratación y evita explorar entre 12:00 y 15:00.');
            } else if (clima === 'viento_fuerte') {
                tips.push('💨 Viento fuerte detectado. Asegura todo equipo suelto y evita crestas expuestas.');
            }

            // Mission count tips
            if (stats.misiones_completadas === 0) {
                tips.push('🚀 ¡Tu primera misión te espera! Empieza con una ruta corta en terreno conocido.');
            } else if (stats.misiones_completadas >= 10) {
                tips.push(`🏆 ${stats.misiones_completadas} misiones completadas. ¡Explorador veterano! Considera documentar tus mejores hallazgos.`);
            }
        }
    } catch (e) {
        // Silent fail — will use standard tips
    }

    try {
        // Check for dangerous POIs
        const { data: dangerPois } = await supabase
            .from('puntos_interes')
            .select('nombre, nivel_riesgo')
            .eq('user_id', userId)
            .in('nivel_riesgo', ['alto', 'critico'])
            .limit(3);

        if (dangerPois && dangerPois.length > 0) {
            tips.push(`🚨 Tienes ${dangerPois.length} zona(s) de riesgo alto registrada(s). Revisa las alertas de "${dangerPois[0].nombre}" antes de salir.`);
        }
    } catch (e) { /* silent */ }

    // Return a random context tip or null
    return tips.length > 0 ? tips[Math.floor(Math.random() * tips.length)] : null;
}

/**
 * Pick a random tip from the standard pool
 */
function pickRandomTip() {
    return STANDARD_TIPS[Math.floor(Math.random() * STANDARD_TIPS.length)];
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
    const desgasteRaw = stats.desgaste_calzado ?? 0;
    const condicionCalzado = Math.max(0, 100 - desgasteRaw); // 100% = nuevo, 0% = destruido
    const resistencia = stats.resistencia ?? 100;
    const clima = stats.clima_actual || 'fresco';

    const climaEmojis = {
        'caluroso': '🌡️', 'fresco': '🌤️', 'frio': '❄️',
        'viento_fuerte': '💨', 'lluvia': '🌧️', 'tormenta': '⛈️'
    };
    const climaEmoji = climaEmojis[clima] || '🌤️';

    container.innerHTML = `
        <div class="stat-item stat-item-clickable" id="stat-desgaste-calzado" title="Click para cambiar calzado">
            <div class="stat-header">
                <span class="stat-icon">👟</span>
                <span class="stat-name">Estado del Calzado</span>
                <span class="stat-value-label">${condicionCalzado.toFixed(0)}%</span>
            </div>
            <div class="stat-bar-wrapper">
                <div class="stat-bar-fill" style="width: ${condicionCalzado}%; background: ${getBarColor(condicionCalzado)}"></div>
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

    // Attach shoe reset click handler
    const shoeEl = document.getElementById('stat-desgaste-calzado');
    if (shoeEl) {
        shoeEl.addEventListener('click', () => showShoeResetModal());
    }
}

// ─────────────────────────────────────────────
// SHOE RESET MODAL
// ─────────────────────────────────────────────
function showShoeResetModal() {
    // Remove existing modal if any
    const existing = document.getElementById('shoe-reset-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'shoe-reset-modal';
    modal.className = 'kepler-modal-overlay';
    modal.innerHTML = `
        <div class="kepler-modal">
            <div class="kepler-modal-header">
                <span class="kepler-modal-icon">👟</span>
                <h3 class="kepler-modal-title">Cambio de Calzado</h3>
            </div>
            <p class="kepler-modal-text">¿Has cambiado tu calzado? Esto reseteará el estado a <strong>100%</strong> y el sistema comenzará a calcular desde cero.</p>
            <div class="kepler-modal-actions">
                <button class="kepler-modal-btn kepler-modal-btn-cancel" id="shoe-reset-cancel">Cancelar</button>
                <button class="kepler-modal-btn kepler-modal-btn-confirm" id="shoe-reset-confirm">Sí, cambié el calzado</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => modal.classList.add('active'));

    // Cancel
    document.getElementById('shoe-reset-cancel').addEventListener('click', () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 200);
    });

    // Confirm
    document.getElementById('shoe-reset-confirm').addEventListener('click', async () => {
        const btn = document.getElementById('shoe-reset-confirm');
        btn.textContent = 'Reseteando...';
        btn.disabled = true;

        try {
            const token = await auth.getToken();
            const baseUrl = import.meta.env.VITE_SUPABASE_URL.startsWith('/')
                ? '' : import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, '').replace(':8443', ':8000');

            const apiBase = baseUrl || '/api';
            const res = await fetch(`${apiBase}/api/explorer/reset-calzado`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (res.ok) {
                // Close modal
                modal.classList.remove('active');
                setTimeout(() => modal.remove(), 200);

                // Refresh stats to show 0%
                const user = await auth.getUser();
                if (user) {
                    const statsContainer = document.getElementById('explorer-stats');
                    if (statsContainer) {
                        await fetchExplorerStats(user.id, statsContainer);
                    }
                }
            } else {
                btn.textContent = 'Error — Reintentar';
                btn.disabled = false;
            }
        } catch (err) {
            console.error('[ShoeReset] Error:', err);
            btn.textContent = 'Error — Reintentar';
            btn.disabled = false;
        }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 200);
        }
    });
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
// ─────────────────────────────────────────────
// NEWS (Novedades de la IA & Reporte Cortex)
// ─────────────────────────────────────────────

/**
 * Render the static AI News items and bind modal clicks
 */
async function initNews(userId) {
    const list = document.getElementById('sidebar-news-list');
    if (!list) return;

    // Render the 3 requested items
    list.innerHTML = `
        <li class="sidebar-news-item sidebar-news-clickable" style="cursor:pointer; transition:color 0.2s;"><span class="news-dot" style="color:#3FA8FF; margin-right:5px;">•</span> Lecturas del tiempo en tu zona</li>
        <li class="sidebar-news-item sidebar-news-clickable" style="cursor:pointer; transition:color 0.2s;"><span class="news-dot" style="color:#3FA8FF; margin-right:5px;">•</span> Noticias sobre nuevos hallazgos</li>
        <li class="sidebar-news-item sidebar-news-clickable" style="cursor:pointer; transition:color 0.2s;"><span class="news-dot" style="color:#3FA8FF; margin-right:5px;">•</span> Sugerencia de exploración</li>
    `;

    // Bind click events to open the AI Report modal
    const items = list.querySelectorAll('.sidebar-news-clickable');
    items.forEach(item => {
        item.addEventListener('mouseenter', () => item.style.color = '#3FA8FF');
        item.addEventListener('mouseleave', () => item.style.color = '');
        item.addEventListener('click', () => openAiReportModal());
    });

    const expandBtn = document.getElementById('sidebar-news-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', () => openAiReportModal());
    }

    // Bind modal close buttons
    const modal = document.getElementById('ia-analysis-modal');
    const closeBtn = document.getElementById('ia-analysis-close');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.style.display = 'none');
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
}

/**
 * Open the AI Analysis Modal and fetch the Mistral report
 */
async function openAiReportModal() {
    const modal = document.getElementById('ia-analysis-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // We replace the entire modal body with the report content
    const body = document.querySelector('.ia-analysis-body');
    if (!body) return;

    // Check if we already have it in cache
    const cachedReport = sessionStorage.getItem('kepler_ai_report_cache');
    if (cachedReport) {
        if (window.marked) {
            body.innerHTML = `<div class="ai-report-markdown">${window.marked.parse(cachedReport)}</div>`;
        } else {
            body.innerHTML = `<div class="ai-report-markdown" style="white-space:pre-wrap; font-family:var(--font-mono); color:#ddd; font-size:0.9rem;">${cachedReport}</div>`;
        }
        return;
    }

    // Loading state
    body.innerHTML = `
        <div style="text-align:center; padding: 40px 20px;">
            <div style="margin:0 auto 15px auto; width:30px; height:30px; border:3px solid rgba(63,168,255,0.2); border-top-color:#3FA8FF; border-radius:50%; animation:spin 1s linear infinite;"></div>
            <p style="color:#3FA8FF; font-weight:600; font-size:1.1rem; margin-bottom:5px;">Cortex procesando datos...</p>
            <p style="color:#999; font-size:0.9rem;">Analizando clima, equipo, hallazgos y zonas de exploración...</p>
        </div>
        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
    `;

    try {
        const token = await auth.getToken();
        const baseUrl = import.meta.env.VITE_SUPABASE_URL.startsWith('/')
            ? '' : import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, '').replace(':8443', ':8000');

        const apiBase = baseUrl || '';
        const res = await fetch(`${apiBase}/api/ai/report`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            const markdownStr = data.report || "No se pudo generar el reporte.";

            // Save to cache
            sessionStorage.setItem('kepler_ai_report_cache', markdownStr);

            // Format via marked.js (if available in window)
            if (window.marked) {
                body.innerHTML = `<div class="ai-report-markdown">${window.marked.parse(markdownStr)}</div>`;
            } else {
                body.innerHTML = `<div class="ai-report-markdown" style="white-space:pre-wrap; font-family:var(--font-mono); color:#ddd; font-size:0.9rem;">${markdownStr}</div>`;
            }

        } else {
            throw new Error(`HTTP ${res.status}`);
        }
    } catch (err) {
        console.error('[AI Report] Error:', err);
        body.innerHTML = `
            <div style="text-align:center; padding: 30px;">
                <p style="color:#FF4A4A; margin-bottom:15px;">Error de conexión con Cortex (Mistral AI).</p>
                <button class="kepler-modal-btn kepler-modal-btn-confirm" onclick="document.getElementById('ia-analysis-modal').style.display='none'">Cerrar</button>
            </div>
        `;
    }
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
