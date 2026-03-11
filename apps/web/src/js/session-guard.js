/**
 * Session Guard — Auto-logout on inactivity and app close
 * 
 * Strategy:
 *  - Supabase is configured with sessionStorage (in auth.js) so
 *    tokens automatically vanish when the tab/window truly closes.
 *  - This module only handles the inactivity timer (15 min).
 */

import { auth } from './auth.js';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let inactivityTimer = null;

/**
 * Initialize the session guard.
 * Call this ONCE after confirming the user is authenticated.
 */
export function initSessionGuard() {
    // Inactivity timer — logout after N minutes without interaction
    resetInactivityTimer();

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    console.log('[SessionGuard] Active — sessionStorage auth + 15min inactivity timer');
}

/**
 * Reset the inactivity countdown
 */
function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    inactivityTimer = setTimeout(async () => {
        console.log('[SessionGuard] Inactivity timeout — logging out');
        try {
            await auth.logout();
        } catch (e) {
            // Fallback: clear sessionStorage manually
            const keys = Object.keys(sessionStorage);
            for (const key of keys) {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    sessionStorage.removeItem(key);
                }
            }
        }
        window.location.href = '/login';
    }, INACTIVITY_TIMEOUT_MS);
}
