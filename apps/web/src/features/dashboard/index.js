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

/**
 * Main render function - initializes the dashboard
 * @param {HTMLElement} container - The container element to render into
 */
export async function render(container) {
    const user = await auth.getUser();

    // Inject HTML template
    container.innerHTML = template;

    // Show loading overlay on first visit
    if (!sessionStorage.getItem('kepler_preload_done')) {
        await showLoadingOverlay(user.id);
        sessionStorage.setItem('kepler_preload_done', 'true');
    }

    // 1. Initialize Header (shared component)
    await initHeader('global-header-container', { context: 'dashboard' });

    // 2. Initialize Map Controller (fullscreen toggle only)
    const mapController = new MapController('map-view-container');
    setupNavigation(mapController);

    // 3. Initialize all dashboard data modules in parallel
    await initDashboardModules();

    // 4. Setup user profile in header
    await setupUserProfile(user);

    // 5. Setup Notification Bell
    bindNotificationBell();

    // 6. Initialize modals + mobile menu
    const missionModal = initMission();
    initItemDetailModal();
    initMobileMenu(user, missionModal);

    // 7. Listen for data updates from Deep-Dive Modal to refresh UI
    window.addEventListener('kepler:data_updated', async (e) => {
        const table = e.detail?.table;
        console.log(`[Dashboard] Auto-refresh triggered for table: ${table}`);
        
        // Re-fetch and re-render the affected card
        if (!table || table === 'objetos_exploracion') initObjectsCard();
        if (!table || table === 'personas_encontradas') initPersonasCard();
        if (!table || table === 'rutas_exploracion') initRutasCard();
        if (!table || table === 'puntos_interes') initPOIsCard();
        if (!table || table === 'misiones') {
            import('./modules/missions-card.js').then(m => m.fetchMissions && m.fetchMissions());
        }
        
        // Always refresh alerts in case the update resolved an alert
        initAlerts();
    });

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

        if (allGood) window.kepler.notify.success(msg);
        else window.kepler.notify.warning(msg);

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

    const closeMap = () => {
        if (btnMap) btnMap.classList.remove('active');
        if (mapSection) mapSection.style.display = 'none';
        if (dashBody) dashBody.style.display = 'grid';
        if (btnCloseMap) btnCloseMap.style.display = 'none';
    };

    const openMap = async () => {
        if (btnMap) btnMap.classList.add('active');
        if (dashBody) dashBody.style.display = 'none';
        if (mapSection) mapSection.style.display = 'block';
        if (btnCloseMap) btnCloseMap.style.display = 'block';
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
}
