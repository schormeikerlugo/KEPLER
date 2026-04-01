/**
 * Telemetry Panel Module
 * Renders telemetry data and route map for a selected mission
 */

import { api } from '../../../js/services/api.js';

export class TelemetryPanel {
    constructor(controller) {
        this.controller = controller;
        this.data = null;
    }

    async loadTelemetry(missionId) {
        const container = document.getElementById('telemetry-content');
        if (!container) return;

        container.innerHTML = '<div class="empty-state">Cargando telemetría...</div>';

        if (missionId === 'orphaned') {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📡</div>
                    Los objetos sin misión no tienen telemetría asociada.
                </div>`;
            return;
        }

        this.data = await api.getMissionTelemetry(missionId);
        this.render();
    }

    render() {
        const container = document.getElementById('telemetry-content');
        if (!container) return;

        const summary = this.data?.summary;
        const samples = this.data?.samples || [];

        if (!summary && samples.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📡</div>
                    No hay datos de telemetría para esta misión.
                </div>`;
            return;
        }

        // Calculate stats from summary or samples
        const distance = summary?.distance_meters
            ? (summary.distance_meters / 1000).toFixed(2)
            : '0.00';

        const duration = summary?.duration_seconds
            ? this.formatDuration(summary.duration_seconds)
            : 'N/A';

        const avgSpeed = summary?.avg_speed_mps
            ? (summary.avg_speed_mps * 3.6).toFixed(1)
            : '0.0';

        const maxSpeed = summary?.max_speed_mps
            ? (summary.max_speed_mps * 3.6).toFixed(1)
            : '0.0';

        const sampleCount = summary?.sample_count || samples.length;

        container.innerHTML = `
            <div class="telemetry-panel">
                <div class="telemetry-card">
                    <div class="telemetry-label">Distancia Total</div>
                    <div class="telemetry-value">${distance} <span class="telemetry-unit">km</span></div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">Duración</div>
                    <div class="telemetry-value">${duration}</div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">Vel. Promedio</div>
                    <div class="telemetry-value">${avgSpeed} <span class="telemetry-unit">km/h</span></div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">Vel. Máxima</div>
                    <div class="telemetry-value">${maxSpeed} <span class="telemetry-unit">km/h</span></div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">Muestras GPS</div>
                    <div class="telemetry-value">${sampleCount}</div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">Estado Ruta</div>
                    <div class="telemetry-value" style="font-size: 1rem; color: ${summary?.route_geojson ? '#00c878' : '#666'};">
                        ${summary?.route_geojson ? 'Disponible' : 'Sin mapa'}
                    </div>
                </div>
                ${samples.length > 0 ? `
                <div class="telemetry-map" id="telemetry-map-container">
                    <div style="display:flex; align-items:center; justify-content:center; height:100%; color:#555; font-size:0.85rem;">
                        📍 ${samples.length} puntos GPS registrados
                    </div>
                </div>` : ''}
            </div>
        `;
    }

    formatDuration(seconds) {
        if (!seconds || seconds <= 0) return 'N/A';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
    }
}
