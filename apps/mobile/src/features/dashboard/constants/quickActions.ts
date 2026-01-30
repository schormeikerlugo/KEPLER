/**
 * Dashboard Quick Actions Configuration
 * Quick action buttons for the dashboard header
 */

export interface QuickAction {
    id: string;
    icon: string;
    label: string;
    screen?: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
    { id: 'ar', icon: '📷', label: 'AR Camera', screen: 'ARCamera' },
    { id: 'map', icon: '🗺️', label: 'Mapa', screen: 'Map' },
    { id: 'refresh', icon: '🔄', label: 'Actualizar' },
];
