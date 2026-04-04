/**
 * MapController.js
 * Manages MapLibre GL JS map instance and object rendering.
 * Supports both Raster and Vector tiles (PMTiles).
 * Supports multiple modes: explore (default), routes (waypoints).
 */

import { supabase } from '../../js/auth.js';
import { MapLocation } from './modules/MapLocation.js';
import { MapControls } from './modules/MapControls.js';
import { MapSearch } from './modules/MapSearch.js';
import { MapFilters } from './modules/MapFilters.js';
import { MapLayers } from './modules/MapLayers.js';
import { MapMarkers } from './modules/MapMarkers.js';
import { MapObjectPanel } from './modules/MapObjectPanel.js';
import { MapWaypoints } from './modules/MapWaypoints.js';
import { Protocol } from 'pmtiles';

export class MapController {
    constructor(containerId, isTactical = false) {
        this.containerId = containerId;
        this.isTactical = isTactical;
        this.map = null;
        this.isInitialized = false;
        this.objects = [];
        this.viewScope = 'mine';
        this.mode = 'explore'; // 'explore' | 'routes'

        // Feature modules
        this.location = null;
        this.controls = null;
        this.layersMod = null;
        this.markersMod = null;
        this.panelMod = null;
        this.searchMod = null;
        this.filtersMod = null;
        this.waypointsMod = null;
        this.searchTerm = '';

        // Inject Styles
        this.injectStyles();

        // Base coords (Venezuela) [Lng, Lat] for MapLibre
        this.baseCoords = [-67.0000, 10.1833];

        // Register PMTiles protocol
        this.pmtilesProtocol = new Protocol();
        maplibregl.addProtocol('pmtiles', this.pmtilesProtocol.tile);
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

        // 1. Determine initial style BEFORE creating the map
        //    Check for vector regions first to avoid raster→vector flash
        let initialStyle = null;
        try {
            const regionsRes = await fetch('/api/utils/pmtiles/available');
            const regionsData = await regionsRes.json();
            const regions = regionsData.regions || [];

            if (regions.length > 0) {
                const styleRes = await fetch('/src/features/map/styles/odradek-vector.json');
                initialStyle = await styleRes.json();
                const region = regions[0].id;
                initialStyle.sources.protomaps.url = `pmtiles://${window.location.origin}/api/utils/pmtiles/${region}.pmtiles`;
                this._preloadedRegions = regions;
                console.log('🎨 Vector style pre-loaded');
            }
        } catch (e) {
            console.log('📍 Vector pre-check failed, using raster fallback');
        }

        // Fallback: raster OSM style
        if (!initialStyle) {
            initialStyle = {
                version: 8,
                sources: {
                    'osm': {
                        type: 'raster',
                        tiles: [window.location.origin + '/api/utils/tiles/{z}/{x}/{y}.png?source=osm'],
                        tileSize: 256,
                        attribution: 'OpenStreetMap'
                    }
                },
                layers: [{
                    id: 'simple-tiles',
                    type: 'raster',
                    source: 'osm',
                    minzoom: 0,
                    maxzoom: 22
                }]
            };
        }

        // 2. Create Map Instance with the correct style from the start
        this.map = new maplibregl.Map({
            container: this.containerId,
            style: initialStyle,
            center: this.baseCoords,
            zoom: 13,
            attributionControl: false
        });

        // 3. Add Controls
        this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Initialize Layers Module
        this.layersMod = new MapLayers(this);

        // Sync pre-loaded regions into layers module
        if (this._preloadedRegions) {
            this.layersMod.availableRegions = this._preloadedRegions;
            this.layersMod.renderMode = 'vector';
        }

        // Compatibility for MapControls (legacy API)
        this.layers = {
            setLayer: (id) => this.layersMod.setLayer(id),
            cycleLayer: () => this.layersMod.cycleLayer()
        };

        // 4. Wait for load
        this.map.on('load', async () => {
            console.log('✅ Map Engine Loaded');

            // If regions weren't pre-loaded, check now and apply
            if (!this._preloadedRegions) {
                await this.layersMod.checkAvailableRegions();
                if (this.layersMod.availableRegions.length > 0) {
                    await this.layersMod.setVectorStyle();
                } else {
                    this.layersMod.setLayer('dark');
                }
            }

            // Initialize Core Modules
            this.location = new MapLocation(this);

            // Initialize Markers Module (clustering)
            this.markersMod = new MapMarkers(this);

            // Initialize Waypoints Module
            this.waypointsMod = new MapWaypoints(this);

            // Only load UI and Objects if it's the main map
            if (!this.isTactical) {
                this.controls = new MapControls(this);
                this.controls.createControls();

                // Initialize Object Panel
                this.panelMod = new MapObjectPanel(this);
                this.panelMod.create();

                // Search & Filters
                this.searchMod = new MapSearch(this);
                const searchContainer = this.searchMod.createUI();
                this.filtersMod = new MapFilters(this);
                this.filtersMod.createUI(searchContainer);
            }

            this.isInitialized = true;

            // Load Objects only for main map
            if (!this.isTactical) {
                await this.loadObjects();
                this.bindGeotrackListener();
            }
        });
    }

