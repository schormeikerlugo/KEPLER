/**
 * KEPLER Mobile - Odradek Vector Style
 * MapLibre style matching web/desktop version
 * 
 * Features:
 * - Dark background (#0a0f14)
 * - Cyan glow on highways (#00f7ff)
 * - Building outlines with subtle glow
 * - Water with luminous borders
 */


/**
 * Protomaps CDN for vector tiles
 * Uses PMTiles format for efficient tile delivery
 */
export const VECTOR_TILE_URL = 'https://api.protomaps.com/tiles/v3/{z}/{x}/{y}.mvt?key=1003762824b9687f';

/**
 * Odradek Vector Style - Full specification
 */
export const odradekStyle = {
    version: 8,
    name: 'KEPLER Odradek',
    sources: {
        protomaps: {
            type: 'vector',
            tiles: [VECTOR_TILE_URL],
            maxzoom: 15,
            attribution: '© OpenStreetMap',
        },
    },
    glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
    layers: [
        // Background
        {
            id: 'background',
            type: 'background',
            paint: {
                'background-color': '#0a0f14',
            },
        },
        // Earth/Land
        {
            id: 'earth',
            type: 'fill',
            source: 'protomaps',
            'source-layer': 'earth',
            paint: {
                'fill-color': '#0d1218',
            },
        },
        // Parks and forests
        {
            id: 'landuse-park',
            type: 'fill',
            source: 'protomaps',
            'source-layer': 'landuse',
            filter: ['any',
                ['==', 'pmap:kind', 'park'],
                ['==', 'pmap:kind', 'forest'],
                ['==', 'pmap:kind', 'nature_reserve']
            ],
            paint: {
                'fill-color': '#0a1a12',
                'fill-opacity': 0.6,
            },
        },
        // Water bodies
        {
            id: 'water',
            type: 'fill',
            source: 'protomaps',
            'source-layer': 'water',
            paint: {
                'fill-color': '#0a1520',
            },
        },
        // Water outline (glow effect)
        {
            id: 'water-outline',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'water',
            paint: {
                'line-color': '#00f7ff',
                'line-width': 0.5,
                'line-opacity': 0.3,
            },
        },
        // Minor roads
        {
            id: 'roads-minor',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'roads',
            filter: ['any',
                ['==', 'pmap:kind', 'minor_road'],
                ['==', 'pmap:kind', 'other'],
                ['==', 'pmap:kind', 'path']
            ],
            paint: {
                'line-color': '#1a2535',
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 3],
                'line-opacity': 0.6,
            },
        },
        // Medium roads
        {
            id: 'roads-medium',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'roads',
            filter: ['==', 'pmap:kind', 'medium_road'],
            paint: {
                'line-color': '#2a3a4a',
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 18, 6],
            },
        },
        // Major roads
        {
            id: 'roads-major',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'roads',
            filter: ['==', 'pmap:kind', 'major_road'],
            paint: {
                'line-color': '#3a5a7a',
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 18, 8],
            },
        },
        // Highway glow (background)
        {
            id: 'roads-highway-glow',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'roads',
            filter: ['==', 'pmap:kind', 'highway'],
            paint: {
                'line-color': '#00f7ff',
                'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 18, 24],
                'line-blur': 4,
                'line-opacity': 0.25,
            },
        },
        // Highway main
        {
            id: 'roads-highway',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'roads',
            filter: ['==', 'pmap:kind', 'highway'],
            paint: {
                'line-color': '#00f7ff',
                'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 18, 10],
                'line-opacity': 0.9,
            },
        },
        // Buildings
        {
            id: 'buildings',
            type: 'fill',
            source: 'protomaps',
            'source-layer': 'buildings',
            minzoom: 13,
            paint: {
                'fill-color': '#1a2535',
                'fill-opacity': 0.7,
            },
        },
        // Building outlines (subtle glow)
        {
            id: 'buildings-outline',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'buildings',
            minzoom: 14,
            paint: {
                'line-color': '#00f7ff',
                'line-width': 0.3,
                'line-opacity': 0.4,
            },
        },
        // City labels
        {
            id: 'places-city',
            type: 'symbol',
            source: 'protomaps',
            'source-layer': 'places',
            filter: ['any',
                ['==', 'pmap:kind', 'city'],
                ['==', 'pmap:kind', 'town']
            ],
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['Noto Sans Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 14, 18],
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.1,
            },
            paint: {
                'text-color': '#00f7ff',
                'text-halo-color': '#0a0f14',
                'text-halo-width': 2,
                'text-opacity': 0.9,
            },
        },
        // Highway labels
        {
            id: 'road-labels-highway',
            type: 'symbol',
            source: 'protomaps',
            'source-layer': 'roads',
            filter: ['all',
                ['==', 'pmap:kind', 'highway'],
                ['has', 'name']
            ],
            minzoom: 10,
            layout: {
                'symbol-placement': 'line',
                'text-field': ['get', 'name'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
                'text-max-angle': 30,
            },
            paint: {
                'text-color': '#00f7ff',
                'text-halo-color': '#0a0f14',
                'text-halo-width': 2,
            },
        },
    ],
};

/**
 * Alternative raster tile sources for fallback
 */
export const RASTER_SOURCES = {
    dark: {
        tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
        tileSize: 256,
    },
    satellite: {
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
    },
    street: {
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
    },
};

export default odradekStyle;
