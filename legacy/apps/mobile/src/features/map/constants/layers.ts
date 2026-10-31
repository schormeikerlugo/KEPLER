/**
 * Map Layers Configuration
 * Tile sources for the Leaflet WebView map
 */

export interface MapLayer {
    id: string;
    name: string;
    icon: string;
    desc: string;
    url: string;
}

export const LAYERS: MapLayer[] = [
    {
        id: 'dark',
        name: 'Odradek',
        icon: '🌙',
        desc: 'Modo oscuro',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    },
    {
        id: 'satellite',
        name: 'Satélite',
        icon: '🛰️',
        desc: 'Imágenes',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    },
    {
        id: 'street',
        name: 'Street',
        icon: '🛣️',
        desc: 'Calles',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    },
    {
        id: 'topo',
        name: 'Topo',
        icon: '⛰️',
        desc: 'Topográfico',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
    },
];

export const DEFAULT_LAYER_ID = 'dark';

export const getLayerById = (id: string): MapLayer => {
    return LAYERS.find(l => l.id === id) || LAYERS[0];
};
