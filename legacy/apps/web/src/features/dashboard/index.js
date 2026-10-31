/**
 * Dashboard Entry Point (index.js)
 * Orchestrates initialization of all dashboard modules
 * 
 * Architecture: Monolithic module pattern
 * Each card/section has its own JS file with focused fetch+render functions.
 * This file only imports and calls the init functions in the correct order.
 */
import { auth } from '../../js/auth.js';
import './css/index.css';
import './css/full-view-modal.css';
import template from './dashboard.html?raw';

// ── Layout Modules ──
import { initMobileMenu } from './modules/layout/mobile-menu.js';
import { initHeader } from '../../components/Header/Header.js';
import { showLoadingOverlay } from './modules/loading-overlay.js';
import { initTelemetry } from './modules/telemetry/index.js';

// ── Feature Modules ──
import { initMission } from './modules/mission/index.js';
import { MapController } from '../../features/map/MapController.js';
import { profileService } from '../../js/services/ProfileService.js';

// ── Dashboard Card Modules ──
import { initAlerts } from './modules/alerts.js';
import { initMissionsCard } from './modules/missions-card.js';
import { initPOIsCard, fetchPOIs } from './modules/pois-card.js';
import { initObjectsCard, fetchObjects } from './modules/objects-card.js';
import { initPersonasCard, fetchPersonas } from './modules/personas-card.js';
import { initRutasCard, fetchRutas } from './modules/rutas-card.js';
import { initSidebar } from './modules/sidebar.js';
import { initItemDetailModal } from './modules/modal/ItemDetailModal.js';
import { initModuleFullViewModal } from './modules/modal/ModuleFullViewModal.js';

/**
 * Main render function - initializes the dashboard
 * @param {HTMLElement} container - The container element to render into
 */
// Track listener to avoid duplicates on re-navigation
let _dataUpdateHandler = null;

export async function render(container) {
    const user = await auth.getUser();

    // Inject HTML template immediately (instant visual feedback)
    container.innerHTML = template;

    // Show loading overlay only on first visit ever
    if (!sessionStorage.getItem('kepler_preload_done')) {
        await showLoadingOverlay(user.id);
        sessionStorage.setItem('kepler_preload_done', 'true');
    }

    // 1. Initialize Header (await to ensure layout is stable before showing)
    await initHeader('global-header-container', { context: 'dashboard' });

    // 2. Initialize Map Controller + navigation
    const mapController = new MapController('map-view-container');
    setupNavigation(mapController);

    // 3. Setup interactive elements immediately
    bindNotificationBell();
    const missionModal = initMission();
    initItemDetailModal();
    initModuleFullViewModal();
    initMobileMenu(user, missionModal);

    // 4. Load data modules + profile in parallel (non-blocking)
    initDashboardModules();
    setupUserProfile(user);

    // Listen for data updates (remove previous listener to avoid duplicates on re-nav)
    if (_dataUpdateHandler) {
        window.removeEventListener('kepler:data_updated', _dataUpdateHandler);
    }
    _dataUpdateHandler = async (e) => {
        const table = e.detail?.table;
        console.log(`[Dashboard] Auto-refresh triggered for table: ${table}`);

        if (!table || table === 'objetos_exploracion') initObjectsCard();
        if (!table || table === 'personas_encontradas') initPersonasCard();
        if (!table || table === 'rutas_exploracion') initRutasCard();
        if (!table || table === 'puntos_interes') initPOIsCard();
        if (!table || table === 'misiones') {
            import('./modules/missions-card.js').then(m => m.fetchMissions && m.fetchMissions());
        }
        initAlerts();
    };
    window.addEventListener('kepler:data_updated', _dataUpdateHandler);

    /**
     * Helper to inject Dummy Routes for the authenticated user.
     * Can be called from the DevTools console: window.kepler.seedDummyRoutes()
     */
    window.kepler = window.kepler || {};
    window.kepler.seedDummyRoutes = async () => {
        if (!window.kepler.notify) return console.warn("Notificaciones no inicializadas");
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return window.kepler.notify.error("No hay usuario autenticado.");

        const dummyRoutes = [
            { user_id: user.id, nombre: 'Ruta Delta-4 (Borde Norte)', dificultad: 'alta', seguridad: 'peligro', notas: 'Presencia anómala detectada.', lat_inicio: 40.7128, lng_inicio: -74.0060, lat_fin: 40.7580, lng_fin: -73.9855, distancia_km: 12.4 },
            { user_id: user.id, nombre: 'Suministros Perímetro Sur', dificultad: 'baja', seguridad: 'seguro', notas: 'Ruta despejada. Puestos de control activos.', lat_inicio: 34.0522, lng_inicio: -118.2437, lat_fin: 34.0736, lng_fin: -118.4004, distancia_km: 25.1 },
            { user_id: user.id, nombre: 'Sector Echo (Ruinas)', dificultad: 'moderada', seguridad: 'precaucion', notas: 'Radiación basal alta.', lat_inicio: 51.5074, lng_inicio: -0.1278, lat_fin: 51.5200, lng_fin: -0.1500, distancia_km: 4.8 },
            { user_id: user.id, nombre: 'Patrulla Alpha', dificultad: 'baja', seguridad: 'seguro', notas: 'Guardia de rutina sin eventos.', lat_inicio: 48.8566, lng_inicio: 2.3522, lat_fin: 48.8600, lng_fin: 2.3600, distancia_km: 2.1 }
        ];

        try {
            const { error } = await supabase.from('rutas_exploracion').insert(dummyRoutes);
            if (error) throw error;
            window.kepler.notify.success("4 Rutas Ficticias Inyectadas con Éxito");
            initRutasCard(); // Auto-refresh the card natively and properly bind it to the DOM
        } catch (err) {
            console.error(err);
            window.kepler.notify.error("Error al inyectar rutas: " + err.message);
        }
    };

    // 8. Check system health on first session load
    checkSystemHealth();
}

