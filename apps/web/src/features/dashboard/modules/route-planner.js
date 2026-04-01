/**
 * route-planner.js
 * Route Intelligence Module
 * Handles: Route corridor analysis, risk assessment, nearby alerts
 */
import { api } from '../../../js/services/api.js';
import { auth } from '../../../js/auth.js';

let waypoints = [];
let isPlanning = false;

export async function initRoutePlanner() {
    const container = document.getElementById('route-intelligence-panel');
    if (!container) return;

    renderEmptyState(container);

    // Check if we have stored location
    const lat = sessionStorage.getItem('kepler_lat');
    const lng = sessionStorage.getItem('kepler_lng');

    if (lat && lng) {
        await checkNearbyAlerts(parseFloat(lat), parseFloat(lng));
    }

    // Setup route planner toggle
    const toggleBtn = document.getElementById('route-planner-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => toggleRoutePlanner());
    }
}

function renderEmptyState(container) {
    container.innerHTML = `
        <div class="route-empty">
            <span class="route-empty-icon">🗺️</span>
            <p class="route-empty-text">Planifica tu ruta para ver análisis de riesgo</p>
            <button class="route-plan-btn" id="start-route-plan">
                <span class="btn-icon">+</span> Nueva Ruta
            </button>
        </div>
    `;
    document.getElementById('start-route-plan')?.addEventListener('click', () => toggleRoutePlanner());
}

