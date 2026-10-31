/**
 * Map Menu Items Configuration
 * Menu options for the map tools drawer
 */

export interface MenuItem {
    id: string;
    icon?: string;
    label?: string;
    desc?: string;
    type?: 'divider';
    isExit?: boolean;
}

export const MENU_ITEMS: MenuItem[] = [
    { id: 'objects', icon: '📦', label: 'Objetos', desc: 'Ver hallazgos' },
    { id: 'search', icon: '🔍', label: 'Buscar', desc: 'Buscar en mapa' },
    { id: 'filters', icon: '📊', label: 'Filtros', desc: 'Filtrar objetos' },
    { id: 'divider1', type: 'divider' },
    { id: 'location', icon: '🎯', label: 'Mi ubicación', desc: 'Centrar en GPS' },
    { id: 'layers', icon: '🗺️', label: 'Cambiar mapa', desc: 'Estilo de tiles' },
    { id: 'refresh', icon: '🔄', label: 'Recargar', desc: 'Actualizar datos' },
    { id: 'divider2', type: 'divider' },
    { id: 'exit', icon: '🔙', label: 'Volver', desc: 'Al Dashboard', isExit: true },
];

export type MenuActionId =
    | 'objects'
    | 'search'
    | 'filters'
    | 'location'
    | 'layers'
    | 'refresh'
    | 'exit';
