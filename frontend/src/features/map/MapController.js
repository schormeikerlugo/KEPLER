/**
 * MapController.js
 * Manages MapLibre GL JS map instance and object rendering.
 * Migrated from Leaflet (Phase 4 Optimization).
 */

import { supabase } from '../../js/auth.js';
import { MapLocation } from './modules/MapLocation.js';
import { MapControls } from './modules/MapControls.js';
import { MapSearch } from './modules/MapSearch.js';
import { MapFilters } from './modules/MapFilters.js';

export class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.isInitialized = false;
        this.objects = []; // Store loaded objects
        this.markers = {}; // Map object ID to marker
        this.viewScope = 'mine'; // 'mine' or 'all'

        // Feature modules
        this.location = null;
        this.controls = null;
        this.searchMod = null;
        this.filtersMod = null;
        this.searchTerm = '';

        // Inject Styles
        this.injectStyles();

        // Base coords (Venezuela) [Lng, Lat] for MapLibre
        this.baseCoords = [-67.0000, 10.1833];
    }

    injectStyles() {
        const styles = [
            { id: 'map-controls-css', href: 'src/features/map/css/controls.css' },
            { id: 'map-responsive-css', href: 'src/features/map/css/responsive_fix.css' },
            { id: 'map-search-css', href: 'src/features/map/css/search_filters.css' }
        ];

        styles.forEach(s => {
            if (!document.getElementById(s.id)) {
                const link = document.createElement('link');
                link.id = s.id;
                link.rel = 'stylesheet';
                link.href = s.href;
                document.head.appendChild(link);
            }
        });
    }

    /**
     * Compatibility shim for Leaflet code calling invalidateSize
     */
    invalidateSize() {
        if (this.map) this.map.resize();
    }

    /**
     * Parse PostGIS WKB Hex to [Lat, Lng]
     * Note: Returns [Lat, Lng] consistent with backend, but MapLibre needs [Lng, Lat]
     */
    parseWKBPoint(wkbHex) {
        if (!wkbHex || typeof wkbHex !== 'string') return null;

        try {
            if (wkbHex.length < 50) return null;

            const headerLen = 18;
            const xHex = wkbHex.substring(headerLen, headerLen + 16);
            const yHex = wkbHex.substring(headerLen + 16, headerLen + 32);

            const hexToDouble = (hex) => {
                const bytes = [];
                for (let i = 0; i < 16; i += 2) {
                    bytes.push(parseInt(hex.substring(i, i + 2), 16));
                }
                const buffer = new ArrayBuffer(8);
                const view = new DataView(buffer);
                bytes.forEach((b, i) => view.setUint8(i, b));
                return view.getFloat64(0, true);
            };

            const lon = hexToDouble(xHex);
            const lat = hexToDouble(yHex);

            if (isNaN(lat) || isNaN(lon)) return null;
            return [lat, lon];
        } catch (e) {
            console.warn('Failed to parse WKB:', e);
            return null;
        }
    }

    getTypeIcon(tipo) {
        const icons = {
            'tech': '💻',
            'marker': '📍',
            'rock': '🪨',
            'crater': '🕳️',
            'artifact': '🏺',
            'structure': '🏛️',
            'flora': '🌿',
            'unknown': '❓'
        };
        return icons[tipo?.toLowerCase()] || '📦';
    }

    getTypeColor(tipo) {
        const colors = {
            'tech': '#00f7ff',      // Cyan
            'marker': '#ff0055',    // Red
            'rock': '#aaaaaa',      // Grey
            'crater': '#ffaa00',    // Orange
            'artifact': '#bd00ff',  // Purple
            'structure': '#00ffaa', // Mint
            'flora': '#39ff14',     // Neon Green
            'unknown': '#ffffff'    // White
        };
        return colors[tipo?.toLowerCase()] || '#ffffff';
    }

    /**
     * Initialize MapLibre GL
     */
    async init() {
        if (this.isInitialized) return;

        if (typeof maplibregl === 'undefined') {
            console.error('MapLibre GL not loaded');
            return;
        }

        console.log('🗺️ Initializing MapLibre Engine...');

        // 1. Create Map Instance
        this.map = new maplibregl.Map({
            container: this.containerId,
            style: {
                version: 8,
                sources: {
                    'osm': {
                        type: 'raster',
                        tiles: [window.location.origin + '/api/utils/tiles/{z}/{x}/{y}.png?source=osm'],
                        tileSize: 256,
                        attribution: 'OpenStreetMap'
                    }
                },
                layers: [
                    {
                        id: 'simple-tiles',
                        type: 'raster',
                        source: 'osm',
                        minzoom: 0,
                        maxzoom: 22
                    }
                ]
            },
            center: this.baseCoords,
            zoom: 13,
            attributionControl: false
        });

        // 2. Add Controls
        this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Compatibility for MapControls
        this.layers = {
            setLayer: (id) => this.setLayer(id),
            cycleLayer: () => { /* implement if needed */ }
        };

        // 3. Wait for load
        this.map.on('load', async () => {
            console.log('✅ Map Engine Loaded');

            // Set Default Theme: Dark (Odradek)
            this.setLayer('dark');

            // Initialize Modules
            this.location = new MapLocation(this);
            this.controls = new MapControls(this);
            this.controls.createControls();

            // Search & Filters
            this.searchMod = new MapSearch(this);
            const searchContainer = this.searchMod.createUI();
            this.filtersMod = new MapFilters(this);
            this.filtersMod.createUI(searchContainer);

            // Object Panel
            this.createObjectPanel();

            this.isInitialized = true;

            // Load Objects
            await this.loadObjects();
        });
    }

    async loadObjects() {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;

            const url = this.viewScope === 'all'
                ? '/api/objects/map?scope=all'
                : '/api/objects/map?scope=mine';

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.objects) {
                this.objects = data.objects;
                // Update filters options
                this.filtersMod.updateTypeOptions(this.objects);
                // Apply filters (which calls renderMarkers)
                this.applyFilters();
            }
        } catch (error) {
            console.error('Error loading objects:', error);
        }
    }

    // --- Search & Filter Handlers ---

    handleSearch(term) {
        this.searchTerm = term.toLowerCase();
        this.applyFilters();
    }

    handleFilterChange() {
        this.applyFilters();
    }

    applyFilters() {
        const filters = this.filtersMod.getFilters();

        const filtered = this.objects.filter(obj => {
            // 1. Text Search
            if (this.searchTerm) {
                const matchName = obj.nombre?.toLowerCase().includes(this.searchTerm);
                const matchType = obj.tipo?.toLowerCase().includes(this.searchTerm);
                if (!matchName && !matchType) return false;
            }

            // 2. Type Filter
            if (filters.types.length > 0) {
                if (!filters.types.includes(obj.tipo)) return false;
            }

            // 3. Confidence Filter
            // filters.minConfidence is 0-100 from MapFilters.js
            const confidence = (obj.metadata?.confidence || 0) * 100;
            if (confidence < filters.minConfidence) return false;

            return true;
        });

        this.renderMarkers(filtered);
        this.updateObjectPanel(filtered);
    }

    /**
     * Render Markers on the Map
     */
    renderMarkers(objectsToRender) {
        // Clear existing markers
        Object.values(this.markers).forEach(marker => marker.remove());
        this.markers = {};

        objectsToRender.forEach(obj => {
            const coords = this.parseWKBPoint(obj.posicion);
            if (!coords) return; // [Lat, Lng]

            // Convert to [Lng, Lat] for MapLibre
            const lngLat = [coords[1], coords[0]];

            // Custom HTML Marker using the same CSS classes as before
            const el = document.createElement('div');
            el.className = 'custom-marker';

            const color = this.getTypeColor(obj.tipo);
            const delay = Math.random() * 3; // Staggered pulsing

            el.style.setProperty('--marker-color', color);

            el.innerHTML = `
                <div class="marker-pin">${this.getTypeIcon(obj.tipo)}</div>
                <div class="marker-pulse" style="animation-delay: -${delay.toFixed(2)}s"></div>
            `;

            // Click Handler
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.flyToObject(obj.id);
            });

            // Create Marker
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat(lngLat)
                .addTo(this.map);

            // Create Popup Content DOM
            const popupNode = document.createElement('div');
            popupNode.className = 'popup-content';

            // 1. Image (if exists)
            const imgSrc = obj.metadata?.image_base64 || obj.imagen;
            if (imgSrc && imgSrc.length > 50) {
                const img = document.createElement('img');
                img.src = imgSrc;
                img.className = 'popup-image';
                img.style.width = '100%';
                img.style.borderRadius = '4px';
                img.style.marginBottom = '8px';
                img.style.height = 'auto';
                img.style.maxHeight = '250px';
                img.style.objectFit = 'contain';
                img.style.backgroundColor = 'rgba(0,0,0,0.3)';
                popupNode.appendChild(img);
            }

            // 2. Info
            const info = document.createElement('div');
            const confVal = obj.metadata?.confidence ? (obj.metadata.confidence * 100).toFixed(0) : '0';

            info.innerHTML = `
                <h3>${obj.nombre || 'Sin nombre'}</h3>
                <div>
                    <span class="popup-type-tag" style="background:rgba(63,168,255,0.2); color:#4db8ff; padding:2px 6px; border-radius:4px; font-size:0.7rem; text-transform:uppercase;">
                        ${obj.tipo || 'DESCONOCIDO'}
                    </span>
                </div>
                <p style="margin-top:8px;">${obj.descripcion || 'Sin descripción'}</p>
                <div class="popup-meta" style="margin-top:5px; font-size:0.8rem; color:#888;">
                    <span>Confianza: ${confVal}%</span>
                </div>
            `;
            popupNode.appendChild(info);

            // 3. Owner (if applicable)
            if (obj.owner_id && !obj.is_mine) {
                const owner = document.createElement('div');
                owner.className = 'popup-owner';
                owner.style.marginTop = '10px';
                owner.style.paddingTop = '8px';
                owner.style.borderTop = '1px solid rgba(255,255,255,0.1)';
                owner.style.display = 'flex';
                owner.style.alignItems = 'center';
                owner.style.gap = '8px';
                owner.style.cursor = 'pointer';

                owner.innerHTML = `
                    <img src="${obj.owner_avatar || 'src/assets/icons/default-avatar.svg'}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                    <span style="color:var(--color-primary); font-size:0.85rem;">@${obj.owner_name || 'Explorador'}</span>
                `;

                owner.onclick = (e) => {
                    e.stopPropagation();
                    this.showProfileModal(obj.owner_id);
                };

                popupNode.appendChild(owner);
            }

            const popup = new maplibregl.Popup({ offset: 25, className: 'custom-popup', maxWidth: '300px' })
                .setDOMContent(popupNode);

            marker.setPopup(popup);

            this.markers[obj.id] = marker;
        });
    }

    flyToObject(objectId) {
        const marker = this.markers[objectId];
        if (!marker) return;

        const lngLat = marker.getLngLat();

        this.map.flyTo({
            center: lngLat,
            zoom: 17,
            pitch: 60,
            bearing: -20,
            speed: 1.2,
            curve: 1.4
        });

        marker.togglePopup();
    }

    // --- Object Panel ---
    createObjectPanel() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const panel = document.createElement('div');
        panel.className = 'map-object-panel';
        panel.id = 'map-object-panel';
        panel.innerHTML = `
            <div class="map-object-panel-header">
                <h3>📍 Objetos</h3>
                <span class="count" id="object-count">0</span>
            </div>
            <div class="map-scope-toggle">
                <button class="scope-btn active" data-scope="mine">👤 Míos</button>
                <button class="scope-btn" data-scope="all">🌍 Todos</button>
            </div>
            <div class="map-object-list" id="map-object-list">
                <p style="color:#666; text-align:center; padding:20px;">Cargando...</p>
            </div>
        `;

        container.appendChild(panel);

        // Prevent map interaction
        ['mousedown', 'touchstart', 'click', 'scroll', 'wheel'].forEach(evt => {
            panel.addEventListener(evt, (e) => e.stopPropagation());
        });

        // Bind toggle events
        panel.querySelectorAll('.scope-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setScope(btn.dataset.scope));
        });
    }

    updateObjectPanel(filteredList = null) {
        const listEl = document.getElementById('map-object-list');
        const countEl = document.getElementById('object-count');
        if (!listEl) return;

        const objectsToShow = filteredList || this.objects;
        countEl.textContent = objectsToShow.length;

        if (objectsToShow.length === 0) {
            listEl.innerHTML = '<p style="color:#666; text-align:center; padding:20px;">Sin objetos</p>';
            return;
        }

        listEl.innerHTML = objectsToShow.map(obj => {
            const confidence = obj.metadata?.confidence || 0;
            return `
                <div class="map-object-item" data-id="${obj.id}">
                    <div class="map-object-icon">${this.getTypeIcon(obj.tipo)}</div>
                    <div class="map-object-info">
                        <div class="name">${obj.nombre || 'Sin nombre'}</div>
                        <div class="type">${obj.tipo || 'Desconocido'}</div>
                    </div>
                    <div class="map-object-confidence">${(confidence * 100).toFixed(0)}%</div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.map-object-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.flyToObject(id);
                listEl.querySelectorAll('.map-object-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    async setScope(newScope) {
        if (this.viewScope === newScope) return;
        this.viewScope = newScope;
        document.querySelectorAll('.scope-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scope === newScope);
        });
        await this.loadObjects();
    }

    // --- Profile Modal ---
    async showProfileModal(userId) {
        // Remove existing
        const existing = document.querySelector('.user-profile-modal');
        if (existing) existing.remove();

        // Show loading state
        const modal = document.createElement('div');
        modal.className = 'user-profile-modal active';
        modal.style.zIndex = '9999'; // Ensure top
        modal.innerHTML = `
            <div class="profile-modal-content">
                <button class="profile-modal-close">&times;</button>
                <div style="text-align:center; padding:20px;">Cargando perfil...</div>
            </div>
        `;
        document.body.appendChild(modal);

        // Fetch Data
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            const userData = data || { username: 'Desconocido', bio: 'No encontrado' };

            // Update Content
            modal.innerHTML = `
                <div class="profile-modal-content">
                    <button class="profile-modal-close">&times;</button>
                    <div class="profile-modal-header">
                        <img src="${userData.avatar_url || 'src/assets/icons/default-avatar.svg'}" class="profile-modal-avatar">
                        <div class="profile-modal-name">@${userData.username || 'Usuario'}</div>
                        <div class="profile-modal-since">Nivel ${userData.level || 1} • ${userData.faction || 'Neutro'}</div>
                    </div>
                    <div class="profile-modal-bio">${userData.bio || 'Sin biografía disponible.'}</div>
                    <div class="profile-modal-stats">
                        <div class="stat-item">
                            <div class="stat-val">${userData.objects_count || 0}</div>
                            <div class="stat-label">Hallazgos</div>
                        </div>
                         <div class="stat-item">
                            <div class="stat-val">${userData.reputation || 0}</div>
                            <div class="stat-label">Reputación</div>
                        </div>
                    </div>
                </div>
            `;

            // Re-bind events
            const closeBtn = modal.querySelector('.profile-modal-close');
            if (closeBtn) closeBtn.onclick = () => modal.remove();

        } catch (e) {
            console.error(e);
            modal.innerHTML = `
                <div class="profile-modal-content">
                    <p style="color:red; text-align:center;">Error al cargar perfil</p>
                    <button class="profile-modal-close">&times;</button>
                </div>
            `;
            const closeBtn = modal.querySelector('.profile-modal-close');
            if (closeBtn) closeBtn.onclick = () => modal.remove();
        }

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    /**
     * Switch Base Layer
     * @param {string} layerId - 'street', 'dark', 'satellite', 'terrain'
     */
    setLayer(layerId) {
        console.log('Switching layer to:', layerId);

        const sources = {
            'street': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=osm', attrib: 'OSM' },
            'dark': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=osm', attrib: 'OSM' }, // Use OSM base for inversion
            'satellite': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=esri', attrib: 'ESRI World Imagery' },
            'terrain': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=opentopo', attrib: 'OpenTopoMap' }
        };

        const config = sources[layerId] || sources['street'];
        const mapContainer = document.getElementById(this.containerId);

        // Toggle Odradek Mode (Holographic Blue)
        if (layerId === 'dark') {
            mapContainer?.classList.add('map-mode-odradek');
        } else {
            mapContainer?.classList.remove('map-mode-odradek');
        }

        let paint = {};
        // For Odradek, we utilize CSS filters on the canvas, so we keep the raster raw.
        // If we wanted pure maplibre dark mode without CSS:
        /* if (layerId === 'dark') { paint = { ... } } */

        this.map.setStyle({
            version: 8,
            sources: {
                'base-source': {
                    type: 'raster',
                    tiles: [window.location.origin + config.url],
                    tileSize: 256,
                    attribution: config.attrib
                }
            },
            layers: [
                {
                    id: 'base-layer',
                    type: 'raster',
                    source: 'base-source',
                    minzoom: 0,
                    maxzoom: 22,
                    paint: paint
                }
            ]
        });
    }
}
