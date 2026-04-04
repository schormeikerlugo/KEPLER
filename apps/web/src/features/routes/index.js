/**
 * KEPLER - Página de Planificación de Rutas
 * Página dedicada para crear, editar y gestionar rutas planificadas
 */

import { auth } from '../../js/auth.js';
import { api } from '../../js/services/api.js';
import { initHeader } from '../../components/Header/Header.js';
import { Protocol } from 'pmtiles';
import './styles.css';

let map = null;
let waypoints = [];
let waypointMarkers = [];
let routeLineSource = null;
let savedRoutes = [];
let editingRouteId = null;

// Map layers configuration
const MAP_SOURCES = {
    'vector': { name: 'Vector', icon: '⚡', desc: '3D y animaciones' },
    'dark': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=osm', attrib: 'OSM', name: 'Dark', icon: '🌙', desc: 'Modo oscuro' },
    'street': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=osm', attrib: 'OSM', name: 'Street', icon: '🛣️', desc: 'Calles detalladas' },
    'satellite': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=esri', attrib: 'ESRI', name: 'Satélite', icon: '🛰️', desc: 'Imágenes reales' },
    'terrain': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=opentopo', attrib: 'OpenTopo', name: 'Terrain', icon: '⛰️', desc: 'Topográfico' }
};
let currentLayer = 'vector';
let availableRegions = [];

// Register PMTiles protocol
let pmtilesProtocol = null;
try {
    pmtilesProtocol = new Protocol();
    maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
} catch (e) {
    console.warn('[Routes] PMTiles protocol already registered');
}

