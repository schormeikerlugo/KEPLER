/**
 * Main Command Menu Module
 * Handles the logic for the centralized command dropdown in the header
 */

// ============================================================
// STYLES
// ============================================================

const MENU_STYLES = `
<style id="main-menu-styles">
.btn-main-menu {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.9);
    font-family: 'Jura', sans-serif;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.btn-main-menu:hover, .btn-main-menu.active {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(63, 168, 255, 0.5);
    color: #fff;
    box-shadow: 0 0 15px rgba(63, 168, 255, 0.1);
}

.menu-icon-grid {
    display: grid;
    grid-template-columns: repeat(2, 4px);
    gap: 3px;
}

.menu-icon-grid span {
    width: 4px;
    height: 4px;
    background: currentColor;
    border-radius: 1px;
}

.main-menu-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    width: 240px;
    background: rgba(10, 15, 25, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(63, 168, 255, 0.3);
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    transform-origin: top right;
    animation: menu-slide-in 0.2s ease-out;
}

.main-menu-dropdown.active {
    display: block;
}

@keyframes menu-slide-in {
    from { opacity: 0; transform: scale(0.95) translateY(-10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}

.menu-item-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    font-family: 'Jura', sans-serif;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s ease;
}

.menu-item-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
    transform: translateX(4px);
}

.menu-item-btn.primary {
    background: rgba(0, 212, 170, 0.1);
    color: #00d4aa;
    margin-bottom: 4px;
}

.menu-item-btn.primary:hover {
    background: rgba(0, 212, 170, 0.2);
    box-shadow: 0 0 15px rgba(0, 212, 170, 0.2);
}

.menu-item-icon {
    font-size: 1.1rem;
    width: 24px;
    text-align: center;
}

.menu-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 6px 0;
}

/* Mobile adjustments */
@media (max-width: 600px) {
    .menu-label {
        display: none;
    }
    .btn-main-menu {
        padding: 10px;
    }
}
</style>
`;

// ============================================================
// LOGIC
// ============================================================

export function initMainMenu() {
    // Inject styles
    if (!document.getElementById('main-menu-styles')) {
        document.head.insertAdjacentHTML('beforeend', MENU_STYLES);
    }

    const btn = document.getElementById('btn-main-menu');
    const menu = document.getElementById('main-menu-dropdown');

    if (!btn || !menu) return;

    // Toggle menu
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = menu.classList.contains('active');

        if (isActive) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!processClickInside(e)) {
            closeMenu();
        }
    });

    // Handle menu item clicks (close menu after selection)
    const menuItems = menu.querySelectorAll('.menu-item-btn');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            // Close with a small delay to allow visual feedback
            setTimeout(closeMenu, 150);
        });
    });

    function openMenu() {
        menu.classList.add('active');
        btn.classList.add('active');
    }

    function closeMenu() {
        menu.classList.remove('active');
        btn.classList.remove('active');
    }

    function processClickInside(e) {
        return menu.contains(e.target) || btn.contains(e.target);
    }
}
