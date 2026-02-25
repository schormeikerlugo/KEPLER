/**
 * Unified System Status Panel
 * Collapsible indicator showing all system states: Backend, GPS, Sync, AI
 * Supports multiple instances (Desktop/Mobile) via class-based selection
 */

import { offlineSync } from '../../../js/services/api.js';

// ============================================================
// STATE
// ============================================================

let statusData = {
    backend: { status: 'checking', label: 'Backend' },
    gps: { status: 'checking', label: 'GPS' },
    sync: { status: 'ok', label: 'Sync', pending: 0 },
    ai: { status: 'checking', label: 'IA' }
};

// ============================================================
// TEMPLATE (Classes Only, No IDs to allow multiple instances)
// ============================================================

const PANEL_HTML = `
<div class="system-status-panel">
    <div class="status-main">
        <span class="status-dot main-dot"></span>
        <span class="status-label">Sistema</span>
        <span class="status-arrow">▼</span>
    </div>
    <div class="status-dropdown">
        <div class="status-item" data-status="backend">
            <span class="status-dot"></span>
            <span class="status-icon">🖥️</span>
            <span class="status-name">Backend</span>
            <span class="status-value">--</span>
        </div>
        <div class="status-item" data-status="gps">
            <span class="status-dot"></span>
            <span class="status-icon">📍</span>
            <span class="status-name">GPS</span>
            <span class="status-value">--</span>
        </div>
        <div class="status-item" data-status="sync">
            <span class="status-dot"></span>
            <span class="status-icon">☁️</span>
            <span class="status-name">Sync</span>
            <span class="status-value">--</span>
        </div>
        <div class="status-item" data-status="ai">
            <span class="status-dot"></span>
            <span class="status-icon">🧠</span>
            <span class="status-name">IA</span>
            <span class="status-value">--</span>
        </div>
    </div>
</div>
`;

// ============================================================
// STYLES
// ============================================================

const PANEL_STYLES = `
<style id="system-status-styles">
.system-status-panel {
    position: relative;
    font-family: 'Jura', sans-serif;
    z-index: 100;
}

.status-main {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    user-select: none;
}

.status-main:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(63, 168, 255, 0.3);
}

.system-status-panel.expanded .status-main {
    border-color: rgba(63, 168, 255, 0.5);
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 15px rgba(63, 168, 255, 0.1);
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00d4aa;
    flex-shrink: 0;
    transition: background 0.3s ease;
}

.status-dot.warning { background: #ffd93d; }
.status-dot.error { background: #ff6b6b; }
.status-dot.loading { 
    background: #ffd93d;
    animation: pulse-status 1s infinite;
}

@keyframes pulse-status {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

.status-label {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
}

.status-arrow {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.5);
    transition: transform 0.3s ease;
}

.system-status-panel.expanded .status-arrow {
    transform: rotate(180deg);
}

/* Dropdown - Floating Style */
.status-dropdown {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    left: auto;
    width: 220px;
    background: rgba(10, 15, 25, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(63, 168, 255, 0.3);
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-10px);
    transition: all 0.3s ease;
    z-index: 1000;
}

.system-status-panel.expanded .status-dropdown {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

.status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    transition: background 0.2s ease;
    border-radius: 6px;
}

.status-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.status-item .status-dot {
    width: 6px;
    height: 6px;
}

.status-icon {
    font-size: 0.9rem;
    width: 20px;
    text-align: center;
}

.status-name {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
    flex: 1;
}

.status-value {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.5);
    text-align: right;
}

.status-value.ok { color: #00d4aa; }
.status-value.warning { color: #ffd93d; }
.status-value.error { color: #ff6b6b; }

/* Mobile Adaptations */
.mobile-status-container {
    display: none !important;
}

@media (max-width: 900px) {
    .mobile-status-container {
        display: block !important;
        margin-left: auto; /* Push to right of left section */
        margin-right: 15px;
    }
    
    /* On mobile, also align right (expand left) to avoid scroll */
    /* Inherits right: 0 from desktop styles */
    .mobile-status-container .status-dropdown {
        left: auto;
        right: 0;
    }
    
    .status-label {
        display: none; /* Compact mode */
    }
    
    .status-main {
        padding: 8px; /* Square button style */
    }
}
</style>
`;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Initialize unified system status panel
 * Handles both Desktop and Mobile instances
 */
export function initSystemStatus() {
    // Inject styles (Force remove old if exists to update CSS)
    const oldStyles = document.getElementById('system-status-styles');
    if (oldStyles) oldStyles.remove();

    document.head.insertAdjacentHTML('beforeend', PANEL_STYLES);

    // Remove old indicators
    document.getElementById('sync-indicator')?.remove();
    document.querySelector('.server-status')?.remove();
    document.getElementById('dash-gps-status')?.remove();

    // 1. Inject into Desktop Container
    const desktopContainer = document.getElementById('system-status-container');
    if (desktopContainer) {
        desktopContainer.innerHTML = PANEL_HTML;
    }

    // 2. Inject into Mobile Container
    const mobileContainer = document.getElementById('system-status-mobile');
    if (mobileContainer) {
        mobileContainer.innerHTML = PANEL_HTML;
    }

    // Global click handler using Event Delegation
    document.addEventListener('click', (e) => {
        const mainBtn = e.target.closest('.status-main');

        if (mainBtn) {
            // Toggle the panel belonging to this button
            e.stopPropagation();
            const panel = mainBtn.closest('.system-status-panel');
            togglePanel(panel);
        } else {
            // If clicking outside, close ALL panels
            if (!e.target.closest('.status-dropdown')) {
                closeAllPanels();
            }
        }
    });

    // Start monitoring
    startStatusMonitoring();

    // Initial update
    updateAllStatuses();
}