export async function render(container) {
    container.innerHTML = `
        <div id="header-container"></div>
        <div class="routes-page">
            <div class="routes-map-container" id="routes-map">
                <!-- Layer controls overlay -->
                <div class="route-map-controls">
                    <button class="route-map-btn" id="btn-layer-select" title="Cambiar mapa">🗺️</button>
                    <button class="route-map-btn" id="btn-my-location" title="Mi ubicación">🎯</button>
                </div>

                <!-- Layer Selector Modal -->
                <div class="routes-layer-modal" id="routes-layer-modal" style="display:none;">
                    <div class="layer-modal-content">
                        <div class="layer-modal-header">
                            <span>🗺️ Seleccionar Mapa</span>
                            <button class="layer-modal-close" id="layer-modal-close">×</button>
                        </div>
                        <div class="layer-options">
                            <div class="layer-option-card active" data-layer="vector">
                                <span class="layer-icon">⚡</span>
                                <span class="layer-name">Vector</span>
                                <span class="layer-desc">3D y animaciones</span>
                            </div>
                            <div class="layer-option-card" data-layer="dark">
                                <span class="layer-icon">🌙</span>
                                <span class="layer-name">Dark</span>
                                <span class="layer-desc">Modo oscuro</span>
                            </div>
                            <div class="layer-option-card" data-layer="street">
                                <span class="layer-icon">🛣️</span>
                                <span class="layer-name">Street</span>
                                <span class="layer-desc">Calles detalladas</span>
                            </div>
                            <div class="layer-option-card" data-layer="satellite">
                                <span class="layer-icon">🛰️</span>
                                <span class="layer-name">Satélite</span>
                                <span class="layer-desc">Imágenes reales</span>
                            </div>
                            <div class="layer-option-card" data-layer="terrain">
                                <span class="layer-icon">⛰️</span>
                                <span class="layer-name">Terrain</span>
                                <span class="layer-desc">Topográfico</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="routes-panel">
                <div class="panel-header">
                    <h2 class="panel-title">Planificador de Rutas</h2>
                    <p class="panel-subtitle">Click en el mapa para agregar waypoints</p>
                </div>

                <!-- Formulario de ruta -->
                <div class="route-form">
                    <div class="form-group">
                        <label class="form-label">Nombre de la Ruta</label>
                        <input type="text" id="route-name" class="form-input" placeholder="Ej: Patrulla Norte" />
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Terreno</label>
                            <select id="route-terrain" class="form-select">
                                <option value="llano">Llano</option>
                                <option value="tierra">Tierra</option>
                                <option value="rocoso">Rocoso</option>
                                <option value="montañoso">Montañoso</option>
                                <option value="barro">Barro</option>
                                <option value="irregular">Irregular</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Seguridad</label>
                            <select id="route-safety" class="form-select">
                                <option value="seguro">Seguro</option>
                                <option value="precaucion">Precaución</option>
                                <option value="peligro">Peligro</option>
                                <option value="desconocido">Desconocido</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo</label>
                        <div class="route-type-toggle">
                            <button class="type-btn active" data-type="plantilla">
                                <span class="type-icon">📋</span>
                                <span class="type-label">Plantilla</span>
                                <span class="type-hint">Reutilizable</span>
                            </button>
                            <button class="type-btn" data-type="mision">
                                <span class="type-icon">🚀</span>
                                <span class="type-label">Para Misión</span>
                                <span class="type-hint">Uso único</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Waypoints -->
                <div class="waypoints-section">
                    <div class="waypoints-header">
                        <h3 class="waypoints-title">Waypoints</h3>
                        <span class="waypoints-count" id="waypoint-count">0</span>
                    </div>
                    <div class="waypoints-hint" id="waypoints-hint">
                        Click en el mapa para agregar puntos
                    </div>
                    <div class="waypoints-list" id="waypoints-list"></div>
                    <div class="waypoint-actions">
                        <button class="wp-action-btn" id="undo-waypoint" disabled>
                            <span>↩️</span> Deshacer
                        </button>
                        <button class="wp-action-btn danger" id="clear-waypoints" disabled>
                            <span>🗑️</span> Limpiar
                        </button>
                    </div>
                </div>

                <!-- Análisis de corridor -->
                <div class="corridor-section" id="corridor-section" style="display:none;">
                    <h3 class="corridor-title">Análisis de Corredor</h3>
                    <div class="corridor-stats" id="corridor-stats"></div>
                    <div class="corridor-alerts" id="corridor-alerts"></div>
                </div>

                <!-- Acciones -->
                <div class="route-actions">
                    <button class="action-btn secondary" id="analyze-route" disabled>
                        🔍 Analizar Corredor
                    </button>
                    <button class="action-btn primary" id="save-route" disabled>
                        💾 Guardar Ruta
                    </button>
                </div>

                <!-- Separador -->
                <div class="panel-divider"></div>

                <!-- Rutas guardadas -->
                <div class="saved-routes-section">
                    <div class="saved-header">
                        <h3 class="saved-title">Rutas Guardadas</h3>
                        <button class="refresh-btn" id="refresh-routes" title="Actualizar">🔄</button>
                    </div>
                    <div class="saved-list" id="saved-routes-list">
                        <div class="loading-placeholder">Cargando rutas...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inicializar header
    await initHeader('header-container', { context: 'dashboard' });

    // Configurar botón Archivos en header
    setupHeaderButtons();

    // Inicializar mapa
    await initMap();

    // Configurar eventos
    setupEvents();

    // Cargar rutas guardadas
    await loadSavedRoutes();
}

function setupHeaderButtons() {
    const btnArchives = document.getElementById('btn-archives');
    if (btnArchives) {
        btnArchives.addEventListener('click', () => {
            window.location.href = '/#archives';
        });
    }
    const btnTaxonomia = document.getElementById('btn-taxonomia');
    if (btnTaxonomia) {
        btnTaxonomia.addEventListener('click', () => {
            window.kepler?.navigate?.('/taxonomia') || (window.location.href = '/taxonomia');
        });
    }
}

async function initMap() {
    if (typeof maplibregl === 'undefined') {
        console.error('MapLibre GL not loaded');
        return;
    }

    // Obtener ubicación del usuario
    let center = [-67.0000, 10.1833]; // Default: Venezuela
    const storedLat = sessionStorage.getItem('kepler_lat');
    const storedLng = sessionStorage.getItem('kepler_lng');
    if (storedLat && storedLng) {
        center = [parseFloat(storedLng), parseFloat(storedLat)];
    }

    const mapContainer = document.getElementById('routes-map');

    // Start with default raster style (will upgrade to vector on load)
    map = new maplibregl.Map({
        container: 'routes-map',
        style: {
            version: 8,
            sources: {
                'base-source': {
                    type: 'raster',
                    tiles: [window.location.origin + '/api/utils/tiles/{z}/{x}/{y}.png?source=osm'],
                    tileSize: 256,
                    attribution: 'OSM'
                }
            },
            layers: [{
                id: 'base-layer',
                type: 'raster',
                source: 'base-source',
                minzoom: 0,
                maxzoom: 22
            }]
        },
        center: center,
        zoom: 14,
        attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', async () => {
        console.log('✅ Routes Map Loaded');

        // Check for available vector tile regions
        try {
            const response = await fetch('/api/utils/pmtiles/available');
            const data = await response.json();
            availableRegions = data.regions || [];
        } catch (e) {
            console.log('No PMTiles regions available');
            availableRegions = [];
        }

        // Use vector mode if regions available, otherwise raster dark
        if (availableRegions.length > 0) {
            console.log('🎨 Vector tiles available, using vector mode');
            await setVectorStyle();
        } else {
            console.log('📍 No vector regions, using raster Odradek mode');
            setLayer('dark');
        }

        // Add route layers after base map is ready
        addRouteLayers();
    });

    // Click para agregar waypoint
    map.on('click', (e) => {
        addWaypoint(e.lngLat.lat, e.lngLat.lng);
    });
}

async function setVectorStyle() {
    if (!map) return;

    const mapContainer = document.getElementById('routes-map');

    try {
        const response = await fetch('/src/features/map/styles/odradek-vector.json');
        const style = await response.json();

        // Update the PMTiles source URL to use available region
        if (availableRegions.length > 0) {
            const region = availableRegions[0].id;
            style.sources.protomaps.url = `pmtiles://${window.location.origin}/api/utils/pmtiles/${region}.pmtiles`;
        }

        map.setStyle(style);
        currentLayer = 'vector';
        mapContainer?.classList.remove('map-mode-odradek');

        // Re-add route layers after style change
        map.once('styledata', () => {
            addRouteLayers();
        });

        // Update active card
        document.querySelectorAll('.layer-option-card').forEach(card => {
            card.classList.toggle('active', card.dataset.layer === 'vector');
        });

        console.log('✅ Vector Style Applied');
    } catch (error) {
        console.error('Failed to load vector style:', error);
        setLayer('dark');
    }
}

