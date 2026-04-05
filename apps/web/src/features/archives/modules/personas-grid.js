/**
 * Personas Grid Module
 * Renders personas encontradas with identity management
 */

import { api } from '../../../js/services/api.js';
import { supabase } from '../../../js/auth.js';

export class PersonasGrid {
    constructor(controller) {
        this.controller = controller;
        this.personas = [];
        this.currentPersona = null;
        this._bindModalEvents();
    }

    get dom() {
        return this.controller.dom;
    }

    _bindModalEvents() {
        // Defer binding until DOM is ready
        setTimeout(() => {
            const modal = document.getElementById('persona-identity-modal');
            if (!modal) return;

            document.getElementById('btn-close-persona-modal')?.addEventListener('click', () => {
                modal.style.display = 'none';
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });

            document.getElementById('btn-save-persona')?.addEventListener('click', () => this._savePersona());
            document.getElementById('btn-delete-persona')?.addEventListener('click', () => this._deletePersona());
        }, 500);
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
        if (countEl) countEl.textContent = this.personas.length;
    }

    renderGrid() {
        const grid = document.getElementById('personas-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (this.personas.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👤</div>
                    No hay personas registradas en esta mision.
                </div>`;
            return;
        }

        this.personas.forEach((persona, index) => {
            const card = document.createElement('div');
            card.className = 'persona-card';
            card.style.animationDelay = `${index * 0.04}s`;
            card.style.cursor = 'pointer';

            let imgSrc = '';
            const hasImage = persona.image_url && persona.image_url.length > 50;
            if (hasImage) {
                imgSrc = persona.image_url;
            }

            const hostilidad = (persona.hostilidad || 'desconocido').toLowerCase();
            const hostilidadClass = hostilidad === 'aliado' ? 'aliado'
                : hostilidad === 'hostil' ? 'hostil'
                : hostilidad === 'neutral' ? 'neutral'
                : 'desconocido';

            const contexto = persona.contexto || 'Sin contexto';
            const dateStr = new Date(persona.created_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });

            card.innerHTML = `
                ${hasImage
                    ? `<img src="${imgSrc}" class="persona-img" loading="lazy" alt="${persona.nombre}">`
                    : `<div class="persona-img persona-placeholder">👤</div>`
                }
                <div class="persona-info">
                    <div class="persona-name">${persona.nombre || 'Sin nombre'}</div>
                    ${persona.alias ? `<div class="persona-alias">"${persona.alias}"</div>` : ''}
                    <div class="persona-meta">${contexto} · ${dateStr}</div>
                    <span class="hostilidad-badge ${hostilidadClass}">${persona.hostilidad || 'Desconocido'}</span>
                </div>
            `;

            card.addEventListener('click', () => this._openIdentityModal(persona));
            grid.appendChild(card);
        });
    }

    async _openIdentityModal(persona) {
        this.currentPersona = persona;
        const modal = document.getElementById('persona-identity-modal');
        if (!modal) return;

        // Populate fields
        const img = document.getElementById('persona-modal-img');
        if (img) {
            if (persona.image_url && persona.image_url.length > 50) {
                img.src = persona.image_url;
                img.style.display = 'block';
            } else {
                img.src = '';
                img.style.display = 'none';
            }
        }

        document.getElementById('inp-persona-id-nombre').value = persona.nombre || '';
        document.getElementById('inp-persona-id-alias').value = persona.alias || '';
        document.getElementById('select-persona-id-contexto').value = persona.contexto || 'desconocido';
        document.getElementById('select-persona-id-hostilidad').value = persona.hostilidad || 'desconocido';
        document.getElementById('inp-persona-id-rasgos').value = persona.rasgos_fisicos || '';
        document.getElementById('inp-persona-id-notas').value = persona.notas || '';

        // Show modal
        modal.style.display = 'flex';

        // Search for visual matches (background)
        this._findSimilarPersonas(persona);
    }

    async _findSimilarPersonas(persona) {
        const matchesList = document.getElementById('persona-matches-list');
        if (!matchesList) return;
        matchesList.innerHTML = '<span style="color:#555;font-size:0.75rem;">Buscando coincidencias...</span>';

        // If persona has image, search for visual matches
        if (!persona.image_url || persona.image_url.length < 100) {
            matchesList.innerHTML = '<span style="color:#555;font-size:0.75rem;">Sin imagen para comparar</span>';
            return;
        }

        try {
            const result = await api.matchVisual(persona.image_url, 'persona', 0.60);
            if (result?.matched || result?.alternatives?.length > 0) {
                const allMatches = [];
                if (result.entity && result.entity.id !== persona.id) {
                    allMatches.push(result.entity);
                }
                if (result.alternatives) {
                    allMatches.push(...result.alternatives.filter(a => a.id !== persona.id));
                }

                if (allMatches.length === 0) {
                    matchesList.innerHTML = '<span style="color:#555;font-size:0.75rem;">Sin coincidencias</span>';
                    return;
                }

                matchesList.innerHTML = allMatches.map(match => `
                    <div class="match-item" data-id="${match.id}" style="cursor:pointer;">
                        <span class="match-name">${match.nombre}</span>
                        <span class="match-sim">${(match.similarity * 100).toFixed(0)}%</span>
                    </div>
                `).join('');

                // Click to link identities
                matchesList.querySelectorAll('.match-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const matchId = item.dataset.id;
                        const matchName = item.querySelector('.match-name').textContent;
                        if (confirm(`Vincular esta persona con "${matchName}"? Se actualizara el nombre.`)) {
                            this._linkPersonas(persona.id, matchId, matchName);
                        }
                    });
                });
            } else {
                matchesList.innerHTML = '<span style="color:#555;font-size:0.75rem;">Sin coincidencias</span>';
            }
        } catch (e) {
            matchesList.innerHTML = '<span style="color:#555;font-size:0.75rem;">Error en busqueda</span>';
        }
    }

    async _linkPersonas(currentId, matchId, matchName) {
        try {
            // Update current persona with the linked identity's name
            await supabase.from('personas_encontradas')
                .update({
                    nombre: matchName,
                    notas: `Vinculada con registro ${matchId}. ${this.currentPersona?.notas || ''}`
                })
                .eq('id', currentId);

            if (window.kepler?.notify) {
                window.kepler.notify.success(`Persona vinculada con "${matchName}"`, { source: 'archives', action: 'link_persona' });
            }

            // Refresh
            const missionId = this.controller.missionsManager?.activeMissionId;
            if (missionId) await this.loadPersonas(missionId);
            document.getElementById('persona-identity-modal').style.display = 'none';
        } catch (e) {
            console.error('[PersonasGrid] Link error:', e);
        }
    }

    async _savePersona() {
        if (!this.currentPersona) return;

        const updates = {
            nombre: document.getElementById('inp-persona-id-nombre').value || this.currentPersona.nombre,
            alias: document.getElementById('inp-persona-id-alias').value || null,
            contexto: document.getElementById('select-persona-id-contexto').value,
            hostilidad: document.getElementById('select-persona-id-hostilidad').value,
            rasgos_fisicos: document.getElementById('inp-persona-id-rasgos').value || null,
            notas: document.getElementById('inp-persona-id-notas').value || null
        };

        try {
            const { error } = await supabase
                .from('personas_encontradas')
                .update(updates)
                .eq('id', this.currentPersona.id);

            if (error) throw error;

            if (window.kepler?.notify) {
                window.kepler.notify.success(`Identidad de "${updates.nombre}" actualizada`, { source: 'archives', action: 'update_persona' });
            }

            // Refresh grid
            const missionId = this.controller.missionsManager?.activeMissionId;
            if (missionId) await this.loadPersonas(missionId);
            document.getElementById('persona-identity-modal').style.display = 'none';
        } catch (e) {
            console.error('[PersonasGrid] Save error:', e);
            if (window.kepler?.notify) {
                window.kepler.notify.show('Error al guardar: ' + e.message, 'critical', 0);
            }
        }
    }

    async _deletePersona() {
        if (!this.currentPersona) return;
        if (!confirm('Eliminar esta persona permanentemente?')) return;

        try {
            const { error } = await supabase
                .from('personas_encontradas')
                .delete()
                .eq('id', this.currentPersona.id);

            if (error) throw error;

            if (window.kepler?.notify) {
                window.kepler.notify.success('Persona eliminada');
            }

            const missionId = this.controller.missionsManager?.activeMissionId;
            if (missionId) await this.loadPersonas(missionId);
            document.getElementById('persona-identity-modal').style.display = 'none';
        } catch (e) {
            console.error('[PersonasGrid] Delete error:', e);
        }
    }
}