/**
 * Initialize all dashboard card/section modules in parallel
 * Each module fetches its own data from Supabase and renders independently
 */
async function initDashboardModules() {
    await Promise.allSettled([
        initAlerts(),
        initMissionsCard(),
        initPOIsCard(),
        initObjectsCard(),
        initPersonasCard(),
        initRutasCard(),
        initSidebar()
    ]);

    // Start telemetry AFTER DOM is ready (polls every 2s)
    initTelemetry();

    console.log('[Dashboard] All modules initialized');
}

/**
 * Update header with user profile data
 */
async function setupUserProfile(user) {
    if (!user) return;

    const profile = await profileService.getProfile(true);
    const avatarDisplay = await profileService.getAvatarDisplay();
    const displayName = profile?.display_name || user.email.split('@')[0];

    updateHeaderProfile(displayName, avatarDisplay, user.email);
    updateMobileProfile(displayName, avatarDisplay, user.email);
}

/**
 * Update desktop header elements with profile data
 */
function updateHeaderProfile(name, avatar, email) {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const dropdownEmail = document.getElementById('dropdown-email');

    if (nameEl) nameEl.textContent = name;
    if (dropdownEmail) dropdownEmail.textContent = email;

    if (avatarEl) {
        if (avatar.type === 'image') {
            avatarEl.textContent = '';
            avatarEl.style.backgroundImage = `url(${avatar.value})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
        } else {
            avatarEl.textContent = avatar.value;
            avatarEl.style.backgroundImage = 'none';
        }
    }
}

/**
 * Update mobile menu elements with profile data
 */
function updateMobileProfile(name, avatar, email) {
    const nameEl = document.getElementById('mobile-user-name');
    const emailEl = document.getElementById('mobile-user-email');
    const avatarEl = document.getElementById('mobile-user-avatar');

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;

    if (avatarEl) {
        if (avatar.type === 'image') {
            avatarEl.textContent = '';
            avatarEl.style.backgroundImage = `url(${avatar.value})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
        } else {
            avatarEl.textContent = avatar.value;
            avatarEl.style.backgroundImage = 'none';
        }
    }
}

/**
 * Bind the notification bell to toggle the notification log
 */
function bindNotificationBell() {
    const btnBell = document.getElementById('btn-notifications-header');
    if (btnBell) {
        btnBell.onclick = () => {
            if (window.kepler?.notify) window.kepler.notify.toggleLog();
        };
    }
}

/**
 * Check backend/DB/AI health on first session load
 */
function checkSystemHealth() {
    if (!window.kepler?.notify) return;
    if (sessionStorage.getItem('kepler_status_shown')) return;

    setTimeout(async () => {
        const { api } = await import('../../js/services/api.js');
        const health = await api.getHealth();

        const statuses = [
            `Backend: ${health.backend ? '✅' : '❌'}`,
            `Base de Datos: ${health.database ? '✅' : '❌'}`,
            `IA (Llama): ${health.ai ? '✅' : '❌'}`
        ];

        const allGood = health.backend && health.database;
        const msg = allGood
            ? `Sistemas operativos\n${statuses.join(' | ')}`
            : `Algunos sistemas no responden\n${statuses.join(' | ')}`;

        const healthCtx = { source: 'system_health', services: health };
        if (allGood) window.kepler.notify.success(msg, healthCtx);
        else window.kepler.notify.warning(msg, healthCtx);

        sessionStorage.setItem('kepler_status_shown', 'true');
    }, 1500);
}


