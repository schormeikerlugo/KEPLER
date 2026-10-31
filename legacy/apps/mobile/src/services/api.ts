/**
 * KEPLER Mobile - API Service
 * 
 * Handles all HTTP communication with the backend.
 * Provides methods for telemetry, system status, and missions.
 * 
 * @module services/api
 */

import { API_TIMEOUT } from '../constants/config';
import { supabase } from './supabase';
import { configService } from './configService';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Telemetry data — environmental real + biometric coherent.
 * Field names mirror the backend (`/api/realtime-telemetry`).
 */
export interface TelemetryData {
    // Environmental (real, Open-Meteo)
    temperature: number;            // °C
    apparent_temperature?: number;
    humidity: number;               // %
    wind_speed_kmh?: number;
    wind_gusts_kmh?: number;
    wind_direction?: number;        // 0-359
    pressure_hpa?: number;
    uv_index?: number;
    visibility_km?: number;
    cloud_cover?: number;
    rain_mm?: number;
    weather_category?: string;
    location_name?: string | null;

    // Air quality (real, Open-Meteo AQ → mapped to "oxygen")
    oxygen: number;                 // aire_pct (0-100, higher = better)
    air_quality_aqi?: number;
    pm2_5?: number;
    pm10?: number;
    air_category?: string;

    // Biometric (coherent simulated)
    bpm: number;
    radiation: number;
    suitTemp: number;
    suit_pressure?: number;

    // Local-only (filled in by hook, not from API)
    battery: number;                // device battery %
    battery_charging?: boolean;
    link: number;                   // network downlink %
    link_type?: string;             // 4g/3g/wifi…

    // Meta
    data_sources?: {
        weather?: string;
        air?: string;
        biometric?: string;
    };
    timestamp?: string;
}

/** Coords + speed input for the telemetry call */
export interface TelemetryQuery {
    lat?: number;
    lng?: number;
    speed_mps?: number;
}

/**
 * System component status
 */
export interface SystemStatus {
    /** Backend API is reachable */
    backend: boolean;
    /** Supabase database is connected */
    supabase: boolean;
    /** Ollama AI model is running */
    ollama: boolean;
}

/**
 * Mission data
 */
export interface Mission {
    /** Unique identifier */
    id: string;
    /** Human-readable mission code */
    code: string;
    /** Current status (ACTIVA, COMPLETADA, etc.) */
    status: string;
    /** ISO timestamp of creation */
    created_at: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Taxonomy Types
 */
export interface Category {
    id: string;
    nombre: string;
    descripcion?: string;
    color?: string;
    icono?: string;
}

export interface Subcategory {
    id: string;
    categoria_id: string;
    nombre: string;
    descripcion?: string;
}

export interface Tag {
    id: string;
    nombre: string;
    color?: string;
}

export interface TaxonomyAssignment {
    categoria_id?: string;
    subcategoria_id?: string;
    etiqueta_ids?: string[];
}

/**
 * Fetch with timeout support for React Native
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds
 * @returns Promise<Response>
 * @throws Error on timeout or network failure
 */
async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = API_TIMEOUT
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// =============================================================================
// API SERVICE CLASS
// =============================================================================

/**
 * ApiService - Main API client for backend communication
 * 
 * @example
 * import { api } from './services/api';
 * const telemetry = await api.getTelemetry();
 */
class ApiService {
    /**
     * Resolve the live backend URL each call. The user can change it from
     * Settings without re-instantiating anything.
     */
    private async getBaseUrl(): Promise<string> {
        return configService.getBackendUrl();
    }

    /** Public accessor for ad-hoc fetches outside this class. */
    async resolveBaseUrl(): Promise<string> {
        return this.getBaseUrl();
    }

    /**
     * Get current auth token
     */
    private async getToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || null;
    }

    /**
     * Fetch with auth header
     */
    private async fetchWithAuth(url: string, options: RequestInit = {}) {
        const token = await this.getToken();
        const headers: any = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return fetchWithTimeout(url, { ...options, headers });
    }

