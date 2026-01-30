/**
 * Mission Types
 * @module @kepler/shared/types/mission
 */

/**
 * Mission status enum
 */
export type MissionStatus = 'activa' | 'completada' | 'cancelada';

/**
 * Complete Mission entity from database
 */
export interface Mission {
    id: string;
    user_id: string;
    codigo: string;
    titulo: string;
    zona_geografica: string;
    descripcion_ia?: string;
    clima_snapshot?: ClimateSnapshot;
    estado: MissionStatus;
    inicio_at: string;
    fin_at?: string;
}

/**
 * Climate data snapshot captured at mission start
 */
export interface ClimateSnapshot {
    temperature?: number;
    humidity?: number;
    weather_condition?: string;
    wind_speed?: number;
    visibility?: number;
}

/**
 * Request payload to start a new mission
 */
export interface MissionStartRequest {
    titulo: string;
    zona: string;
    clima: ClimateSnapshot;
    descripcion_ia?: string;
}

/**
 * Summary statistics for a completed mission
 */
export interface MissionSummary {
    mission_id: string;
    total_objects: number;
    duration_minutes: number;
    categories_found: string[];
}
