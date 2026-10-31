/**
 * IdentityComparator — Visual side-by-side persona comparison tool
 * Opens as overlay panel from Archives → Personas tab
 * Lets user link/reject visual matches to build identity profiles
 */

import { supabase } from '../../../js/auth.js';
import { api } from '../../../js/services/api.js';

export class IdentityComparator {
    constructor(controller) {
        this.controller = controller;
        this.unidentified = [];
        this.currentIndex = 0;
        this.currentPersona = null;
        this.matches = [];
        this.activeMatchIndex = 0;
        this.rejections = new Set(); // Track rejected pairs to avoid reshowing
        this.overlay = null;
    }

    async open() {
        this._createOverlay();
        this.overlay.classList.add('open');

        // Fetch all personas for current mission (or all)
        await this._loadUnidentified();

        if (this.unidentified.length === 0) {
            this._renderEmpty();
            return;
        }

        this.currentIndex = 0;
        await this._selectPersona(this.unidentified[0]);
    }

    close() {
        if (!this.overlay) return;
        this.overlay.classList.add('closing');
        setTimeout(() => {
            this.overlay.classList.remove('open', 'closing');
            this.overlay.remove();
            this.overlay = null;
            // Refresh personas grid
            const missionId = this.controller.missionsManager?.activeMissionId;
            if (missionId) this.controller.personasGrid.loadPersonas(missionId);
        }, 250);
    }

    // ════════════════════════════════════════════
    // DATA
    // ════════════════════════════════════════════

    async _loadUnidentified() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get personas whose name starts with "Persona" (auto-generated, not yet identified)
            const { data, error } = await supabase
                .from('personas_encontradas')
                .select('*')
                .eq('user_id', user.id)
                .ilike('nombre', 'Persona %')
                .order('created_at', { ascending: false })
                .limit(50);

