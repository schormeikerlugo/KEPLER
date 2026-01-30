/**
 * Dashboard Menu Items Configuration
 * Menu options for the dashboard drawer
 */

export interface DashboardMenuItem {
    id: string;
    icon: string;
    label: string;
    desc: string;
    screen?: string;
    type?: 'divider';
    isExit?: boolean;
}

export const MENU_ITEMS: DashboardMenuItem[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', desc: 'Panel principal', screen: 'Dashboard' },
    { id: 'missions', icon: '🚀', label: 'Misiones', desc: 'Gestionar misiones', screen: 'Missions' },
    { id: 'divider1', icon: '', label: '', desc: '', type: 'divider' },
    { id: 'ar', icon: '📷', label: 'Cámara AR', desc: 'Escanear objetos', screen: 'ARCamera' },
    { id: 'map', icon: '🗺️', label: 'Mapa', desc: 'Explorar zona', screen: 'Map' },
    { id: 'archives', icon: '📁', label: 'Archivos', desc: 'Galería de hallazgos', screen: 'Archives' },
    { id: 'divider2', icon: '', label: '', desc: '', type: 'divider' },
    { id: 'profile', icon: '👤', label: 'Perfil', desc: 'Mi cuenta', screen: 'Profile' },
    { id: 'settings', icon: '⚙️', label: 'Ajustes', desc: 'Configuración', screen: 'Settings' },
];

export type DashboardMenuActionId =
    | 'dashboard'
    | 'missions'
    | 'ar'
    | 'map'
    | 'archives'
    | 'profile'
    | 'settings';
