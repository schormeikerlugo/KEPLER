/**
 * Personas Grid Module
 * Renders personas encontradas for a selected mission
 */

import { api } from '../../../js/services/api.js';

export class PersonasGrid {
    constructor(controller) {
        this.controller = controller;
        this.personas = [];
    }

    get dom() {
        return this.controller.dom;
    }

    async loadPersonas(missionId) {
        const grid = document.getElementById('personas-grid');
        if (!grid) return;

        grid.innerHTML = '<div class="empty-state">Cargando personas...</div>';

        if (missionId === 'orphaned') {
            this.personas = [];
            this.renderGrid();
            return;
        }

        this.personas = await api.getMissionPersonas(missionId);
        this.updateTabCount();
        this.renderGrid();
    }

    updateTabCount() {
        const countEl = document.getElementById('tab-count-personas');
        if (countEl) {
            countEl.textContent = this.personas.length;
        }
    }

    renderGrid() {
        const grid = document.getElementById('personas-grid');
        if (!grid) return;

        grid.innerHTML = '';

        if (this.personas.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👤</div>
                    No hay personas registradas en esta misión.
                </div>`;
            return;
        }

        this.personas.forEach((persona, index) => {
            const card = document.createElement('div');
            card.className = 'persona-card';
            card.style.animationDelay = `${index * 0.04}s`;

            let imgSrc = '../../assets/placeholder-mars.jpg';
            if (persona.image_url) {
                imgSrc = persona.image_url;
            }

            const hostilidad = (persona.hostilidad || 'desconocido').toLowerCase();
            const hostilidadClass = hostilidad === 'aliado' ? 'aliado'
                : hostilidad === 'hostil' ? 'hostil'
                : hostilidad === 'neutral' ? 'neutral'
                : 'desconocido';

            const contexto = persona.contexto || 'Sin contexto';
            const dateStr = new Date(persona.created_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit'
            });

            card.innerHTML = `
                <img src="${imgSrc}" class="persona-img" loading="lazy" alt="${persona.nombre}">
                <div class="persona-info">
                    <div class="persona-name">${persona.nombre || 'Sin nombre'}</div>
                    ${persona.alias ? `<div class="persona-alias">"${persona.alias}"</div>` : ''}
                    <div class="persona-meta">${contexto} · ${dateStr}</div>
                    <span class="hostilidad-badge ${hostilidadClass}">${persona.hostilidad || 'Desconocido'}</span>
                </div>
            `;

            grid.appendChild(card);
        });
    }
}