    // ---------------------------------------------------------------------------
    // TELEMETRY
    // ---------------------------------------------------------------------------

    /**
     * Fetch current telemetry from `/api/realtime-telemetry`.
     * Pass GPS coords for real weather/air; speed for coherent BPM.
     * Falls back to mock data if backend unavailable.
     */
    async getTelemetry(query: TelemetryQuery = {}): Promise<TelemetryData> {
        try {
            const baseUrl = await this.getBaseUrl();
            const params = new URLSearchParams();
            if (typeof query.lat === 'number' && typeof query.lng === 'number') {
                params.set('lat', String(query.lat));
                params.set('lng', String(query.lng));
            }
            if (typeof query.speed_mps === 'number' && query.speed_mps >= 0) {
                params.set('speed_mps', String(query.speed_mps));
            }
            const qs = params.toString();
            const url = `${baseUrl}/api/realtime-telemetry${qs ? `?${qs}` : ''}`;
            const response = await fetchWithTimeout(url, { method: 'GET' });

            if (response.ok) {
                const data = await response.json();
                const mock = this.getMockTelemetry();
                return {
                    // Environmental
                    temperature: data.temperature ?? mock.temperature,
                    apparent_temperature: data.apparent_temperature,
                    humidity: data.humidity ?? mock.humidity,
                    wind_speed_kmh: data.wind_speed_kmh,
                    wind_gusts_kmh: data.wind_gusts_kmh,
                    wind_direction: data.wind_direction,
                    pressure_hpa: data.pressure_hpa,
                    uv_index: data.uv_index,
                    visibility_km: data.visibility_km,
                    cloud_cover: data.cloud_cover,
                    rain_mm: data.rain_mm,
                    weather_category: data.weather_category,
                    location_name: data.location_name,

                    // Air
                    oxygen: data.oxygen_level ?? mock.oxygen,
                    air_quality_aqi: data.air_quality_aqi,
                    pm2_5: data.pm2_5,
                    pm10: data.pm10,
                    air_category: data.air_category,

                    // Biometric
                    bpm: data.heart_rate ?? mock.bpm,
                    radiation: data.radiation ?? mock.radiation,
                    suitTemp: data.suit_temperature ?? mock.suitTemp,
                    suit_pressure: data.suit_pressure,

                    // Local placeholders (filled by hook)
                    battery: mock.battery,
                    link: mock.link,

                    // Meta
                    data_sources: data.data_sources,
                    timestamp: data.timestamp,
                };
            }
            return this.getMockTelemetry();
        } catch (error) {
            console.log('[API] Telemetry fetch error:', error);
            return this.getMockTelemetry();
        }
    }

    // ---------------------------------------------------------------------------
    // SYSTEM STATUS
    // ---------------------------------------------------------------------------

    /**
     * Check backend system health status
     * 
     * @returns Promise<SystemStatus>
     */
    async getSystemStatus(): Promise<SystemStatus> {
        try {
            const baseUrl = await this.getBaseUrl();
            console.log('[API] Checking backend at:', `${baseUrl}/health`);

            const response = await fetchWithTimeout(
                `${baseUrl}/health`,
                { method: 'GET' },
                3000
            );

            if (response.ok) {
                const data = await response.json();
                console.log('[API] Backend healthy:', data);

                return {
                    backend: true,
                    supabase: data.services?.includes('database') ?? true,
                    ollama: data.services?.includes('ai_model') ?? false,
                };
            }

            return this.getOfflineStatus();
        } catch (error) {
            console.log('[API] System status check error:', error);
            return this.getOfflineStatus();
        }
    }

    // ---------------------------------------------------------------------------
    // MISSIONS
    // ---------------------------------------------------------------------------