function addWaypoint(lat, lng) {
    waypoints.push({ lat, lng });

    // Crear marcador
    const el = document.createElement('div');
    el.className = 'waypoint-marker';
    el.innerHTML = `<span class="wp-num">${waypoints.length}</span>`;

    const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

    waypointMarkers.push(marker);

    // Actualizar línea
    updateRouteLine();

    // Actualizar UI
    updateWaypointsUI();
    updateSaveButton();

    // Fly to first waypoint
    if (waypoints.length === 1) {
        map.flyTo({ center: [lng, lat], zoom: 15 });
    }
}

function removeLastWaypoint() {
    if (waypoints.length === 0) return;

    waypoints.pop();
    const marker = waypointMarkers.pop();
    if (marker) marker.remove();

    updateRouteLine();
    updateWaypointsUI();
    updateSaveButton();
}

function clearAllWaypoints() {
    waypoints = [];
    waypointMarkers.forEach(m => m.remove());
    waypointMarkers = [];

    updateRouteLine();
    updateWaypointsUI();
    updateSaveButton();

    // Ocultar sección de corridor
    document.getElementById('corridor-section').style.display = 'none';
}

function updateRouteLine() {
    if (!map || !map.getSource('route-line')) return;

    const coordinates = waypoints.map(wp => [wp.lng, wp.lat]);

    if (coordinates.length < 2) {
        map.getSource('route-line').setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] }
        });
        return;
    }

    map.getSource('route-line').setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates }
    });
}

function updateWaypointsUI() {
    const count = document.getElementById('waypoint-count');
    const list = document.getElementById('waypoints-list');
    const hint = document.getElementById('waypoints-hint');
    const undoBtn = document.getElementById('undo-waypoint');
    const clearBtn = document.getElementById('clear-waypoints');

    count.textContent = waypoints.length;
    undoBtn.disabled = waypoints.length === 0;
    clearBtn.disabled = waypoints.length === 0;

    if (waypoints.length === 0) {
        hint.style.display = 'block';
        list.innerHTML = '';
        return;
    }

    hint.style.display = 'none';
    list.innerHTML = waypoints.map((wp, i) => `
        <div class="wp-item" data-index="${i}">
            <span class="wp-item-num">${i + 1}</span>
            <span class="wp-item-coords">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</span>
            <button class="wp-item-remove" data-index="${i}" title="Eliminar">×</button>
        </div>
    `).join('');

    // Event listeners para eliminar individual
    list.querySelectorAll('.wp-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            removeWaypointAt(idx);
        });
    });
}

