import './css/tokens.css';
import './css/system/tokens.css';
import './css/system/base.css';
import './css/system/components.css';
import './css/system/utilities.css';
import './css/fonts.css';
import './css/style.css';
import './css/holo-logo.css';
import './css/notifications.css';

import { NotificationSystem } from './js/components/NotificationSystem.js';

// Initialize Global Notification System
window.kepler = window.kepler || {};
window.kepler.notify = new NotificationSystem();

console.log("KEPLER System: Initialized");

import { auth } from './js/auth.js';
import { RealtimeService } from './js/services/RealtimeService.js';
import { initSessionGuard } from './js/session-guard.js';

// ── SPA Router ──────────────────────────────────────────────

const TRANSITION_MS = 150;
let currentPath = null;

/**
 * SPA route definitions
 * Each route has a loader that dynamically imports and renders the feature module.
 * External routes (profile, archives) still use full navigation.
 */
const SPA_ROUTES = ['/', '/ar', '/login', '/taxonomia', '/ia', '/profile', '/archives'];

/**
 * Navigate to a path using SPA transitions (no full page reload).
 * Available globally as window.kepler.navigate(path)
 */
async function navigateTo(path) {
    // External pages that aren't part of the SPA router
    if (!SPA_ROUTES.includes(path)) {
        window.location.href = path;
        return;
    }

    // Don't re-render if already on the same path
    if (path === currentPath) return;

    const app = document.getElementById('app');

    // Fade out current view
    app.classList.add('view-exit');
    await new Promise(r => setTimeout(r, TRANSITION_MS));

    // Update URL without reload
    if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
    }

    // Render the new route
    await renderRoute(path);

    // Fade in new view
    app.classList.remove('view-exit');
    app.classList.add('view-enter');

    // Cleanup animation class
    setTimeout(() => app.classList.remove('view-enter'), TRANSITION_MS);
}

// Expose globally
window.kepler.navigate = navigateTo;

/**
 * Render a route into #app without transitions (used internally)
 */
async function renderRoute(path) {
    const app = document.getElementById('app');
    currentPath = path;

    if (path === '/') {
        const module = await import('./features/dashboard/index.js');
        await module.render(app);
    } else if (path === '/ar') {
        const module = await import('./features/ar/index.js');
        await module.render(app);
    } else if (path === '/login') {
        const module = await import('./features/login/index.js');
        await module.render(app);
    } else if (path === '/taxonomia') {
        const module = await import('./features/taxonomia/index.js');
        const controller = new module.default(app);
        controller.init();
    } else if (path === '/ia') {
        const module = await import('./features/ia/index.js');
        await module.render(app);
    } else if (path === '/archives') {
        const module = await import('./features/archives/index.js');
        await module.render(app);
    } else if (path === '/profile') {
        const [module, { default: template }, _css] = await Promise.all([
            import('./features/profile/index.js'),
            import('./features/profile/profile.html?raw'),
            import('./features/profile/profile.css')
        ]);
        app.innerHTML = template;
        await module.init();
    } else {
        // Unknown route → dashboard
        await navigateTo('/');
        return;
    }

    // Scroll to top after layout settles
    requestAnimationFrame(() => window.scrollTo(0, 0));
}

/**
 * Initial route + auth guards
 */
async function route() {
    const user = await auth.getUser();
    console.log("Auth Status:", user ? "Logged In" : "Guest");

    const path = window.location.pathname;

    // Route Guards (these need full redirects for auth state changes)
    if (!user && path !== '/login') {
        window.location.href = '/login';
        return;
    }

    if (user && path === '/login') {
        window.location.href = '/';
        return;
    }

    // Start Realtime Listener for authenticated users (persists across all pages)
    if (user && !window.kepler.realtime) {
        window.kepler.realtime = new RealtimeService();
        console.log("KEPLER: Realtime service started globally");

        // Activate session guard (auto-logout on close + inactivity)
        initSessionGuard();
    }

    // Render initial route (no transition on first load)
    await renderRoute(path);
}

// ── Handle browser back/forward buttons ──
window.addEventListener('popstate', () => {
    const path = window.location.pathname;
    if (SPA_ROUTES.includes(path)) {
        renderRoute(path);
    }
});

// ── Intercept <a> clicks for SPA navigation ──
document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href');

    // Only intercept internal SPA routes (not external links or anchors)
    if (href && SPA_ROUTES.includes(href) && !anchor.hasAttribute('data-external')) {
        e.preventDefault();
        navigateTo(href);
    }
});

// Boot
route();
