/**
 * Rutas Grid Module
 * Renders exploration routes for a selected mission
 */

import { api } from '../../../js/services/api.js';

export class RutasGrid {
    constructor(controller) {
        this.controller = controller;
        this.rutas = [];
    }

    async loadRutas(missionId) {
        const list = document.getElementById('rutas-list');
        if (!list) return;

        list.innerHTML = '<div class="empty-state">Cargando rutas...</div>';

        if (missionId === 'orphaned') {
            this.rutas = [];
            this.renderList();
            return;
        }

        this.rutas = await api.getMissionRoutes(missionId);
        this.updateTabCount();
        this.renderList();
    }

    updateTabCount() {
        const countEl = document.getElementById('tab-count-rutas');
        if (countEl) {
            countEl.textContent = this.rutas.length;
        }
    }

    renderList() {
        const list = document.getElementById('rutas-list');
        if (!list) return;

        list.innerHTML = '';

        if (this.rutas.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🗺️</div>
                    No hay rutas registradas en esta misión.
                </div>`;
            return;
        }

        this.rutas.forEach((ruta, index) => {
            const card = document.createElement('div');
            card.className = 'ruta-card';
            card.style.animationDelay = `${index * 0.04}s`;

            const dificultad = (ruta.dificultad || 'moderada').toLowerCase();
            const dificultadClass = dificultad === 'facil' || dificultad === 'fácil' ? 'facil'
                : dificultad === 'dificil' || dificultad === 'difícil' ? 'dificil'
                : 'moderada';

            const seguridad = (ruta.seguridad || 'precaucion').toLowerCase();
            const seguridadClass = seguridad === 'seguro' ? 'seguro'
                : seguridad === 'peligro' ? 'peligro'
                : 'precaucion';

            const distancia = ruta.distancia_km
                ? `${ruta.distancia_km.toFixed(1)} km`
                : 'N/A';

            const dateStr = new Date(ruta.created_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit'
            });

            card.innerHTML = `
                <div class="ruta-info">
                    <div class="ruta-name">${ruta.nombre || 'Sin nombre'}</div>
                    <div class="ruta-meta">
                        <span class="ruta-meta-item">${distancia}</span>
                        <span class="ruta-meta-item">${dateStr}</span>
                        ${ruta.notas ? `<span class="ruta-meta-item" style="color:#aaa;">${ruta.notas}</span>` : ''}
                    </div>
                </div>
                <div class="ruta-badges">
                    <span class="dificultad-badge ${dificultadClass}">${ruta.dificultad || 'Moderada'}</span>
                    <span class="seguridad-badge ${seguridadClass}">${ruta.seguridad || 'Precaución'}</span>
                </div>
            `;

            list.appendChild(card);
        });
    }
}