function removeWaypointAt(index) {
    if (index < 0 || index >= waypoints.length) return;

    waypoints.splice(index, 1);
    const marker = waypointMarkers.splice(index, 1)[0];
    if (marker) marker.remove();

    // Renumerar marcadores
    waypointMarkers.forEach((m, i) => {
        const el = m.getElement();
        el.querySelector('.wp-num').textContent = i + 1;
    });

    updateRouteLine();
    updateWaypointsUI();
    updateSaveButton();
}

function updateSaveButton() {
    const saveBtn = document.getElementById('save-route');
    const analyzeBtn = document.getElementById('analyze-route');
    const nameInput = document.getElementById('route-name');

    const canSave = waypoints.length >= 2 && nameInput.value.trim().length > 0;
    saveBtn.disabled = !canSave;
    analyzeBtn.disabled = waypoints.length < 2;
}

function setupEvents() {
    // Nombre de ruta
    document.getElementById('route-name').addEventListener('input', updateSaveButton);

    // Undo waypoint
    document.getElementById('undo-waypoint').addEventListener('click', removeLastWaypoint);

    // Clear waypoints
    document.getElementById('clear-waypoints').addEventListener('click', clearAllWaypoints);

    // Toggle tipo de ruta
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Analizar corridor
    document.getElementById('analyze-route').addEventListener('click', analyzeCorridor);

    // Guardar ruta
    document.getElementById('save-route').addEventListener('click', saveRoute);

    // Refrescar rutas
    document.getElementById('refresh-routes').addEventListener('click', loadSavedRoutes);

    // Layer selector button
    document.getElementById('btn-layer-select')?.addEventListener('click', showLayerModal);

    // My location button
    document.getElementById('btn-my-location')?.addEventListener('click', flyToMyLocation);

    // Close layer modal
    document.getElementById('layer-modal-close')?.addEventListener('click', hideLayerModal);

    // Layer option cards
    document.querySelectorAll('.layer-option-card').forEach(card => {
        card.addEventListener('click', () => {
            const layerId = card.dataset.layer;
            setLayer(layerId);
            hideLayerModal();
        });
    });

    // Click outside modal to close
    document.getElementById('routes-layer-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'routes-layer-modal') hideLayerModal();
    });
}

async function analyzeCorridor() {
    if (waypoints.length < 2) return;

    const btn = document.getElementById('analyze-route');
    btn.textContent = '⏳ Analizando...';
    btn.disabled = true;

    try {
        const risk = await api.getRouteRiskAssessment(waypoints, 200);

        // Mostrar sección de corridor
        const section = document.getElementById('corridor-section');
        section.style.display = 'block';

        // Renderizar estadísticas
        const stats = document.getElementById('corridor-stats');
        const nivelColor = {
            'bajo': '#4ADE80', 'medio': '#FBBF24',
            'alto': '#F97316', 'critico': '#EF4444'
        };
        const color = nivelColor[risk.nivel_riesgo] || '#6B7280';

        stats.innerHTML = `
            <div class="risk-badge" style="background:${color}20; color:${color}; border-color:${color}">
                <span class="risk-icon">${getRiskIcon(risk.nivel_riesgo)}</span>
                <span>Riesgo: ${getRiskLabel(risk.nivel_riesgo)}</span>
                <span class="risk-score">${risk.score || 0} pts</span>
            </div>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-num">${risk.stats?.peligros_criticos || 0}</span>
                    <span class="stat-label">Críticos</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num">${risk.stats?.hostiles || 0}</span>
                    <span class="stat-label">Hostiles</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num">${risk.stats?.rutas_peligrosas || 0}</span>
                    <span class="stat-label">Rutas Pelig.</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num">${risk.stats?.objetos_cerca || 0}</span>
                    <span class="stat-label">Objetos</span>
                </div>
            </div>
        `;

        // Renderizar alertas
        const alerts = document.getElementById('corridor-alerts');
        if (risk.alertas && risk.alertas.length > 0) {
            alerts.innerHTML = risk.alertas.map(a => `
                <div class="corridor-alert alert-${a.tipo}">
                    <span class="alert-icon">${getAlertIcon(a.tipo)}</span>
                    <span>${a.mensaje}</span>
                </div>
            `).join('');
        } else {
            alerts.innerHTML = '<div class="no-alerts">Sin alertas detectadas ✓</div>';
        }

    } catch (e) {
        console.error('Corridor analysis failed:', e);
        document.getElementById('corridor-alerts').innerHTML =
            '<div class="corridor-alert alert-danger">Error al analizar corredor</div>';
    } finally {
        btn.textContent = '🔍 Analizar Corredor';
        btn.disabled = false;
    }
}

