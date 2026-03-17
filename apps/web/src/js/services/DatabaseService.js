import { api } from './api.js';

export class DatabaseService {

    constructor() {
        this.currentMissionId = localStorage.getItem('mars_current_mission_id') || null;
    }

    // --- MISSION MANAGEMENT ---

    async startMission(title = "Nueva Misión", location = "Desconocido", descripcionIA = null, opts = {}) {
        try {
            // Use API to Start Mission on Backend
            const res = await api.startMission({
                titulo: title,
                zona: location,
                clima: {},
                descripcion_ia: descripcionIA,
                tipo_terreno: opts.tipo_terreno || null,
                objetivo: opts.objetivo || null,
                dificultad: opts.dificultad || null,
                coords_inicio: opts.coords_inicio || null
            });

            if (res.success && res.mission_id) {
                this.setMission(res.mission_id, res.code);
                return res;
            } else {
                throw new Error(res.error || "Mission Start Failed");
            }
        } catch (e) {
            console.error("DB Service Error:", e);
            throw e;
        }
    }

    setMission(id, code) {
        this.currentMissionId = id;
        localStorage.setItem('mars_current_mission_id', id);
        if (code) localStorage.setItem('mars_current_mission_code', code);
    }

    async getCurrentMission() {
        if (!this.currentMissionId) return null;
        const code = localStorage.getItem('mars_current_mission_code') || "";
        return { id: this.currentMissionId, status: 'active', code: code };
    }

    getLastMissionId() {
        return this.currentMissionId;
    }

    // --- DATA ---

    async getNearbyObjects(lat, lng, radius = 500) {
        return await api.getNearbyObjects(lat, lng, radius);
    }

    async createObject(params) {
        const { title, type, lat, lng, embedding, metadata = {} } = params;

        const payload = {
            source: 'manual', // or passed in params
            object_class: type,
            name: title,
            confidence: 1.0,
            timestamp: new Date().toISOString(),
            location: { lat, lng },
            heading: 0,
            image_base64: metadata.image_base64 || '', // ensure image is passed
            metadata: metadata,
            mission_id: this.currentMissionId
        };

        const res = await api.createObject(payload);
        if (!res.success) throw new Error(res.error);

        return {
            ...res.data,
            lat: lat,
            lng: lng,
            title: res.data.nombre || title
        };
    }
}

export const dbService = new DatabaseService();
