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
import { initPOIsCard } from './modules/pois-card.js';
import { initObjectsCard } from './modules/objects-card.js';
import { initPersonasCard } from './modules/personas-card.js';
import { initRutasCard } from './modules/rutas-card.js';
import { initSidebar } from './modules/sidebar.js';

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

    // 6. Initialize mission modal + mobile menu
    const missionModal = initMission();
    initMobileMenu(user, missionModal);

    // 7. Check system health on first session load
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