async function saveRoute() {
    const name = document.getElementById('route-name').value.trim();
    if (!name || waypoints.length < 2) return;

    const btn = document.getElementById('save-route');
    btn.textContent = '⏳ Guardando...';
    btn.disabled = true;

    try {
        const activeType = document.querySelector('.type-btn.active');
        const routeType = activeType?.dataset.type || 'plantilla';
        const terrain = document.getElementById('route-terrain').value;
        const safety = document.getElementById('route-safety').value;

        // Calcular distancia aproximada
        let totalDist = 0;
        for (let i = 1; i < waypoints.length; i++) {
            totalDist += getDistance(waypoints[i-1], waypoints[i]);
        }
        const distanceKm = (totalDist / 1000).toFixed(2);

        const routeData = {
            nombre: name,
            tipo_terreno: terrain,
            estado_seguridad: safety,
            distancia_total: parseFloat(distanceKm),
            waypoints: waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))
        };

        if (editingRouteId) {
            // TODO: implementar edición
            console.log('Edit mode not yet implemented');
        } else {
            const result = await api.createPlannedRoute(routeData);
            if (result.route) {
                window.kepler?.notify?.success('Ruta guardada exitosamente');
                // Limpiar formulario
                document.getElementById('route-name').value = '';
                clearAllWaypoints();
                document.getElementById('corridor-section').style.display = 'none';
                // Recargar lista
                await loadSavedRoutes();
            }
        }
    } catch (e) {
        console.error('Save failed:', e);
        window.kepler?.notify?.error('Error al guardar ruta');
    } finally {
        btn.textContent = '💾 Guardar Ruta';
        btn.disabled = true;
    }
}

async function loadSavedRoutes() {
    const list = document.getElementById('saved-routes-list');
    list.innerHTML = '<div class="loading-placeholder">Cargando rutas...</div>';

    try {
        const result = await api.getPlannedRoutes();
        savedRoutes = result.routes || [];

        if (savedRoutes.length === 0) {
            list.innerHTML = '<div class="empty-state">No tienes rutas guardadas aún</div>';
            return;
        }

        list.innerHTML = savedRoutes.map(route => `
            <div class="saved-route-item" data-id="${route.id}">
                <div class="route-info">
                    <span class="route-name">${route.nombre}</span>
                    <span class="route-meta">
                        ${route.distancia_total || '?'} km · ${route.tipo_terreno || 'llano'}
                    </span>
                </div>
                <div class="route-actions-btns">
                    <button class="route-action-btn load-btn" data-id="${route.id}" title="Cargar">📂</button>
                    <button class="route-action-btn delete-btn" data-id="${route.id}" title="Eliminar">🗑️</button>
                </div>
            </div>
        `).join('');

        // Event listeners
        list.querySelectorAll('.load-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                loadRoute(e.target.dataset.id);
            });
        });

        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                deleteRoute(e.target.dataset.id);
            });
        });

    } catch (e) {
        console.error('Load routes failed:', e);
        list.innerHTML = '<div class="empty-state error">Error al cargar rutas</div>';
    }
}

function loadRoute(routeId) {
    const route = savedRoutes.find(r => r.id === routeId);
    if (!route) return;

    // Limpiar waypoints actuales
    clearAllWaypoints();

    // Cargar nombre y opciones
    document.getElementById('route-name').value = route.nombre;
    document.getElementById('route-terrain').value = route.tipo_terreno || 'llano';
    document.getElementById('route-safety').value = route.estado_seguridad || 'seguro';

    // Agregar waypoints
    if (route.waypoints && route.waypoints.length > 0) {
        route.waypoints.forEach(wp => {
            addWaypoint(wp.lat, wp.lng);
        });

        // Centrar mapa en la ruta
        const bounds = new maplibregl.LngLatBounds();
        route.waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));
        map.fitBounds(bounds, { padding: 60 });
    }

    editingRouteId = routeId;
    window.kepler?.notify?.info('Ruta cargada para edición');
}

async function deleteRoute(routeId) {
    if (!confirm('¿Eliminar esta ruta planificada?')) return;

    try {
        await api.deletePlannedRoute(routeId);
        window.kepler?.notify?.success('Ruta eliminada');
        await loadSavedRoutes();
    } catch (e) {
        console.error('Delete failed:', e);
        window.kepler?.notify?.error('Error al eliminar ruta');
    }
}

