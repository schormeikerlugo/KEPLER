import { auth } from '../../js/auth.js';
import './css/index.css';
import template from './dashboard.html?raw';

// Import modules
import { initMobileMenu } from './modules/layout/mobile-menu.js';
import { initMission } from './modules/mission/index.js';
import { initTelemetry } from './modules/telemetry/index.js';
import { loadDashboardData } from './modules/data/index.js';
import { MapController } from '../../features/map/MapController.js';
import { showLoadingOverlay } from './modules/loading-overlay.js';
import { initSystemStatus } from './modules/system-status.js';
import { initMainMenu } from './modules/main-menu.js';
import { profileService } from '../../js/services/ProfileService.js';

/**
 * Main render function - initializes the dashboard
 * @param {HTMLElement} container - The container element to render into
 */
export async function render(container) {
    // Get current user
    const user = await auth.getUser();

    // Inject template first (so overlay appears on top)
    container.innerHTML = template;

    // Show loading overlay and wait for user data 
    if (!sessionStorage.getItem('kepler_preload_done')) {
        await showLoadingOverlay(user.id);
        sessionStorage.setItem('kepler_preload_done', 'true');
    }

    // Initialize UI Components
    initMainMenu();     // Command Menu (Left)
    initSystemStatus(); // System Status (Right)

    // Initialize Map Controller (Singleton for this view)
    const mapController = new MapController('map-view-container');

    // Setup Navigation (Map Toggle)
    setupNavigation(mapController);

    // Bind Notification Bell
    const btnBell = document.getElementById('btn-notifications-header');
    if (btnBell) {
        btnBell.onclick = () => {
            if (window.kepler && window.kepler.notify) {
                window.kepler.notify.toggleLog();
            }
        };
    }

    // Service Status Check (Only on session start - first dashboard load)
    if (window.kepler && window.kepler.notify) {
        if (!sessionStorage.getItem('kepler_status_shown')) {
            setTimeout(async () => {
                // Import api dynamically to avoid circular deps
                const { api } = await import('../../js/services/api.js');
                const health = await api.getHealth();

                // Build status message
                const statuses = [
                    `Backend: ${health.backend ? '✅' : '❌'}`,
                    `Base de Datos: ${health.database ? '✅' : '❌'}`,
                    `IA (Llama): ${health.ai ? '✅' : '❌'}`
                ];

                const allGood = health.backend && health.database;

                if (allGood) {
                    window.kepler.notify.success(`Sistemas operativos\n${statuses.join(' | ')}`);
                } else {
                    window.kepler.notify.warning(`Algunos sistemas no responden\n${statuses.join(' | ')}`);
                }

                sessionStorage.setItem('kepler_status_shown', 'true');
            }, 1500);
        }
    }

    // Update user profile in header using ProfileService
    if (user) {

        const profile = await profileService.getProfile(true); // Force refresh on dashboard load
        const avatarDisplay = await profileService.getAvatarDisplay();

        const nameEl = document.getElementById('user-name');
        const avatarEl = document.getElementById('user-avatar');
        const dropdownEmail = document.getElementById('dropdown-email');
        const mobileNameEl = document.getElementById('mobile-user-name');
        const mobileEmailEl = document.getElementById('mobile-user-email');
        const mobileAvatarEl = document.getElementById('mobile-user-avatar');

        const displayName = profile?.display_name || user.email.split('@')[0];

        // Desktop header
        if (nameEl) nameEl.textContent = displayName;
        if (dropdownEmail) dropdownEmail.textContent = user.email;

        // Mobile menu
        if (mobileNameEl) mobileNameEl.textContent = displayName;
        if (mobileEmailEl) mobileEmailEl.textContent = user.email;

        // Avatar (supports image, emoji, or letter)
        if (avatarEl) {
            if (avatarDisplay.type === 'image') {
                avatarEl.textContent = '';
                avatarEl.style.backgroundImage = `url(${avatarDisplay.value})`;
                avatarEl.style.backgroundSize = 'cover';
                avatarEl.style.backgroundPosition = 'center';
            } else {
                avatarEl.textContent = avatarDisplay.value;
                avatarEl.style.backgroundImage = 'none';
            }
        }

        // Mobile avatar
        if (mobileAvatarEl) {
            if (avatarDisplay.type === 'image') {
                mobileAvatarEl.textContent = '';
                mobileAvatarEl.style.backgroundImage = `url(${avatarDisplay.value})`;
                mobileAvatarEl.style.backgroundSize = 'cover';
                mobileAvatarEl.style.backgroundPosition = 'center';
            } else {
                mobileAvatarEl.textContent = avatarDisplay.value;
                mobileAvatarEl.style.backgroundImage = 'none';
            }
        }
    }

    // Setup profile dropdown
    setupProfileDropdown();

    // Initialize all modules
    const missionModal = initMission();
    initMobileMenu(user, missionModal);
    initTelemetry();
    loadDashboardData();
}

