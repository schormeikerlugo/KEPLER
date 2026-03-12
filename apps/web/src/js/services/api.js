import { auth } from '../auth.js';
import { offlineSync } from './OfflineSyncService.js';

const API_BASE = '/api';

// Export auth token getter for streaming and other modules
export async function getAuthToken() {
    return await auth.getToken();
}

// Export offline sync for manual operations
export { offlineSync };

export const api = {
    // --- DASHBOARD ---
    async getDashboardStats() {
        try {
            const res = await fetch(`${API_BASE}/dashboard/stats?t=${Date.now()}`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            return await res.json();
        } catch (err) {
            console.error(err);
            // Return fallback structure directly
            return {
                counts: { pois: 0, minerals: 0, missions: 0, objects: 0 },
                recent: { pois: [], minerals: [], missions: [], objects: [] }
            };
        }
    },

    // --- SERVICE HEALTH ---
    async getHealth() {
        const status = {
            backend: false,
            database: false,
            ai: false
        };
        try {
            const res = await fetch(`${API_BASE}/dashboard/stats?t=${Date.now()}`);
            if (res.ok) {
                status.backend = true;
                status.database = true; // If stats load, DB is connected
            }
            // Check AI (Ollama) - ping with auth token
            try {
                const token = await auth.getToken();
                const aiRes = await fetch(`${API_BASE}/chat/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ message: 'status', context: '' })
                });
                status.ai = aiRes && aiRes.ok;
            } catch (aiErr) {
                console.warn('AI check failed:', aiErr);
                status.ai = false;
            }
        } catch (e) {
            console.warn('Health check failed:', e);
        }
        return status;
    },

    // --- CHAT ---
    async chat(message, context = "", chatId = null) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message, context, chat_id: chatId })
            });
            if (!res.ok) throw new Error('Chat failed');
            return await res.json();
        } catch (err) {
            console.error(err);
            return { response: "Error de conexión." };
        }
    },

    async getChatHistory() {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/chat/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await res.json();
        } catch (e) { return []; }
    },

    async loadChat(id) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/chat/history/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await res.json();
        } catch (e) { return null; }
    },

    async updateChatTitle(chatId, newTitle) {
        const token = await auth.getToken();
        if (!token) return null;
        try {
            const res = await fetch(`${API_BASE}/chat/history/${chatId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title: newTitle })
            });
            return await res.json();
        } catch (error) {
            console.error(error);
            return null;
        }
    },

    async deleteChat(id) {
        try {
            const token = await auth.getToken();
            await fetch(`${API_BASE}/chat/history/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return true;
        } catch (e) { return false; }
    },

    // --- TELEMETRY ---
    async getTelemetry() {
        try {
            const res = await fetch(`${API_BASE}/realtime-telemetry`);
            return await res.json();
        } catch (err) {
            console.warn("Telemetry offline, using simulation");
            return null; // Let frontend simulate
        }
    },

    // --- MISSIONS ---
    async startMission(data) {
        // data: { titulo, zona, clima }
        try {
            sessionStorage.removeItem('kepler_ai_report_cache');
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/missions/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            return await res.json();
        } catch (e) { console.error(e); return { success: false }; }
    },

    async endMission(missionId) {
        try {
            sessionStorage.removeItem('kepler_ai_report_cache');
            const token = await auth.getToken();
            await fetch(`${API_BASE}/missions/end`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ mission_id: missionId })
            });
            return { success: true };
        } catch (e) { return { success: false }; }
    },

    async deleteMission(missionId) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/missions/delete/${missionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await res.json();
        } catch (e) { return { success: false, error: e.message }; }
    },

    // --- UNIFIED OBJECT CREATION (WITH OFFLINE SUPPORT) ---
    // Uses OfflineSyncService for automatic offline handling
    async createObject(data) {
        // data: { source, object_class, name, confidence, timestamp, location, heading, image_base64, metadata, mission_id }
        // Delegates to OfflineSyncService which handles:
        // - Offline storage in localStorage
        // - Automatic retry when back online
        // - User notifications
        return await offlineSync.createObject(data);
    },

    // Force sync all pending objects
    async forceSyncObjects() {
        return await offlineSync.forceSync();
    },

    // Get sync status
    getSyncStatus() {
        return offlineSync.getStatus();
    },

    // --- ARCHIVES ---
    async getMissions() {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/missions/list?t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await res.json();
        } catch (e) { return []; }
    },

    async getMissionObjects(missionId) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/missions/${missionId}/objects?t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            return await res.json();
        } catch (e) { return []; }
    },

    async getOrphanedObjects() {
        try {
            const token = await auth.getToken();
            // Add timestamp to prevent browser caching
            const res = await fetch(`${API_BASE}/missions/orphaned/objects?t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            return await res.json();
        } catch (e) { return []; }
    },

    async updateObject(id, data) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/objects/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.json();
                console.error("Update failed:", err);
                return false;
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async deleteObject(id) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/objects/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return false;
            return true;
        } catch (e) { return false; }
    },

    async getNearbyObjects(lat, lng, radius = 500) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/objects/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Fetch failed");
            return await res.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    }
};