    /**
     * Fetch list of missions
     */
    async getMissions(): Promise<Mission[]> {
        try {
            const baseUrl = await this.getBaseUrl();
            console.log('[API] Fetching missions from:', `${baseUrl}/api/missions/list`);
            const response = await this.fetchWithAuth(`${baseUrl}/api/missions/list`, {
                method: 'GET',
            });

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    return data.map((m: any) => ({
                        id: m.id,
                        code: m.codigo || this.formatMissionCode(m.id, m.inicio_at),
                        status: m.estado === 'activa' ? 'ACTIVA' : 'COMPLETADA',
                        created_at: m.inicio_at || new Date().toISOString(),
                        ...m
                    }));
                }
            }
            console.log('[API] Missions fetch failed, status:', response.status);
            return this.getMockMissions();
        } catch (error) {
            console.log('[API] Missions fetch error:', error);
            return this.getMockMissions();
        }
    }

    /**
     * Fetch single mission details (Simulated via List + Objects)
     */
    async getMissionDetails(id: string): Promise<any> {
        try {
            // 1. Get mission basic info (from list or cache ideally, but fetching list for now)
            const missions = await this.getMissions();
            const mission = missions.find(m => m.id === id);

            if (!mission) throw new Error('Mission not found locally');

            // 2. Get objects
            const baseUrl = await this.getBaseUrl();
            const responseObj = await this.fetchWithAuth(`${baseUrl}/api/missions/${id}/objects`, {
                method: 'GET'
            });

            const objects = responseObj.ok ? await responseObj.json() : [];

            return {
                ...mission,
                code: (mission as any).titulo || mission.code, // Prefer title if set
                description: (mission as any).descripcion_ia || (mission as any).zona_geografica || 'Sin descripción',
                location: (mission as any).zona_geografica,
                tags: ['Exploración'],
                objects: objects,
                stats: { dist: 'N/A', time: 'N/A' } // Backend doesn't provide this yet
            };
        } catch (error) {
            console.log('[API] Mission details error:', error);
            // Mock fallback
            const mockList = this.getMockMissions();
            const mockMission = mockList.find(m => m.id === id) || mockList[0];
            return {
                ...mockMission,
                objects: [],
                stats: { dist: '0km', time: '0m' }
            };
        }
    }

    /**
     * Update mission status or details
     * @param id - Mission ID
     * @param updates - Partial mission object
     */
    async updateMission(id: string, updates: Partial<Mission> & { title?: string; location?: string; description?: string }): Promise<boolean> {
        try {
            const baseUrl = await this.getBaseUrl();
            // Handle status change (End Mission)
            if (updates.status === 'COMPLETADA') {
                const response = await this.fetchWithAuth(`${baseUrl}/api/missions/end`, {
                    method: 'POST',
                    body: JSON.stringify({ mission_id: id }),
                });
                return response.ok;
            }

            // Handle metadata update
            const body = {
                titulo: updates.title || updates.code, // Map code/title update
                zona_geografica: updates.location,
                descripcion_ia: updates.description,
            };

            const response = await this.fetchWithAuth(`${baseUrl}/api/missions/${id}`, {
                method: 'PUT',
                body: JSON.stringify(body),
            });

            return response.ok;
        } catch (error) {
            console.log('[API] Update mission error:', error);
            return false;
        }
    }

    /**
     * Update object metadata
     */
    async updateObject(id: string, updates: {
        nombre?: string;
        description?: string;
        tipo?: string;
        subcategoria?: string;
        genero?: string;
    }): Promise<boolean> {
        try {
            const baseUrl = await this.getBaseUrl();
            const body = {
                nombre: updates.nombre, // Backend expects 'nombre'
                descripcion: updates.description, // Backend 'descripcion'
                tipo: updates.tipo,
                subcategoria: updates.subcategoria,
                genero: updates.genero,
            };

            const response = await this.fetchWithAuth(`${baseUrl}/api/objects/${id}`, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
            return response.ok;
        } catch (error) {
            console.log('[API] Update object error:', error);
            return false;
        }
    }

    /**
     * Delete a mission
     * @param id - Mission ID
     */
    async deleteMission(id: string): Promise<boolean> {
        try {
            const baseUrl = await this.getBaseUrl();
            const response = await this.fetchWithAuth(`${baseUrl}/api/missions/delete/${id}`, {
                method: 'DELETE',
            });
            return response.ok;
        } catch (error) {
            console.log('[API] Delete mission error:', error);
            return false;
        }
    }

    // ---------------------------------------------------------------------------
    // TAXONOMY
    // ---------------------------------------------------------------------------

    async getCategories(): Promise<Category[]> {
        const baseUrl = await this.getBaseUrl();
        const res = await this.fetchWithAuth(`${baseUrl}/api/taxonomia/categorias`);
        return res.ok ? await res.json() : [];
    }

    async getSubcategories(categoryId: string): Promise<Subcategory[]> {
        const baseUrl = await this.getBaseUrl();
        const res = await this.fetchWithAuth(`${baseUrl}/api/taxonomia/subcategorias/${categoryId}`);
        return res.ok ? await res.json() : [];
    }

    async getTags(): Promise<Tag[]> {
        const baseUrl = await this.getBaseUrl();
        const res = await this.fetchWithAuth(`${baseUrl}/api/taxonomia/etiquetas`);
        return res.ok ? await res.json() : [];
    }

    async getObjectTaxonomy(objectId: string): Promise<{ categoria_id?: string; subcategoria_id?: string; etiquetas: Tag[] }> {
        const baseUrl = await this.getBaseUrl();
        const res = await this.fetchWithAuth(`${baseUrl}/api/taxonomia/objetos/${objectId}/taxonomia`);
        return res.ok ? await res.json() : { etiquetas: [] };
    }

    async assignTaxonomy(objectId: string, assignment: TaxonomyAssignment): Promise<boolean> {
        const baseUrl = await this.getBaseUrl();
        const res = await this.fetchWithAuth(`${baseUrl}/api/taxonomia/objetos/${objectId}/asignar`, {
            method: 'POST',
            body: JSON.stringify(assignment)
        });
        return res.ok;
    }

    // ---------------------------------------------------------------------------
    // UTILITY METHODS
    // ---------------------------------------------------------------------------

    /**
     * Test if backend is reachable
     * @returns Promise<boolean>
     */
    async testConnection(): Promise<boolean> {
        try {
            const baseUrl = await this.getBaseUrl();
            const response = await fetchWithTimeout(`${baseUrl}/health`, {}, 3000);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Format mission ID into readable code
     * @param id - Mission ID
     * @param createdAt - Creation timestamp
     * @returns Formatted code like "MISION-20260128-1937"
     */
    private formatMissionCode(id: string, createdAt?: string): string {
        const date = createdAt
            ? new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, '')
            : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const shortId = String(id).slice(0, 4).toUpperCase();
        return `MISION-${date}-${shortId}`;
    }

    // ---------------------------------------------------------------------------
    // MOCK DATA (Fallbacks)
    // ---------------------------------------------------------------------------

    /**
     * Generate mock telemetry data with slight randomization
     */
    private getMockTelemetry(): TelemetryData {
        return {
            temperature: 23 + Math.random() * 2,
            oxygen: 98 + Math.random() * 2,
            bpm: 58 + Math.floor(Math.random() * 10),
            radiation: 0.03 + Math.random() * 0.01,
            battery: 85 + Math.floor(Math.random() * 15),
            link: 70 + Math.floor(Math.random() * 30),
            suitTemp: 21 + Math.random() * 3,
            humidity: 40 + Math.floor(Math.random() * 20),
        };
    }

    /**
     * Return offline system status
     */
    private getOfflineStatus(): SystemStatus {
        return {
            backend: false,
            supabase: false,
            ollama: false,
        };
    }

    /**
     * Generate mock missions for demo
     */
    private getMockMissions(): Mission[] {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

        return [
            {
                id: '1',
                code: `MISION-${dateStr}-1937`,
                status: 'ACTIVA',
                created_at: now.toISOString(),
            },
            {
                id: '2',
                code: `MISION-${dateStr}-1551`,
                status: 'ACTIVA',
                created_at: now.toISOString(),
            },
        ];
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

/** Singleton API instance */
export const api = new ApiService();
export default api;
