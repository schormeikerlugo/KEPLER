/**
 * Missions Module
 * Handles mission loading, rendering, and selection
 */

import { api } from '../../../js/services/api.js';

export class MissionsManager {
    constructor(controller) {
        this.controller = controller;
        this.missions = [];
        this.activeMissionId = null;
        this.abortController = null;
    }

    get dom() {
        return this.controller.dom;
    }

    async loadMissions() {
        this.dom.missionList.innerHTML = '<div style="padding:20px; color:#555; font-size:0.85rem;">Cargando misiones...</div>';
        this.missions = await api.getMissions();
        this.renderMissions();

        if (this.missions.length > 0) {
            // On mobile: don't auto-select, let user pick
            if (window.innerWidth <= 768) {
                this.dom.headerTitle.textContent = 'Selecciona una Mision';
            } else {
                await this.selectMission(this.missions[0].id);
            }
        } else {
            await this.selectOrphaned();
        }
    }

    async selectOrphaned() {
        this.activeMissionId = 'orphaned';
        this.renderMissions();
        this.dom.headerTitle.textContent = "Sin Asignar";
        this.dom.grid.innerHTML = '<div style="padding:20px; color:#555;">Buscando huérfanos...</div>';

        // Hide mission action buttons
        if (this.dom.btnFinishMission) this.dom.btnFinishMission.style.display = 'none';
        if (this.dom.btnDeleteMission) this.dom.btnDeleteMission.style.display = 'none';

        this.controller.currentObjects = await api.getOrphanedObjects();
        this.controller.filteredObjects = [...this.controller.currentObjects];
        this.controller.objectsGrid.renderGrid();

        // Update tab counts
        this.controller.objectsGrid.updateTabCount();
        const personasCount = document.getElementById('tab-count-personas');
        const rutasCount = document.getElementById('tab-count-rutas');
        if (personasCount) personasCount.textContent = '0';
        if (rutasCount) rutasCount.textContent = '0';
    }

