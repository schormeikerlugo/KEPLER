/**
 * Mission Utilities
 * @module @kepler/shared/utils/mission
 * 
 * Pure functions for mission-related calculations
 */

import type { Mission, MissionStatus } from '../types';

/**
 * Generate a unique mission code
 * Format: KPL-XXXXXX (8 chars total)
 */
export function generateMissionCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'KPL-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Calculate mission duration in minutes
 */
export function calculateMissionDuration(mission: Mission): number {
    const start = new Date(mission.inicio_at);
    const end = mission.fin_at ? new Date(mission.fin_at) : new Date();
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Check if mission is currently active
 */
export function isMissionActive(mission: Mission): boolean {
    return mission.estado === 'activa';
}

/**
 * Get status color for mission
 */
export function getMissionStatusColor(status: MissionStatus): string {
    switch (status) {
        case 'activa':
            return '#00d4aa';  // Green
        case 'completada':
            return '#3FA8FF';  // Cyan
        case 'cancelada':
            return '#ff4444';  // Red
        default:
            return '#ffffff';
    }
}

/**
 * Get status label in Spanish
 */
export function getMissionStatusLabel(status: MissionStatus): string {
    switch (status) {
        case 'activa':
            return 'Activa';
        case 'completada':
            return 'Completada';
        case 'cancelada':
            return 'Cancelada';
        default:
            return 'Desconocido';
    }
}

/**
 * Sort missions by date (most recent first)
 */
export function sortMissionsByDate(missions: Mission[]): Mission[] {
    return [...missions].sort((a, b) => {
        return new Date(b.inicio_at).getTime() - new Date(a.inicio_at).getTime();
    });
}