    /**
     * Set map mode: 'explore' | 'routes'
     */
    setMode(newMode) {
        if (this.mode === newMode) return;
        this.mode = newMode;

        if (newMode === 'routes') {
            // Disable object markers, enable waypoints
            this.waypointsMod?.enable();
            this.map.getCanvas().style.cursor = 'crosshair';
        } else {
            // Re-enable object markers, disable waypoints
            this.waypointsMod?.disable();
            this.map.getCanvas().style.cursor = '';
        }

        // Emit mode change event
        window.dispatchEvent(new CustomEvent('kepler:map-mode-changed', {
            detail: { mode: newMode }
        }));

        console.log(`[Map] Mode: ${newMode}`);
    }

    /**
     * Binds a global event listener to draw a Mission's Geotrack on the map
     */
    bindGeotrackListener() {
        window.addEventListener('kepler:show_geotrack_on_map', (e) => {
            if (!this.map || !this.isInitialized) return;
            let geojson = e.detail?.geotrack;
            if (!geojson) return;

            // Auto-convert raw arrays [{lat, lng, t}] into GeoJSON FeatureCollection
            if (Array.isArray(geojson)) {
                if(geojson.length === 0) return;
                geojson = {
                    type: "FeatureCollection",
                    features: [{
                        type: "Feature",
                        properties: { name: "Mission Trail" },
                        geometry: {
                            type: "LineString",
                            coordinates: geojson.map(pt => [pt.lng, pt.lat])
                        }
                    }]
                };
            } else if (!geojson.features || geojson.features.length === 0) {
                return;
            }

            console.log('🗺️ Drawing Geotrack on map...', geojson);

            // 1. Remove previous geotrack if exists
            if (this.map.getSource('mission-geotrack-source')) {
                if (this.map.getLayer('mission-geotrack-layer')) {
                    this.map.removeLayer('mission-geotrack-layer');
                }
                if (this.map.getLayer('mission-geotrack-points')) {
                    this.map.removeLayer('mission-geotrack-points');
                }
                this.map.removeSource('mission-geotrack-source');
            }

            // 2. Add as new source
            this.map.addSource('mission-geotrack-source', {
                type: 'geojson',
                data: geojson
            });

            // 3. Add glowing line layer
            this.map.addLayer({
                id: 'mission-geotrack-layer',
                type: 'line',
                source: 'mission-geotrack-source',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ff4444',
                    'line-width': 4,
                    'line-opacity': 0.8,
                    'line-dasharray': [2, 2] // Dashed tactical line
                }
            });

            // 4. Add points layer for start/end nodes or all GPS ticks
            this.map.addLayer({
                id: 'mission-geotrack-points',
                type: 'circle',
                source: 'mission-geotrack-source',
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#000000',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ff4444'
                }
            });

            // 5. Fit bounds to the route
            try {
                // Get all coordinates from all features
                const coords = [];
                geojson.features.forEach(f => {
                    if (f.geometry && f.geometry.coordinates) {
                        if (f.geometry.type === 'LineString') {
                            coords.push(...f.geometry.coordinates);
                        } else if (f.geometry.type === 'Point') {
                            coords.push(f.geometry.coordinates);
                        }
                    }
                });

                if (coords.length > 0) {
                    // Create a bounds object
                    const bounds = coords.reduce(function(bounds, coord) {
                        return bounds.extend(coord);
                    }, new maplibregl.LngLatBounds(coords[0], coords[0]));

                    this.map.fitBounds(bounds, {
                        padding: 50,
                        duration: 1500,
                        maxZoom: 18
                    });
                }
            } catch (err) {
                console.warn('Failed to fit bounds to geotrack:', err);
            }
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

        // Delegate to modules
        this.markersMod?.renderMarkers(filtered);
        this.panelMod?.update(filtered);
    }

    /**
     * Fly to object (delegate to markers module)
     */
    flyToObject(objectId) {
        this.markersMod?.flyToObject(objectId);
    }

    /**
     * Get type icon (delegate to markers module)
     */
    getTypeIcon(tipo) {
        return this.markersMod?.getTypeIcon(tipo) || '📍';
    }

    async setScope(newScope) {
        if (this.viewScope === newScope) return;
        this.viewScope = newScope;
        this.panelMod?.setActiveScope(newScope);
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
}
