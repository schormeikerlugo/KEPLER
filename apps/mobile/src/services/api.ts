/**
 * KEPLER Mobile - API Service
 * 
 * Handles all HTTP communication with the backend.
 * Provides methods for telemetry, system status, and missions.
 * 
 * @module services/api
 */

import { API_BASE_URL, API_TIMEOUT } from '../constants/config';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Telemetry data from sensors
 */
export interface TelemetryData {
    /** Temperature in Celsius */
    temperature: number;
    /** Oxygen level percentage */
    oxygen: number;
    /** Heart rate in beats per minute */
    bpm: number;
    /** Radiation level */
    radiation: number;
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
    private baseUrl: string;

    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    // ---------------------------------------------------------------------------
    // TELEMETRY
    // ---------------------------------------------------------------------------

    /**
     * Fetch current telemetry data from sensors
     * Falls back to mock data if backend unavailable
     * 
     * @returns Promise<TelemetryData>
     */
    async getTelemetry(): Promise<TelemetryData> {
        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/telemetry`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    temperature: data.temperature ?? this.getMockTelemetry().temperature,
                    oxygen: data.oxygen ?? this.getMockTelemetry().oxygen,
                    bpm: data.bpm ?? this.getMockTelemetry().bpm,
                    radiation: data.radiation ?? this.getMockTelemetry().radiation,
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
            console.log('[API] Checking backend at:', `${this.baseUrl}/health`);

            const response = await fetchWithTimeout(
                `${this.baseUrl}/health`,
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
     * Fetch list of missions from database
     * 
     * @returns Promise<Mission[]>
     */
    async getMissions(): Promise<Mission[]> {
        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/misiones`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    return data.map((m: any) => ({
                        id: m.id,
                        code: this.formatMissionCode(m.id, m.created_at),
                        status: m.status || 'ACTIVA',
                        created_at: m.created_at,
                    }));
                }
            }

            return this.getMockMissions();
        } catch (error) {
            console.log('[API] Missions fetch error:', error);
            return this.getMockMissions();
        }
    }

    /**
     * Fetch single mission details
     * @param id - Mission ID
     */
    async getMissionDetails(id: string): Promise<any> {
        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/misiones/${id}`, {
                method: 'GET',
            });

            if (response.ok) {
                return await response.json();
            }
            throw new Error('Mission not found');
        } catch (error) {
            console.log('[API] Mission details error:', error);
            // Return mock detail for demo if API fails
            const mockList = this.getMockMissions();
            const mockMission = mockList.find(m => m.id === id) || mockList[0];
            return {
                ...mockMission,
                description: 'Misión de exploración geológica en sector Alpha-9.',
                location: 'Cráter Gale',
                tags: ['Geología', 'Exploración'],
                objects: [],
                stats: { dist: '4.2 km', time: '2h 15m' }
            };
        }
    }

    /**
     * Update mission status or details
     * @param id - Mission ID
     * @param updates - Partial mission object
     */
    async updateMission(id: string, updates: Partial<Mission>): Promise<boolean> {
        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/misiones/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            return response.ok;
        } catch (error) {
            console.log('[API] Update mission error:', error);
            return true; // Optimistic success for demo
        }
    }

    /**
     * Delete a mission
     * @param id - Mission ID
     */
    async deleteMission(id: string): Promise<boolean> {
        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/misiones/${id}`, {
                method: 'DELETE',
            });
            return response.ok;
        } catch (error) {
            console.log('[API] Delete mission error:', error);
            return true; // Optimistic success for demo
        }
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
            const response = await fetchWithTimeout(`${this.baseUrl}/health`, {}, 3000);
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
