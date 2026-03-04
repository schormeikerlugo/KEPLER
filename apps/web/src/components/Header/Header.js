import template from './Header.html?raw';
import './Header.css';
import { auth } from '../../js/auth.js';
import { profileService } from '../../js/services/ProfileService.js';

export async function initHeader(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Inject HTML
    container.innerHTML = template;

    // Populate dynamic context (dashboard commands vs IA commands)
    const dropdown = document.getElementById('main-menu-dropdown');
    if (dropdown) {
        if (options.context === 'dashboard') {
            dropdown.innerHTML = `
                <button id="btn-start-mission" class="menu-item-btn primary">
                    <span class="menu-item-icon">🚀</span>
                    <span class="menu-item-text">Iniciar Misión</span>
                </button>
                <div class="menu-divider"></div>
                <button id="nav-btn-map" class="menu-item-btn" data-view="map">
                    <span class="menu-item-icon">🗺️</span>
                    <span class="menu-item-text">Mapa Táctico</span>
                </button>
                <a href="/ia" style="text-decoration:none;">
                    <button class="menu-item-btn">
                        <span class="menu-item-icon">🧠</span>
                        <span class="menu-item-text">Inteligencia IA</span>
                    </button>
                </a>
                <button id="btn-archives" class="menu-item-btn">
                    <span class="menu-item-icon">📦</span>
                    <span class="menu-item-text">Archivos</span>
                </button>
                <button id="btn-taxonomia" class="menu-item-btn">
                    <span class="menu-item-icon">🏷️</span>
                    <span class="menu-item-text">Taxonomía</span>
                </button>
            `;
        } else if (options.context === 'ia') {
            dropdown.innerHTML = `
                <a href="/" style="text-decoration:none;">
                    <button class="menu-item-btn primary">
                        <span class="menu-item-icon">📊</span>
                        <span class="menu-item-text">Ir al Dashboard</span>
                    </button>
                </a>
            `;
        }
    }

    // Initialize Menu Dropdown Interaction
    setupMainMenu();

    // Setup User Profile
    await setupProfile();

    console.log(`[Header] Initialized for context: ${options.context}`);
}

function setupMainMenu() {
    const btn = document.getElementById('btn-main-menu');
    const menu = document.getElementById('main-menu-dropdown');

    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = menu.classList.contains('active');
        if (isActive) {
            menu.classList.remove('active');
            btn.classList.remove('active');
        } else {
            menu.classList.add('active');
            btn.classList.add('active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.remove('active');
            btn.classList.remove('active');
        }
    });

    const menuItems = menu.querySelectorAll('.menu-item-btn');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            setTimeout(() => {
                menu.classList.remove('active');
                btn.classList.remove('active');
            }, 150);
        });
    });
}

async function setupProfile() {
    const user = await auth.getUser();
    if (!user) return;

    try {
        const profile = await profileService.getProfile();
        const avatarDisplay = await profileService.getAvatarDisplay();

        const nameEl = document.getElementById('user-name');
        const avatarEl = document.getElementById('user-avatar');
        const dropdownEmail = document.getElementById('dropdown-email');
        const profileBtn = document.getElementById('btn-user-profile');
        const profileDropdown = document.getElementById('profile-dropdown');

        const displayName = profile?.display_name || user.email.split('@')[0];

        if (nameEl) nameEl.textContent = displayName;
        if (dropdownEmail) dropdownEmail.textContent = user.email;

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

        // Dropdown toggle
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

            document.addEventListener('click', () => {
                profileDropdown.style.display = 'none';
                profileBtn.classList.remove('active');
            });

            profileDropdown.addEventListener('click', (e) => e.stopPropagation());
        }

        // Logout
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await auth.signOut();
                window.location.href = '/login';
            });
        }
    } catch (error) {
        console.error("Error setting up profile header", error);
    }
}
