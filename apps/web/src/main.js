import './css/tokens.css';
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

async function route() {
    const user = await auth.getUser();
    console.log("Auth Status:", user ? "Logged In" : "Guest");

    const path = window.location.pathname;

    // Route Guards
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

    // Routing
    if (path === '/') {
        import('./features/dashboard/index.js').then(module => {
            module.render(document.getElementById('app'));
        });
    } else if (path === '/ar') {
        import('./features/ar/index.js').then(module => {
            module.render(document.getElementById('app'));
        });
    } else if (path === '/login') {
        import('./features/login/index.js').then(module => {
            module.render(document.getElementById('app'));
        });
    } else if (path === '/taxonomia') {
        import('./features/taxonomia/index.js').then(module => {
            const controller = new module.default(document.getElementById('app'));
            controller.init();
        });
    } else if (path === '/ia') {
        import('./features/ia/index.js').then(module => {
            module.render(document.getElementById('app'));
        });
    } else if (path === '/profile') {
        // Profile is a separate page, redirect to it
        window.location.href = '/src/features/profile/profile.html';
    } else {
        // 404 Redirect
        window.location.href = '/';
    }
}

route();