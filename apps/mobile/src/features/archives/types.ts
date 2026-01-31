/**
 * Archives Feature Types
 */
import { Mission } from '../../services/api';

export interface MissionObject {
    id: string;
    mission_id: string;
    nombre: string;
    tipo: string;
    subcategoria?: string;
    genero?: string;
    metadata?: {
        image_base64?: string;
        confidence?: number;
    };
    created_at: string;
}

export interface MissionDetail extends Mission {
    description?: string;
    location?: string;
    tags?: string[];
    stats?: {
        dist: string;
        time: string;
    };
    objects?: MissionObject[];
}

export type MissionStatus = 'ALL' | 'ACTIVA' | 'COMPLETADA';