/**
 * Sets up Dashboard Navigation (Main vs Map Section)
 */
function setupNavigation(mapController) {
    const btnMap = document.getElementById('nav-btn-map');
    const btnCloseMap = document.getElementById('btn-close-map');
    const dashBody = document.querySelector('.dash-body');
    const mapSection = document.getElementById('map-view-section');
    const routePanel = document.getElementById('map-route-panel');

    const closeMap = () => {
        if (btnMap) btnMap.classList.remove('active');
        // Fade out map, fade in dashboard
        if (mapSection) {
            mapSection.classList.add('section-exit');
            setTimeout(() => {
                mapSection.style.display = 'none';
                mapSection.classList.remove('section-exit');
                if (dashBody) {
                    dashBody.style.display = 'grid';
                    dashBody.classList.add('section-enter');
                    setTimeout(() => dashBody.classList.remove('section-enter'), 250);
                }
            }, 200);
        }
        if (btnCloseMap) btnCloseMap.style.display = 'none';
        mapController.setMode('explore');
    };

    const openMap = async () => {
        if (btnMap) btnMap.classList.add('active');
        // Fade out dashboard, fade in map
        if (dashBody) {
            dashBody.classList.add('section-exit');
            await new Promise(r => setTimeout(r, 200));
            dashBody.style.display = 'none';
            dashBody.classList.remove('section-exit');
        }
        if (mapSection) {
            mapSection.style.display = 'block';
            mapSection.classList.add('section-enter');
            setTimeout(() => mapSection.classList.remove('section-enter'), 250);
        }
        if (btnCloseMap) {
            btnCloseMap.style.display = 'flex';
            btnCloseMap.style.visibility = 'visible';
        }
        await mapController.init();
        mapController.invalidateSize();
    };

    window.kepler = window.kepler || {};
    window.kepler.map = { openMap, closeMap };

    if (!btnMap || !dashBody || !mapSection) return;

    btnMap.addEventListener('click', async () => {
        const isActive = btnMap.classList.contains('active');
        if (isActive) closeMap();
        else await openMap();
    });

    if (btnCloseMap) btnCloseMap.addEventListener('click', closeMap);

    // Listen for mode changes
    window.addEventListener('kepler:map-mode-changed', (e) => {
        const mode = e.detail?.mode;
        if (routePanel) {
            routePanel.classList.toggle('active', mode === 'routes');
        }
        // Toggle object panel visibility
        const objPanel = document.querySelector('.map-object-panel');
        if (objPanel) {
            objPanel.style.display = mode === 'routes' ? 'none' : '';
        }
    });

    // Route panel event handlers
    setupRoutePanel(mapController);
}

/**
 * Setup route panel UI events
 */