    renderMissions() {
        // Keep header and filters
        const existingHeader = this.dom.missionList.querySelector('.panel-header');
        const existingFilters = this.dom.missionList.querySelector('.status-filters');

        this.dom.missionList.innerHTML = '';

        if (existingHeader) this.dom.missionList.appendChild(existingHeader);
        if (existingFilters) this.dom.missionList.appendChild(existingFilters);

        if (!existingHeader) {
            const header = document.createElement('div');
            header.className = 'panel-header';
            header.innerHTML = '<span class="panel-title">Misiones</span>';
            this.dom.missionList.appendChild(header);

            const filters = document.createElement('div');
            filters.className = 'status-filters';
            filters.innerHTML = `
                <span class="status-badge live">En Curso</span>
                <span class="status-badge active">Activa</span>
                <span class="status-badge completed">Completada</span>
            `;
            this.dom.missionList.appendChild(filters);
        }

        const currentLiveId = localStorage.getItem('mars_current_mission_id');

        this.missions.forEach((m, index) => {
            const card = document.createElement('div');

            let statusClass = 'status-completed';
            if (m.estado === 'activa') {
                statusClass = m.id == currentLiveId ? 'status-live' : 'status-active';
            }

            card.className = `mission-card ${statusClass} ${this.activeMissionId === m.id ? 'active' : ''}`;
            card.style.animationDelay = `${index * 0.04}s`;
            card.onclick = () => this.selectMission(m.id);

            const dateStr = new Date(m.inicio_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            // Mission counts from backend
            const objCount = m.objeto_count || 0;
            const perCount = m.persona_count || 0;
            const rutCount = m.ruta_count || 0;

            // Extra info from new columns
            const terreno = m.tipo_terreno ? `<span class="mission-count-badge">${m.tipo_terreno}</span>` : '';
            const dificultad = m.dificultad ? `<span class="mission-count-badge">${m.dificultad}</span>` : '';

            card.innerHTML = `
                <div class="mission-name">${m.titulo || m.codigo}</div>
                <div class="mission-meta">${dateStr}${m.zona ? ' · ' + m.zona : ''}</div>
                <div class="mission-counts">
                    ${objCount > 0 ? `<span class="mission-count-badge"><span class="count-num">${objCount}</span> objetos</span>` : ''}
                    ${perCount > 0 ? `<span class="mission-count-badge"><span class="count-num">${perCount}</span> personas</span>` : ''}
                    ${rutCount > 0 ? `<span class="mission-count-badge"><span class="count-num">${rutCount}</span> rutas</span>` : ''}
                    ${terreno}
                    ${dificultad}
                </div>
            `;
            this.dom.missionList.appendChild(card);
        });

        // Orphaned card
        const orphanCard = document.createElement('div');
        orphanCard.className = `mission-card orphan-card ${this.activeMissionId === 'orphaned' ? 'active' : ''}`;
        orphanCard.onclick = () => this.selectOrphaned();
        orphanCard.innerHTML = `
            <div class="mission-name">Sin Asignar</div>
            <div class="mission-meta">Objetos sueltos</div>
        `;
        this.dom.missionList.appendChild(orphanCard);
    }

    async selectMission(id) {
        // Abort previous in-flight requests
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        this.activeMissionId = id;
        this.renderMissions();

        // Mobile: switch to content screen
        const main = document.querySelector('.archives-main');
        if (main && window.innerWidth <= 768) {
            main.classList.add('show-content');
        }

        const mission = this.missions.find(m => m.id === id);
        const isOrphaned = id === 'orphaned';
        const titleText = isOrphaned ? "Sin Asignar" : (mission?.titulo || mission?.codigo || '').toUpperCase();

        this.dom.headerTitle.textContent = titleText;

        // Reset Buttons
        if (this.dom.btnFinishMission) this.dom.btnFinishMission.style.display = 'none';
        if (this.dom.btnDeleteMission) this.dom.btnDeleteMission.style.display = 'none';

        if (mission && !isOrphaned) {
            if (this.dom.btnDeleteMission) this.dom.btnDeleteMission.style.display = 'inline-block';
            if (mission.estado === 'activa' && this.dom.btnFinishMission) {
                this.dom.btnFinishMission.style.display = 'inline-block';
            }
        }

        this.bindMissionActions(mission);

        // Load data for current active tab
        await this.loadCurrentTabData(id);
    }

    async loadCurrentTabData(missionId) {
        const activeTab = document.querySelector('.tab-btn.active');
        const tabName = activeTab?.dataset.tab || 'objetos';

        if (tabName === 'objetos' || !tabName) {
            this.dom.grid.innerHTML = '<div style="padding:20px; color:#555;">Cargando registros...</div>';
            this.controller.currentObjects = await api.getMissionObjects(missionId);
            this.controller.filteredObjects = [...this.controller.currentObjects];
            this.controller.objectsGrid.renderGrid();
            this.controller.objectsGrid.updateTabCount();
        }

        if (this.controller.personasGrid) {
            await this.controller.personasGrid.loadPersonas(missionId);
        }
        if (this.controller.rutasGrid) {
            await this.controller.rutasGrid.loadRutas(missionId);
        }
        if (this.controller.telemetryPanel) {
            await this.controller.telemetryPanel.loadTelemetry(missionId);
        }
    }

    bindMissionActions(mission) {
        const btnFinish = this.dom.btnFinishMission;
        if (btnFinish && mission) {
            btnFinish.onclick = async (e) => {
                e.stopPropagation();
                if (await this.controller.confirmAction("¿Forzar finalización de esta misión?", 'FINISH')) {
                    btnFinish.textContent = "...";
                    await api.endMission(mission.id);
                    await this.loadMissions();
                    btnFinish.textContent = "Finalizar";
                }
            };
        }

        const btnDelete = this.dom.btnDeleteMission;
        if (btnDelete && mission) {
            btnDelete.onclick = async (e) => {
                e.stopPropagation();
                if (await this.controller.confirmAction("¿ELIMINAR MISIÓN Y TODOS SUS DATOS?\n\nEsta acción no se puede deshacer.", 'DELETE')) {
                    btnDelete.textContent = "...";
                    const res = await api.deleteMission(mission.id);
                    if (res.success) {
                        await this.loadMissions();
                    } else {
                        alert("Error: " + res.error);
                    }
                    btnDelete.textContent = "Eliminar";
                }
            };
        }
    }
}
