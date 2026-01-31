/**
 * Archives Feature Types
 */
import { Mission } from '../../services/api';

export interface MissionDetail extends Mission {
    description?: string;
    location?: string;
    tags?: string[];
    stats?: {
        dist: string;
        time: string;
    };
    objects?: any[];
}

export type MissionStatus = 'ALL' | 'ACTIVA' | 'COMPLETADA';