function renderRiskAssessment(container, risk) {
    const nivelColor = {
        'bajo': '#4ADE80',
        'medio': '#FBBF24',
        'alto': '#F97316',
        'critico': '#EF4444'
    };

    const color = nivelColor[risk.nivel_riesgo] || '#6B7280';

    container.innerHTML = `
        <div class="route-risk-header">
            <div class="route-risk-badge" style="background:${color}20; color:${color}; border-color:${color}">
                <span class="risk-icon">${getRiskIcon(risk.nivel_riesgo)}</span>
                <span class="risk-level">${getRiskLabel(risk.nivel_riesgo)}</span>
            </div>
            <div class="route-risk-score">
                <span class="score-value">${risk.score || 0}</span>
                <span class="score-label">puntos</span>
            </div>
        </div>
        <div class="route-stats-grid">
            <div class="route-stat-item">
                <span class="stat-icon">⚠️</span>
                <span class="stat-value">${risk.stats?.peligros_criticos || 0}</span>
                <span class="stat-label">Críticos</span>
            </div>
            <div class="route-stat-item">
                <span class="stat-icon">👤</span>
                <span class="stat-value">${risk.stats?.hostiles || 0}</span>
                <span class="stat-label">Hostiles</span>
            </div>
            <div class="route-stat-item">
                <span class="stat-icon">🛤️</span>
                <span class="stat-value">${risk.stats?.rutas_peligrosas || 0}</span>
                <span class="stat-label">Rutas Pelig.</span>
            </div>
            <div class="route-stat-item">
                <span class="stat-icon">📍</span>
                <span class="stat-value">${risk.stats?.objetos_cerca || 0}</span>
                <span class="stat-label">Objetos</span>
            </div>
        </div>
        ${risk.alertas && risk.alertas.length > 0 ? `
            <div class="route-alerts">
                <h5 class="alerts-title">Alertas</h5>
                ${risk.alerts.map(alert => `
                    <div class="route-alert alert-${alert.tipo}">
                        <span class="alert-icon">${getAlertIcon(alert.tipo)}</span>
                        <span class="alert-msg">${alert.mensaje}</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        <div class="route-actions">
            <button class="route-action-btn secondary" id="clear-route">Limpiar</button>
            <button class="route-action-btn primary" id="analyze-corridor">Analizar</button>
        </div>
    `;

    document.getElementById('clear-route')?.addEventListener('click', () => clearRoute(container));
    document.getElementById('analyze-corridor')?.addEventListener('click', () => analyzeCorridor(container));
}

function getRiskIcon(level) {
    const icons = { 'bajo': '✓', 'medio': '⚠', 'alto': '⚠', 'critico': '✕' };
    return icons[level] || '?';
}

function getRiskLabel(level) {
    const labels = { 'bajo': 'Bajo', 'medio': 'Medio', 'alto': 'Alto', 'critico': 'Crítico' };
    return labels[level] || 'Desconocido';
}

function getAlertIcon(tipo) {
    const icons = {
        'critical': '🚨',
        'danger': '⚠️',
        'warning': '⚡',
        'settlement': '🏠',
        'info': 'ℹ️'
    };
    return icons[tipo] || '•';
}

export async function toggleRoutePlanner() {
    const container = document.getElementById('route-intelligence-panel');
    if (!container) return;

    isPlanning = !isPlanning;

    if (isPlanning) {
        container.innerHTML = `
            <div class="route-planner">
                <div class="planner-header">
                    <h4>Planificador de Ruta</h4>
                    <button class="planner-close" id="close-planner">×</button>
                </div>
                <div class="planner-instructions">
                    <p>Click en el mapa para agregar waypoints</p>
                    <p class="hint">Mínimo 2 puntos para analizar</p>
                </div>
                <div class="waypoints-list" id="waypoints-list">
                    <p class="no-waypoints">Sin waypoints aún</p>
                </div>
                <div class="planner-actions">
                    <button class="planner-btn" id="undo-waypoint">↩️ Deshacer</button>
                    <button class="planner-btn primary" id="analyze-btn" disabled>Analizar Corridor</button>
                </div>
            </div>
        `;

        document.getElementById('close-planner')?.addEventListener('click', () => {
            isPlanning = false;
            initRoutePlanner();
        });
        document.getElementById('undo-waypoint')?.addEventListener('click', undoWaypoint);
        document.getElementById('analyze-btn')?.addEventListener('click', () => analyzeCorridor(container));

        // Enable map clicks for waypoint adding
        enableMapClicks();
    } else {
        disableMapClicks();
        initRoutePlanner();
    }
}

let mapClickHandler = null;

function enableMapClicks() {
    // This would integrate with your existing map system
    // For now, we'll use a simple coordinate input
    console.log('[RoutePlanner] Map clicks enabled - implement map integration');
}

function disableMapClicks() {
    if (mapClickHandler) {
        mapClickHandler = null;
    }
}

export function addWaypoint(lat, lng) {
    waypoints.push({ lat, lng });
    updateWaypointsList();
}

function undoWaypoint() {
    if (waypoints.length > 0) {
        waypoints.pop();
        updateWaypointsList();
    }
}

function updateWaypointsList() {
    const list = document.getElementById('waypoints-list');
    const analyzeBtn = document.getElementById('analyze-btn');

    if (!list) return;

    if (waypoints.length === 0) {
        list.innerHTML = '<p class="no-waypoints">Sin waypoints aún</p>';
        analyzeBtn.disabled = true;
        return;
    }

    list.innerHTML = waypoints.map((wp, i) => `
        <div class="waypoint-item">
            <span class="wp-number">${i + 1}</span>
            <span class="wp-coords">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</span>
        </div>
    `).join('');

    analyzeBtn.disabled = waypoints.length < 2;
}

function clearRoute(container) {
    waypoints = [];
    initRoutePlanner();
    disableMapClicks();
}

async function analyzeCorridor(container) {
    if (waypoints.length < 2) return;

    container.innerHTML = `<div class="route-loading"><span class="loader"></span>Analizando...</div>`;

    try {
        const risk = await api.getRouteRiskAssessment(waypoints, 200);
        renderRiskAssessment(container, risk);
    } catch (e) {
        console.error('[RoutePlanner] Analysis failed:', e);
        container.innerHTML = `
            <div class="route-error">
                <p>Error al analizar ruta</p>
                <button class="route-plan-btn" onclick="initRoutePlanner()">Reintentar</button>
            </div>
        `;
    }
}

async function checkNearbyAlerts(lat, lng) {
    const container = document.getElementById('route-intelligence-panel');
    if (!container) return;

    try {
        const alerts = await api.getNearbyAlerts(lat, lng, 300);
        if (alerts.alertas && alerts.alertas.length > 0) {
            renderNearbyAlerts(container, alerts);
        }
    } catch (e) {
        console.log('[RoutePlanner] Nearby alerts failed:', e);
    }
}

function renderNearbyAlerts(container, alerts) {
    container.innerHTML = `
        <div class="nearby-alerts">
            <div class="alerts-header">
                <span class="alerts-icon">⚡</span>
                <h4>Alertas Cercanas</h4>
            </div>
            <div class="alerts-list">
                ${alerts.alertas.map(a => `
                    <div class="nearby-alert-item">
                        <span class="alert-msg">${a.mensaje}</span>
                    </div>
                `).join('')}
            </div>
            <button class="route-plan-btn" id="plan-route-from-alerts">
                Planificar Ruta Segura
            </button>
        </div>
    `;
    document.getElementById('plan-route-from-alerts')?.addEventListener('click', () => toggleRoutePlanner());
}

// Export waypoints for external use
export function getWaypoints() {
    return waypoints;
}

export function setWaypoints(newWaypoints) {
    waypoints = newWaypoints;
    updateWaypointsList();
}