/**
 * Toggle specific panel expanded state
 */
function togglePanel(panel) {
    if (!panel) return;

    // Check if currently expanded
    const isExpanded = panel.classList.contains('expanded');

    // Close all first (to avoid multiple open menus)
    closeAllPanels();

    // Toggle target (if it wasn't expanded, expand it)
    if (!isExpanded) {
        panel.classList.add('expanded');
    }
}

function closeAllPanels() {
    const allPanels = document.querySelectorAll('.system-status-panel');
    allPanels.forEach(p => p.classList.remove('expanded'));
}

// ============================================================
// STATUS MONITORING
// ============================================================

function startStatusMonitoring() {
    // GPS monitoring
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(
            (pos) => updateStatus('gps', 'ok', `${pos.coords.accuracy.toFixed(0)}m`),
            (err) => {
                if (err.code === 1) updateStatus('gps', 'error', 'Sin permiso');
                else updateStatus('gps', 'warning', 'Buscando...');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        updateStatus('gps', 'error', 'No soportado');
    }

    // Sync monitoring
    offlineSync.setStatusCallback((status) => {
        if (!status.isOnline) {
            updateStatus('sync', 'error', 'Sin conexión');
        } else if (status.isSyncing) {
            updateStatus('sync', 'loading', 'Sincronizando');
        } else if (status.pendingCount > 0) {
            updateStatus('sync', 'warning', `${status.pendingCount} pendiente(s)`);
        } else {
            updateStatus('sync', 'ok', 'Sincronizado');
        }
        updateMainIndicator();
    });

    // AI Model monitoring (Backend via WebSocket)
    const updateAI = async () => {
        try {
            const res = await fetch('/api/status?t=' + Date.now());
            if (res.ok) {
                const data = await res.json();
                if (data.available) {
                    updateStatus('ai', 'ok', 'Native Core');
                } else {
                    updateStatus('ai', 'warning', 'Inactivo');
                }
            } else {
                updateStatus('ai', 'error', 'Fallo API');
            }
        } catch {
            updateStatus('ai', 'error', 'Desconectado');
        }
        updateMainIndicator();
    };

    updateAI();
    setInterval(updateAI, 30000);

    // Backend check
    checkBackendStatus();
    setInterval(checkBackendStatus, 30000);
}

async function checkBackendStatus() {
    try {
        const res = await fetch('/api/dashboard/stats?t=' + Date.now());
        if (res.ok) {
            updateStatus('backend', 'ok', 'Activo');
        } else {
            updateStatus('backend', 'warning', 'Error');
        }
    } catch {
        updateStatus('backend', 'error', 'Sin conexión');
    }
    updateMainIndicator();
}

function updateAllStatuses() {
    const syncStatus = offlineSync.getStatus();
    if (!syncStatus.isOnline) updateStatus('sync', 'error', 'Sin conexión');
    // Other statuses update via intervals/watchers
    updateMainIndicator();
}

// ============================================================
// UI UPDATES (Affects ALL instances using querySelectorAll)
// ============================================================

function updateStatus(key, status, value) {
    statusData[key] = { ...statusData[key], status, value };

    // Update ALL instances in DOM
    const items = document.querySelectorAll(`.status-item[data-status="${key}"]`);

    items.forEach(item => {
        const dot = item.querySelector('.status-dot');
        const valueEl = item.querySelector('.status-value');

        // Update dot
        dot.className = 'status-dot'; // Reset classes
        if (status === 'warning') dot.classList.add('warning');
        else if (status === 'error') dot.classList.add('error');
        else if (status === 'loading') dot.classList.add('loading');

        // Update value
        valueEl.textContent = value;
        valueEl.classList.remove('ok', 'warning', 'error');
        valueEl.classList.add(status === 'loading' ? 'warning' : status);
    });
}

function updateMainIndicator() {
    const statuses = Object.values(statusData).map(s => s.status);
    let masterStatus = 'ok';

    if (statuses.includes('error')) masterStatus = 'error';
    else if (statuses.includes('warning') || statuses.includes('loading')) masterStatus = 'warning';

    // Update ALL main dots
    const mainDots = document.querySelectorAll('.status-main .main-dot');
    mainDots.forEach(dot => {
        dot.classList.remove('warning', 'error', 'loading');
        if (masterStatus !== 'ok') dot.classList.add(masterStatus);
    });
}
