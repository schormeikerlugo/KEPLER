/**
 * KEPLER Mobile - API Service
 * Communication with FastAPI backend
 */
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || 'http://localhost:8000';

interface ApiOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: object;
    headers?: Record<string, string>;
}

class ApiService {
    private baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    setToken(token: string | null) {
        this.token = token;
    }

    async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
        const { method = 'GET', body, headers = {} } = options;

        const config: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(this.token && { Authorization: `Bearer ${this.token}` }),
                ...headers,
            },
        };

        if (body) {
            config.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, config);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        return response.json();
    }

    // Mission endpoints
    async startMission(data: { titulo: string; zona: string; descripcion_ia?: string }) {
        return this.request('/api/missions/start', { method: 'POST', body: data });
    }

    async endMission(missionId: string) {
        return this.request('/api/missions/end', { method: 'POST', body: { mission_id: missionId } });
    }

    async getMissions() {
        return this.request('/api/missions/list');
    }

    // Zone description with GPS
    async describeZone(latitude: number, longitude: number) {
        return this.request<{ success: boolean; location_name: string; description: string }>(
            '/api/missions/describe-zone',
            { method: 'POST', body: { latitude, longitude } }
        );
    }

    // Object endpoints
    async saveObject(data: { nombre: string; descripcion?: string; imagen_base64?: string }) {
        return this.request('/api/objects/save', { method: 'POST', body: data });
    }

    async getObjects(missionId?: string) {
        const query = missionId ? `?mission_id=${missionId}` : '';
        return this.request(`/api/objects/list${query}`);
    }

    // Telemetry
    async sendTelemetry(data: object) {
        return this.request('/api/telemetry', { method: 'POST', body: data });
    }
}

export const api = new ApiService(BACKEND_URL);