function setupRoutePanel(mapController) {
    const wpCount = document.getElementById('route-wp-count');
    const wpList = document.getElementById('route-wp-list');
    const wpHint = document.getElementById('route-wp-hint');
    const btnUndo = document.getElementById('route-btn-undo');
    const btnClear = document.getElementById('route-btn-clear');
    const btnSave = document.getElementById('route-btn-save');
    const inputName = document.getElementById('route-input-name');

    if (!wpCount) return;

    // Update waypoints UI
    function updateWaypointUI() {
        const wp = mapController.waypointsMod;
        if (!wp) return;

        const waypoints = wp.getWaypoints();
        wpCount.textContent = waypoints.length;

        const canSave = waypoints.length >= 2 && inputName?.value?.trim()?.length > 0;
        if (btnSave) btnSave.disabled = !canSave;
        if (btnUndo) btnUndo.disabled = waypoints.length === 0;
        if (btnClear) btnClear.disabled = waypoints.length === 0;

        if (waypoints.length === 0) {
            if (wpHint) wpHint.style.display = 'block';
            if (wpList) wpList.innerHTML = '';
            return;
        }

        if (wpHint) wpHint.style.display = 'none';
        if (wpList) {
            wpList.innerHTML = waypoints.map((w, i) => `
                <div class="route-waypoint-item">
                    <span class="route-wp-num">${i + 1}</span>
                    <span class="route-wp-coords">${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}</span>
                    <button class="route-wp-remove" data-index="${i}">×</button>
                </div>
            `).join('');

            wpList.querySelectorAll('.route-wp-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    wp.removeWaypointAt(idx);
                    updateWaypointUI();
                });
            });
        }
    }

    // Waypoint events
    window.addEventListener('kepler:waypoint-added', updateWaypointUI);
    window.addEventListener('kepler:waypoint-removed', updateWaypointUI);
    window.addEventListener('kepler:waypoints-cleared', updateWaypointUI);

    inputName?.addEventListener('input', updateWaypointUI);

    // Undo
    btnUndo?.addEventListener('click', () => {
        mapController.waypointsMod?.removeLastWaypoint();
        updateWaypointUI();
    });

    // Clear
    btnClear?.addEventListener('click', () => {
        mapController.waypointsMod?.clearWaypoints();
        updateWaypointUI();
    });

    // Save route
    btnSave?.addEventListener('click', async () => {
        const wp = mapController.waypointsMod;
        if (!wp || wp.getWaypoints().length < 2) return;

        const name = inputName?.value?.trim();
        if (!name) return;

        const terrain = document.getElementById('route-select-terrain')?.value || 'llano';
        const safety = document.getElementById('route-select-safety')?.value || 'seguro';
        const distKm = (wp.getTotalDistance() / 1000).toFixed(2);

        try {
            const { api } = await import('../../js/services/api.js');
            const result = await api.createPlannedRoute({
                nombre: name,
                tipo_terreno: terrain,
                estado_seguridad: safety,
                distancia_total: parseFloat(distKm),
                waypoints: wp.getWaypoints()
            });

            if (result.route) {
                window.kepler?.notify?.success('Ruta guardada');
                if (inputName) inputName.value = '';
                wp.clearWaypoints();
                updateWaypointUI();
            }
        } catch (e) {
            console.error('Save route failed:', e);
            window.kepler?.notify?.error('Error al guardar');
        }
    });

    // Corridor analysis
    window.addEventListener('kepler:corridor-analyzed', (e) => {
        const risk = e.detail;
        const corridor = document.getElementById('route-corridor');
        if (!corridor || !risk) return;

        corridor.classList.add('active');

        const nivelColor = {
            'bajo': '#4ADE80', 'medio': '#FBBF24',
            'alto': '#F97316', 'critico': '#EF4444'
        };
        const color = nivelColor[risk.nivel_riesgo] || '#6B7280';

        const icons = { 'bajo': '✓', 'medio': '⚠', 'alto': '⚠', 'critico': '✕' };
        const labels = { 'bajo': 'Bajo', 'medio': 'Medio', 'alto': 'Alto', 'critico': 'Crítico' };

        document.getElementById('route-risk-badge').innerHTML = `
            <div class="route-risk-badge" style="background:${color}15; color:${color}; border-color:${color}">
                <span>${icons[risk.nivel_riesgo] || '?'}</span>
                <span>Riesgo: ${labels[risk.nivel_riesgo] || 'N/A'}</span>
                <span style="margin-left:auto; opacity:0.8">${risk.score || 0} pts</span>
            </div>
        `;

        const stats = risk.stats || {};
        document.getElementById('route-stats-grid').innerHTML = `
            <div class="route-stat-cell"><span class="route-stat-num">${stats.peligros_criticos || 0}</span><span class="route-stat-label">Críticos</span></div>
            <div class="route-stat-cell"><span class="route-stat-num">${stats.hostiles || 0}</span><span class="route-stat-label">Hostiles</span></div>
            <div class="route-stat-cell"><span class="route-stat-num">${stats.rutas_peligrosas || 0}</span><span class="route-stat-label">Rutas</span></div>
            <div class="route-stat-cell"><span class="route-stat-num">${stats.objetos_cerca || 0}</span><span class="route-stat-label">Objetos</span></div>
        `;

        const alertIcons = { 'critical': '🚨', 'danger': '⚠️', 'warning': '⚡', 'info': 'ℹ️' };
        const alertsHtml = (risk.alertas || []).map(a => `
            <div class="route-alert-item alert-${a.tipo}">
                <span>${alertIcons[a.tipo] || '•'}</span>
                <span>${a.mensaje}</span>
            </div>
        `).join('');

        document.getElementById('route-alerts-list').innerHTML = alertsHtml || '<div style="text-align:center; color:#4ADE80; font-size:12px; padding:8px;">Sin alertas ✓</div>';
    });
}