            this.unidentified = (data || []).filter(p => p.image_url && p.image_url.length > 100);
            this._renderSidebar();
        } catch (e) {
            console.error('[Comparator] Load error:', e);
        }
    }

    async _selectPersona(persona) {
        this.currentPersona = persona;
        this.matches = [];
        this.activeMatchIndex = 0;
        this._renderCurrent(persona);
        this._renderMatchLoading();

        // Fetch visual matches
        if (persona.image_url && persona.image_url.length > 100) {
            try {
                const result = await api.matchVisual(persona.image_url, 'persona', 0.50);
                const allMatches = [];
                if (result?.entity && result.entity.id !== persona.id) allMatches.push(result.entity);
                if (result?.alternatives) allMatches.push(...result.alternatives.filter(a => a.id !== persona.id));

                // Filter out rejected pairs
                this.matches = allMatches.filter(m => !this.rejections.has(`${persona.id}:${m.id}`));

                // Fetch full data (including images) for matches
                if (this.matches.length > 0) {
                    const ids = this.matches.map(m => m.id);
                    const { data } = await supabase
                        .from('personas_encontradas')
                        .select('*')
                        .in('id', ids);

                    if (data) {
                        this.matches = this.matches.map(match => {
                            const full = data.find(d => d.id === match.id);
                            return { ...match, ...full, similarity: match.similarity };
                        });
                    }
                }
            } catch (e) {
                console.error('[Comparator] Match error:', e);
            }
        }

        this._renderMatch();
        this._renderThumbnails();
        this._updateSidebarActive();
    }

    async _linkIdentity(matchId, matchName) {
        if (!this.currentPersona) return;

        try {
            await supabase.from('personas_encontradas')
                .update({
                    nombre: matchName,
                    notas: `Vinculada via Comparador con ${matchId}. ${this.currentPersona.notas || ''}`
                })
                .eq('id', this.currentPersona.id);

            if (window.kepler?.notify) {
                window.kepler.notify.success(`Identidad vinculada: "${matchName}"`, { source: 'comparator', action: 'link' });
            }

            // Remove from unidentified and go to next
            this.unidentified = this.unidentified.filter(p => p.id !== this.currentPersona.id);
            this._renderSidebar();

            if (this.unidentified.length > 0) {
                this.currentIndex = Math.min(this.currentIndex, this.unidentified.length - 1);
                await this._selectPersona(this.unidentified[this.currentIndex]);
            } else {
                this._renderAllDone();
            }
        } catch (e) {
            console.error('[Comparator] Link error:', e);
        }
    }

    _rejectMatch() {
        if (!this.currentPersona || this.matches.length === 0) return;
        const match = this.matches[this.activeMatchIndex];
        if (match) {
            this.rejections.add(`${this.currentPersona.id}:${match.id}`);
        }

        // Show next match
        this.activeMatchIndex++;
        if (this.activeMatchIndex >= this.matches.length) {
            this._renderNoMoreMatches();
        } else {
            this._renderMatch();
            this._renderThumbnails();
        }
    }

    async _saveAsNew() {
        const nameInput = this.overlay.querySelector('#comparator-new-name');
        const name = nameInput?.value?.trim();
        if (!name || !this.currentPersona) return;

        try {
            await supabase.from('personas_encontradas')
                .update({ nombre: name })
                .eq('id', this.currentPersona.id);

            if (window.kepler?.notify) {
                window.kepler.notify.success(`Nueva identidad: "${name}"`, { source: 'comparator', action: 'new_identity' });
            }

            this.unidentified = this.unidentified.filter(p => p.id !== this.currentPersona.id);
            this._renderSidebar();

            if (this.unidentified.length > 0) {
                this.currentIndex = Math.min(this.currentIndex, this.unidentified.length - 1);
                await this._selectPersona(this.unidentified[this.currentIndex]);
            } else {
                this._renderAllDone();
            }
        } catch (e) {
            console.error('[Comparator] Save new error:', e);
        }
    }

    _nextPersona() {
        if (this.currentIndex < this.unidentified.length - 1) {
            this.currentIndex++;
            this._selectPersona(this.unidentified[this.currentIndex]);
        }
    }

    _prevPersona() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this._selectPersona(this.unidentified[this.currentIndex]);
        }
    }

    // ════════════════════════════════════════════
    // RENDERING
    // ════════════════════════════════════════════

    _createOverlay() {
        if (this.overlay) this.overlay.remove();

        this.overlay = document.createElement('div');
        this.overlay.className = 'comparator-overlay';
        this.overlay.innerHTML = `
            <div class="comparator-panel">
                <div class="comparator-header">
                    <button class="comparator-back" id="btn-comparator-close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                        Volver
                    </button>
                    <span class="comparator-title">COMPARADOR DE IDENTIDADES</span>
                    <span class="comparator-count" id="comparator-count"></span>
                </div>
                <div class="comparator-body">
                    <div class="comparator-sidebar" id="comparator-sidebar"></div>
                    <div class="comparator-main">
                        <div class="comparator-comparison">
                            <div class="comparator-card current" id="comparator-current"></div>
                            <div class="comparator-vs">
                                <span class="vs-similarity" id="comparator-similarity">—</span>
                            </div>
                            <div class="comparator-card match" id="comparator-match"></div>
                        </div>
                        <div class="comparator-actions" id="comparator-actions"></div>
                        <div class="comparator-thumbnails" id="comparator-thumbnails"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        this.overlay.querySelector('#btn-comparator-close').onclick = () => this.close();
        document.addEventListener('keydown', this._escHandler = (e) => {
            if (e.key === 'Escape' && this.overlay?.classList.contains('open')) this.close();
        });
    }

    _renderSidebar() {
        const sidebar = this.overlay?.querySelector('#comparator-sidebar');
        const count = this.overlay?.querySelector('#comparator-count');
        if (!sidebar) return;

        if (count) count.textContent = `${this.unidentified.length} sin ID`;

        sidebar.innerHTML = this.unidentified.map((p, i) => {
            const hasImg = p.image_url && p.image_url.length > 100;
            const time = new Date(p.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="sidebar-persona ${i === this.currentIndex ? 'active' : ''}" data-index="${i}">
                    ${hasImg ? `<img src="${p.image_url}" class="sidebar-thumb" />` : `<div class="sidebar-thumb placeholder">👤</div>`}
                    <div class="sidebar-info">
                        <span class="sidebar-name">${p.nombre}</span>
                        <span class="sidebar-time">${time}</span>
                    </div>
                </div>
            `;
        }).join('');

        sidebar.querySelectorAll('.sidebar-persona').forEach(el => {
            el.onclick = () => {
                const idx = parseInt(el.dataset.index);
                this.currentIndex = idx;
                this._selectPersona(this.unidentified[idx]);
            };
        });
    }

    _updateSidebarActive() {
        this.overlay?.querySelectorAll('.sidebar-persona').forEach((el, i) => {
            el.classList.toggle('active', i === this.currentIndex);
        });
    }

    _renderCurrent(persona) {
        const el = this.overlay?.querySelector('#comparator-current');
        if (!el) return;
        const hasImg = persona.image_url && persona.image_url.length > 100;

        el.innerHTML = `
            ${hasImg ? `<img src="${persona.image_url}" class="comparator-img" />` : `<div class="comparator-img placeholder">👤</div>`}
            <div class="comparator-meta">
                <span class="comparator-name">${persona.nombre}</span>
                <span class="comparator-detail">${persona.contexto || 'Sin contexto'}</span>
                ${persona.rasgos_fisicos ? `<span class="comparator-detail">${persona.rasgos_fisicos}</span>` : ''}
            </div>
        `;
    }

    _renderMatchLoading() {
        const el = this.overlay?.querySelector('#comparator-match');
        const sim = this.overlay?.querySelector('#comparator-similarity');
        const actions = this.overlay?.querySelector('#comparator-actions');
        if (el) el.innerHTML = `<div class="comparator-loading">Buscando coincidencias...</div>`;
        if (sim) sim.textContent = '...';
        if (actions) actions.innerHTML = '';
    }

    _renderMatch() {
        const el = this.overlay?.querySelector('#comparator-match');
        const sim = this.overlay?.querySelector('#comparator-similarity');
        const actions = this.overlay?.querySelector('#comparator-actions');
        if (!el) return;

        if (this.matches.length === 0 || this.activeMatchIndex >= this.matches.length) {
            this._renderNoMoreMatches();
            return;
        }

        const match = this.matches[this.activeMatchIndex];
        const hasImg = match.image_url && match.image_url.length > 100;
        const simPct = Math.round((match.similarity || 0) * 100);
        const simColor = simPct >= 80 ? '#00d4aa' : simPct >= 60 ? '#e0af68' : '#f7768e';

        el.innerHTML = `
            ${hasImg ? `<img src="${match.image_url}" class="comparator-img" />` : `<div class="comparator-img placeholder">👤</div>`}
            <div class="comparator-meta">
                <span class="comparator-name">${match.nombre || 'Sin nombre'}</span>
                <span class="comparator-detail">${match.contexto || 'Sin contexto'}</span>
                ${match.rasgos_fisicos ? `<span class="comparator-detail">${match.rasgos_fisicos}</span>` : ''}
            </div>
        `;

        if (sim) {
            sim.textContent = `${simPct}%`;
            sim.style.color = simColor;
        }

        if (actions) {
            actions.innerHTML = `
                <button class="btn-comparator link" id="btn-comp-link">Vincular</button>
                <button class="btn-comparator reject" id="btn-comp-reject">No es</button>
                <button class="btn-comparator skip" id="btn-comp-next">Siguiente</button>
            `;
            actions.querySelector('#btn-comp-link').onclick = () => this._linkIdentity(match.id, match.nombre);
            actions.querySelector('#btn-comp-reject').onclick = () => this._rejectMatch();
            actions.querySelector('#btn-comp-next').onclick = () => this._nextPersona();
        }
    }

    _renderNoMoreMatches() {
        const el = this.overlay?.querySelector('#comparator-match');
        const sim = this.overlay?.querySelector('#comparator-similarity');
        const actions = this.overlay?.querySelector('#comparator-actions');

        if (el) el.innerHTML = `<div class="comparator-no-match">Sin coincidencias</div>`;
        if (sim) { sim.textContent = '—'; sim.style.color = ''; }

        if (actions) {
            actions.innerHTML = `
                <div class="new-identity-form">
                    <input type="text" id="comparator-new-name" class="form-input" placeholder="Nombre para esta persona..." />
                    <button class="btn-comparator save" id="btn-comp-save-new">Guardar como nueva</button>
                </div>
                <button class="btn-comparator skip" id="btn-comp-next" style="margin-top:8px;">Siguiente persona</button>
            `;
            actions.querySelector('#btn-comp-save-new').onclick = () => this._saveAsNew();
            actions.querySelector('#btn-comp-next').onclick = () => this._nextPersona();
        }
    }

    _renderThumbnails() {
        const el = this.overlay?.querySelector('#comparator-thumbnails');
        if (!el || this.matches.length <= 1) { if (el) el.innerHTML = ''; return; }

        el.innerHTML = `<span class="thumbnails-label">Otras coincidencias</span><div class="thumbnails-row">` +
            this.matches.map((m, i) => {
                const hasImg = m.image_url && m.image_url.length > 100;
                const simPct = Math.round((m.similarity || 0) * 100);
                return `
                    <div class="thumb-item ${i === this.activeMatchIndex ? 'active' : ''}" data-index="${i}">
                        ${hasImg ? `<img src="${m.image_url}" />` : `<div class="thumb-placeholder">👤</div>`}
                        <span class="thumb-sim">${simPct}%</span>
                    </div>
                `;
            }).join('') + `</div>`;

        el.querySelectorAll('.thumb-item').forEach(thumb => {
            thumb.onclick = () => {
                this.activeMatchIndex = parseInt(thumb.dataset.index);
                this._renderMatch();
                this._renderThumbnails();
            };
        });
    }

    _renderEmpty() {
        const body = this.overlay?.querySelector('.comparator-body');
        if (body) body.innerHTML = `
            <div class="comparator-empty">
                <span style="font-size:2rem;">✅</span>
                <span>Todas las personas tienen identidad asignada</span>
            </div>
        `;
    }

    _renderAllDone() {
        this._renderEmpty();
    }
}
