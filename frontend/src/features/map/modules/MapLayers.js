/**
 * MapLayers.js
 * Layer switching functionality - Toggle between map styles
 */

export class MapLayers {
    constructor(mapController) {
        this.controller = mapController;
        this.currentLayer = null;
        this.currentLayerName = 'dark';

        // Set default options for all layers to avoid COEP blocking
        const tileOptions = {
            crossOrigin: false, // CRITICAL: Treat as opaque resource to pass COEP check
            className: 'holo-tiles'
        };

        // Use relative path to leverage Vite Proxy (avoids Mixed Content / CORS issues)
        const PROXY_BASE = '/api/utils/tiles';

        // Define available layers
        this.layers = {
            dark: {
                name: 'Dark',
                icon: '🌙',
                url: `${PROXY_BASE}/{z}/{x}/{y}.png?source=osm`,
                attribution: '&copy; OpenStreetMap',
                filter: 'grayscale(100%) brightness(0.35) sepia(100%) hue-rotate(180deg) saturate(3) contrast(1.2)',
                options: { ...tileOptions, maxNativeZoom: 19, maxZoom: 22 }
            },
            street: {
                name: 'Street',
                icon: '🗺️',
                url: `${PROXY_BASE}/{z}/{x}/{y}.png?source=osm`,
                attribution: '&copy; OpenStreetMap contributors',
                filter: 'grayscale(0%) brightness(100%)',
                options: { ...tileOptions, maxNativeZoom: 19, maxZoom: 22 }
            },
            satellite: {
                name: 'Satellite',
                icon: '🛰️',
                url: `${PROXY_BASE}/{z}/{x}/{y}.png?source=esri`,
                attribution: '&copy; Esri',
                filter: 'brightness(1.1) contrast(1.1)',
                options: { ...tileOptions, maxNativeZoom: 17, maxZoom: 22 } // Scale after 17
            },
            terrain: {
                name: 'Terrain',
                icon: '⛰️',
                url: `${PROXY_BASE}/{z}/{x}/{y}.png?source=opentopo`,
                attribution: 'OpenTopoMap',
                filter: 'grayscale(30%) sepia(20%)',
                options: { ...tileOptions, maxNativeZoom: 19, maxZoom: 22 }
            }
        };
    }

    /**
     * Initialize with saved preference or default
     */
    init() {
        const saved = localStorage.getItem('kepler_map_layer') || 'dark';
        this.setLayer(saved, false);
    }

    /**
     * Set map layer by name
     */
    setLayer(layerName, animate = true) {
        const L = window.L;
        const layer = this.layers[layerName];

        if (!layer) {
            console.warn('Unknown layer:', layerName);
            return;
        }

        // Remove current layer
        if (this.currentLayer) {
            this.controller.map.removeLayer(this.currentLayer);
        }

        // Add new layer
        this.currentLayer = L.tileLayer(layer.url, {
            attribution: layer.attribution,
            maxZoom: 19,
            ...layer.options // Pass crossOrigin: false here
        }).addTo(this.controller.map);

        // Apply filter to tiles
        const tilePane = document.querySelector('.leaflet-tile-pane');
        if (tilePane) {
            tilePane.style.filter = layer.filter;
            if (animate) {
                tilePane.style.transition = 'filter 0.5s ease';
            }
        }

        // Save preference
        this.currentLayerName = layerName;
        localStorage.setItem('kepler_map_layer', layerName);

        // Update UI
        this.updateLayerUI();

        console.log(`🗺️ Map layer changed to: ${layer.name}`);
    }

    /**
     * Cycle to next layer
     */
    cycleLayer() {
        const names = Object.keys(this.layers);
        const currentIdx = names.indexOf(this.currentLayerName);
        const nextIdx = (currentIdx + 1) % names.length;
        this.setLayer(names[nextIdx]);
    }

    /**
     * Update layer switcher UI
     */
    updateLayerUI() {
        const btn = document.getElementById('map-btn-layers');
        if (btn) {
            const layer = this.layers[this.currentLayerName];
            btn.innerHTML = layer.icon;
            btn.title = `Capa: ${layer.name}`;
        }

        // Update dropdown if exists
        document.querySelectorAll('.layer-option').forEach(el => {
            el.classList.toggle('active', el.dataset.layer === this.currentLayerName);
        });
    }

    /**
     * Get available layers for menu rendering
     */
    getLayerOptions() {
        return Object.entries(this.layers).map(([key, layer]) => ({
            key,
            name: layer.name,
            icon: layer.icon,
            active: key === this.currentLayerName
        }));
    }
}
