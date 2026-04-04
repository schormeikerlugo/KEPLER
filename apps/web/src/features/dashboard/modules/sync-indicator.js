/**
 * Sync Status Indicator Module
 * Shows connection status and pending sync count in dashboard header
 */

import { offlineSync } from '../../../js/services/api.js';

// ============================================================
// TEMPLATE
// ============================================================

const INDICATOR_HTML = `
<div class="sync-indicator" id="sync-indicator" title="Estado de sincronización">
    <span class="sync-dot"></span>
    <span class="sync-text">Conectado</span>
    <span class="sync-badge" id="sync-badge" style="display: none;">0</span>
</div>
`;

// ============================================================
// STYLES
// ============================================================

const INDICATOR_STYLES = `
<style id="sync-indicator-styles">
.sync-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.3s ease;
    user-select: none;
}

.sync-indicator:hover {
    background: rgba(255, 255, 255, 0.1);
}

.sync-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00d4aa;
    transition: background 0.3s ease;
}

.sync-indicator.offline .sync-dot {
    background: #ff6b6b;
}

.sync-indicator.syncing .sync-dot {
    background: #ffd93d;
    animation: pulse-dot 1s infinite;
}

.sync-indicator.pending .sync-dot {
    background: #ffd93d;
}

@keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.8); }
}

.sync-text {
    color: rgba(255, 255, 255, 0.8);
    white-space: nowrap;
}

.sync-badge {
    background: #ff6b6b;
    color: white;
    font-size: 0.65rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
}

.sync-indicator.syncing .sync-badge {
    background: #ffd93d;
    color: #333;
}

/* Mobile: Hide text, only show dot */
@media (max-width: 600px) {
    .sync-indicator {
        padding: 6px 10px;
    }
    .sync-text {
        display: none;
    }
}
</style>
`;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Initialize sync status indicator
 * @param {string} containerId - ID of container to append indicator to
 */
export function initSyncIndicator(containerId = 'dash-header-left') {
    // Inject styles if not present
    if (!document.getElementById('sync-indicator-styles')) {
        document.head.insertAdjacentHTML('beforeend', INDICATOR_STYLES);
    }

    // Find container (fallback to header)
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.querySelector('.dash-header-left');
    }
    if (!container) {
        console.warn('[SyncIndicator] Container not found');
        return;
    }

    // Inject indicator after server status
    const serverStatus = container.querySelector('.server-status');
    if (serverStatus) {
        serverStatus.insertAdjacentHTML('afterend', INDICATOR_HTML);
    } else {
        container.insertAdjacentHTML('beforeend', INDICATOR_HTML);
    }

    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;

    // Click handler for force sync
    indicator.addEventListener('click', async () => {
        const status = offlineSync.getStatus();
        if (status.pendingCount > 0 && status.isOnline) {
            updateIndicator({ ...status, isSyncing: true });
            const result = await offlineSync.forceSync();
            console.log('[SyncIndicator] Force sync result:', result);
        } else if (!status.isOnline) {
            if (window.kepler && window.kepler.notify) {
                window.kepler.notify.show('📴 Sin conexión. Los objetos se sincronizarán automáticamente.', 'warning', 3000, { source: 'sync', isOnline: false, pendingCount: status.pendingCount || 0 });
            }
        } else {
            if (window.kepler && window.kepler.notify) {
                window.kepler.notify.show('✅ Todo sincronizado', 'success', 2000, { source: 'sync', isOnline: true, pendingCount: 0 });
            }
        }
    });

    // Set initial status
    updateIndicator(offlineSync.getStatus());

    // Subscribe to status changes
    offlineSync.setStatusCallback(updateIndicator);
}

/**
 * Update indicator based on status
 * @param {Object} status
 */
function updateIndicator(status) {
    const indicator = document.getElementById('sync-indicator');
    const badge = document.getElementById('sync-badge');
    const textEl = indicator?.querySelector('.sync-text');

    if (!indicator) return;

    // Remove all state classes
    indicator.classList.remove('offline', 'syncing', 'pending');

    if (!status.isOnline) {
        // Offline
        indicator.classList.add('offline');
        if (textEl) textEl.textContent = 'Sin conexión';
        indicator.title = 'Sin conexión - Los datos se guardan localmente';

        if (status.pendingCount > 0) {
            badge.textContent = status.pendingCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    } else if (status.isSyncing) {
        // Syncing
        indicator.classList.add('syncing');
        if (textEl) textEl.textContent = 'Sincronizando...';
        indicator.title = 'Sincronizando objetos pendientes...';

        if (status.pendingCount > 0) {
            badge.textContent = status.pendingCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    } else if (status.pendingCount > 0) {
        // Online with pending items
        indicator.classList.add('pending');
        if (textEl) textEl.textContent = 'Pendientes';
        indicator.title = `${status.pendingCount} objeto(s) pendiente(s) - Click para sincronizar`;
        badge.textContent = status.pendingCount;
        badge.style.display = 'inline';
    } else {
        // All synced
        if (textEl) textEl.textContent = 'Conectado';
        indicator.title = 'Conectado - Todo sincronizado';
        badge.style.display = 'none';
    }
}