/**
 * Sets up the profile dropdown toggle and logout functionality
 */
function setupProfileDropdown() {
    const profileBtn = document.getElementById('btn-user-profile');
    const profileDropdown = document.getElementById('profile-dropdown');
    const logoutBtn = document.getElementById('btn-logout');

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = profileDropdown.style.display === 'block';
            if (isVisible) {
                profileDropdown.style.display = 'none';
                profileBtn.classList.remove('active');
            } else {
                profileDropdown.style.display = 'block';
                profileBtn.classList.add('active');
            }
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            profileDropdown.style.display = 'none';
            profileBtn.classList.remove('active');
        });

        profileDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Logout handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await auth.logout();
            window.location.href = '/';
        });
    }

    // Profile button handler (navigate to profile page)
    const myProfileBtn = document.getElementById('btn-profile');
    if (myProfileBtn) {
        myProfileBtn.addEventListener('click', () => {
            window.location.href = '/profile';
        });
    }
}

/**
 * Sets up Dashboard Navigation (Main vs Map Section)
 * @param {MapController} mapController 
 */
function setupNavigation(mapController) {
    const btnMap = document.getElementById('nav-btn-map');
    const btnCloseMap = document.getElementById('btn-close-map');
    const dashMain = document.querySelector('.dash-main');
    const mapSection = document.getElementById('map-view-section');

    const closeMap = () => {
        if (btnMap) btnMap.classList.remove('active');
        if (mapSection) mapSection.style.display = 'none';
        if (dashMain) dashMain.style.display = 'grid';
        if (btnCloseMap) btnCloseMap.style.display = 'none';
    };

    const openMap = async () => {
        console.log('🗺️ openMap called');
        console.log('🗺️ dashMain:', !!dashMain, 'mapSection:', !!mapSection);

        if (btnMap) btnMap.classList.add('active');
        if (dashMain) dashMain.style.display = 'none';
        if (mapSection) mapSection.style.display = 'block';
        if (btnCloseMap) btnCloseMap.style.display = 'block';

        console.log('🗺️ Calling mapController.init()...');
        await mapController.init();
        console.log('🗺️ mapController.init() complete');

        mapController.invalidateSize();
        console.log('🗺️ openMap complete');
    };

    // Expose map functions globally for mobile menu - MUST be before any return!
    window.kepler = window.kepler || {};
    window.kepler.map = { openMap, closeMap };

    // If desktop nav button doesn't exist, just return (functions are still exposed)
    if (!btnMap || !dashMain || !mapSection) return;

    const toggleMap = async () => {
        const isMapActive = btnMap.classList.contains('active');
        if (isMapActive) {
            closeMap();
        } else {
            await openMap();
        }
    };

    btnMap.addEventListener('click', toggleMap);

    // Back button in map header
    if (btnCloseMap) {
        btnCloseMap.addEventListener('click', closeMap);
    }
}
