/**
 * MapLayers.js
 * Handles map layer switching between raster and vector tiles.
 * Supports: Street, Dark (Odradek), Satellite, Terrain, Vector (PMTiles).
 */

export class MapLayers {
    constructor(controller) {
        this.controller = controller;
        this.map = controller.map;
        this.renderMode = 'raster';
        this.availableRegions = [];
    }

    /**
     * Switch Base Layer
     * @param {string} layerId - 'street', 'dark', 'satellite', 'terrain', 'vector'
     */
    setLayer(layerId) {
        console.log('Switching layer to:', layerId);
        const mapContainer = document.getElementById(this.controller.containerId);

        // Remove all mode classes
        mapContainer?.classList.remove('map-mode-odradek');

        // Special case: Vector mode uses PMTiles
        if (layerId === 'vector' && this.availableRegions.length > 0) {
            this.setVectorStyle();
            return;
        }

        // Raster sources configuration
        const sources = {
            'street': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=osm', attrib: 'OSM' },
            'dark': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=osm', attrib: 'OSM' },
            'satellite': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=esri', attrib: 'ESRI World Imagery' },
            'terrain': { url: '/api/utils/tiles/{z}/{x}/{y}.png?source=opentopo', attrib: 'OpenTopoMap' }
        };

        const config = sources[layerId] || sources['street'];

        // Toggle Odradek Mode (Holographic Blue via CSS)
        if (layerId === 'dark') {
            mapContainer?.classList.add('map-mode-odradek');
        }

        this.renderMode = 'raster';

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
                    maxzoom: 22
                }
            ]
        });
    }

    /**
     * Set Vector Style (Odradek with PMTiles)
     */
    async setVectorStyle() {
        console.log('🎨 Loading Vector Style (Odradek)...');
        this.renderMode = 'vector';

        try {
            const response = await fetch('/src/features/map/styles/odradek-vector.json');
            const style = await response.json();

            // Update the PMTiles source URL to use available region
            if (this.availableRegions.length > 0) {
                const region = this.availableRegions[0].id;
                style.sources.protomaps.url = `pmtiles://${window.location.origin}/api/utils/pmtiles/${region}.pmtiles`;
            }

            this.map.setStyle(style);
            console.log('✅ Vector Style Applied');
        } catch (error) {
            console.error('Failed to load vector style:', error);
            this.setLayer('dark');
        }
    }

    /**
     * Check for available PMTiles regions
     */
    async checkAvailableRegions() {
        try {
            const response = await fetch('/api/utils/pmtiles/available');
            const data = await response.json();
            this.availableRegions = data.regions || [];
            console.log('📦 Available PMTiles regions:', this.availableRegions);
            return this.availableRegions;
        } catch (error) {
            console.log('No PMTiles regions available');
            this.availableRegions = [];
            return [];
        }
    }

    /**
     * Toggle between Raster and Vector modes
     */
    async toggleRenderMode() {
        if (this.renderMode === 'raster' && this.availableRegions.length > 0) {
            await this.setVectorStyle();
        } else {
            this.setLayer('dark');
        }
    }

    /**
     * Cycle through available layers
     */
    cycleLayer() {
        const layers = ['dark', 'street', 'satellite', 'terrain'];
        if (this.availableRegions.length > 0) {
            layers.unshift('vector');
        }

        // Find current and move to next
        const currentIdx = layers.indexOf(this.renderMode === 'vector' ? 'vector' : 'dark');
        const nextIdx = (currentIdx + 1) % layers.length;
        this.setLayer(layers[nextIdx]);
    }
}