function getDistance(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function getRiskIcon(nivel) {
    const icons = { 'bajo': '✓', 'medio': '⚠', 'alto': '⚠', 'critico': '✕' };
    return icons[nivel] || '?';
}

function getRiskLabel(nivel) {
    const labels = { 'bajo': 'Bajo', 'medio': 'Medio', 'alto': 'Alto', 'critico': 'Crítico' };
    return labels[nivel] || 'N/A';
}

function getAlertIcon(tipo) {
    const icons = {
        'critical': '🚨', 'danger': '⚠️', 'warning': '⚡',
        'settlement': '🏠', 'info': 'ℹ️'
    };
    return icons[tipo] || '•';
}

// ── Map Layer Functions ──

function setLayer(layerId) {
    if (!map) return;

    const mapContainer = document.getElementById('routes-map');

    // Remove all mode classes
    mapContainer?.classList.remove('map-mode-odradek');

    // Handle vector mode
    if (layerId === 'vector') {
        if (availableRegions.length > 0) {
            setVectorStyle();
        } else {
            console.log('No vector regions available, falling back to dark');
            setLayer('dark');
        }
        return;
    }

    // Handle raster modes
    const config = MAP_SOURCES[layerId];
    if (!config || !config.url) return;

    // Apply dark mode CSS filter
    if (layerId === 'dark') {
        mapContainer?.classList.add('map-mode-odradek');
    }

    // Set new tile source
    map.setStyle({
        version: 8,
        sources: {
            'base-source': {
                type: 'raster',
                tiles: [window.location.origin + config.url],
                tileSize: 256,
                attribution: config.attrib
            }
        },
        layers: [{
            id: 'base-layer',
            type: 'raster',
            source: 'base-source',
            minzoom: 0,
            maxzoom: 22
        }]
    });

    // Re-add route layers after style change
    map.once('styledata', () => {
        addRouteLayers();
    });

    // Update current layer state
    currentLayer = layerId;

    // Update active card in modal
    document.querySelectorAll('.layer-option-card').forEach(card => {
        card.classList.toggle('active', card.dataset.layer === layerId);
    });

    console.log(`[Routes] Map layer: ${layerId}`);
}

function addRouteLayers() {
    if (!map) return;

    // Route line
    if (!map.getSource('route-line')) {
        map.addSource('route-line', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
    }

    if (!map.getLayer('route-line-layer')) {
        map.addLayer({
            id: 'route-line-layer',
            type: 'line',
            source: 'route-line',
            paint: {
                'line-color': '#3FA8FF',
                'line-width': 3,
                'line-dasharray': [2, 2],
                'line-opacity': 0.8
            }
        });
    }

    // Corridor buffer
    if (!map.getSource('route-corridor')) {
        map.addSource('route-corridor', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }
        });
    }

    if (!map.getLayer('route-corridor-layer')) {
        map.addLayer({
            id: 'route-corridor-layer',
            type: 'fill',
            source: 'route-corridor',
            paint: {
                'fill-color': '#3FA8FF',
                'fill-opacity': 0.1,
                'fill-outline-color': '#3FA8FF'
            }
        });
    }

    // Restore existing route line data
    updateRouteLine();
}

function showLayerModal() {
    const modal = document.getElementById('routes-layer-modal');
    if (modal) modal.style.display = 'flex';
}

function hideLayerModal() {
    const modal = document.getElementById('routes-layer-modal');
    if (modal) modal.style.display = 'none';
}

function flyToMyLocation() {
    if (!map) return;

    const storedLat = sessionStorage.getItem('kepler_lat');
    const storedLng = sessionStorage.getItem('kepler_lng');

    if (storedLat && storedLng) {
        map.flyTo({
            center: [parseFloat(storedLng), parseFloat(storedLat)],
            zoom: 15
        });
    } else {
        // Try GPS
        navigator.geolocation?.getCurrentPosition(
            (pos) => {
                map.flyTo({
                    center: [pos.coords.longitude, pos.coords.latitude],
                    zoom: 15
                });
                sessionStorage.setItem('kepler_lat', pos.coords.latitude);
                sessionStorage.setItem('kepler_lng', pos.coords.longitude);
            },
            () => {
                window.kepler?.notify?.warn('No se pudo obtener ubicación');
            }
        );
    }
}