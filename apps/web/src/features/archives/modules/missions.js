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
    }

    get dom() {
        return this.controller.dom;
    }

    async loadMissions() {
        this.dom.missionList.innerHTML = '<div style="padding:20px; color:#aaa;">Cargando...</div>';
        this.missions = await api.getMissions();
        this.renderMissions();

        if (this.missions.length > 0) {
            await this.selectMission(this.missions[0].id);
        } else {
            await this.selectOrphaned();
        }
    }

    async selectOrphaned() {
        this.activeMissionId = 'orphaned';
        this.renderMissions();
        this.dom.headerTitle.textContent = "OBJETOS SIN MISIÓN";
        this.dom.grid.innerHTML = '<div style="padding:20px;">Buscando huérfanos...</div>';

        this.controller.currentObjects = await api.getOrphanedObjects();
        this.controller.objectsGrid.renderGrid();
    }

    renderMissions() {
        const existingHeader = this.dom.missionList.querySelector('.panel-header');
        const existingFilters = this.dom.missionList.querySelector('.status-filters');

        this.dom.missionList.innerHTML = '';

        if (existingHeader) this.dom.missionList.appendChild(existingHeader);
        if (existingFilters) this.dom.missionList.appendChild(existingFilters);

        if (!existingHeader) {
            const header = document.createElement('div');
            header.className = 'panel-header';
            header.innerHTML = '<span class="panel-title">Misiones Generales</span>';
            this.dom.missionList.appendChild(header);

            const filters = document.createElement('div');
            filters.className = 'status-filters';
            filters.innerHTML = `
                <span class="status-badge"><span class="status-dot ongoing"></span> En Curso</span>
                <span class="status-badge"><span class="status-dot active"></span> Activo</span>
                <span class="status-badge"><span class="status-dot completed"></span> Completado</span>
            `;
            this.dom.missionList.appendChild(filters);
        }

        // Get currently "En Vivo" mission from local storage
        const currentLiveId = localStorage.getItem('mars_current_mission_id');

        this.missions.forEach(m => {
            const card = document.createElement('div');

            // Logic: 
            // 1. Live (En Curso) = Active AND matches currentLiveId
            // 2. Active (Activo) = Active BUT NOT currentLiveId
            // 3. Completed = Finalized

            let statusClass = 'status-completed';
            if (m.estado === 'activa') {
                if (m.id == currentLiveId) {
                    statusClass = 'status-live'; // Green
                } else {
                    statusClass = 'status-active'; // Blue
                }
            }

            card.className = `mission-card ${statusClass} ${this.activeMissionId === m.id ? 'active' : ''}`;
            card.onclick = () => this.selectMission(m.id);

            const dateStr = new Date(m.inicio_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            }) + ' - ' + new Date(m.inicio_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            card.innerHTML = `
                <div class="mission-name">${m.titulo || m.codigo}</div>
                <div class="mission-meta">📅 ${dateStr}</div>
                <div class="mission-meta">📍 ${m.zona || 'Sin ubicación'}</div>
            `;
            this.dom.missionList.appendChild(card);
        });

        // Orphaned card
        const orphanCard = document.createElement('div');
        orphanCard.className = `mission-card ${this.activeMissionId === 'orphaned' ? 'active' : ''}`;
        orphanCard.onclick = () => this.selectOrphaned();
        orphanCard.innerHTML = `
            <div class="mission-name">SIN ASIGNAR</div>
            <div class="mission-meta">📦 Items sueltos</div>
        `;
        this.dom.missionList.appendChild(orphanCard);
    }

    async selectMission(id) {
        this.activeMissionId = id;
        this.renderMissions();

        const mission = this.missions.find(m => m.id === id);
        const isOrphaned = id === 'orphaned';
        const titleText = isOrphaned ? "OBJETOS SIN MISIÓN" : (mission.titulo || mission.codigo).toUpperCase();

        // Set Title text
        this.dom.headerTitle.textContent = titleText;

        // Reset Buttons
        if (this.dom.btnFinishMission) this.dom.btnFinishMission.style.display = 'none';
        if (this.dom.btnDeleteMission) this.dom.btnDeleteMission.style.display = 'none';

        // Show Buttons based on state
        if (mission && !isOrphaned) {
            // Show Delete
            if (this.dom.btnDeleteMission) this.dom.btnDeleteMission.style.display = 'inline-block';

            // Show Finish if active
            if (mission.estado === 'activa' && this.dom.btnFinishMission) {
                this.dom.btnFinishMission.style.display = 'inline-block';
            }
        }

        this.bindMissionActions(mission);

        this.dom.grid.innerHTML = '<div style="padding:20px;">Cargando registros...</div>';
        this.controller.currentObjects = await api.getMissionObjects(id);
        this.controller.filteredObjects = [...this.controller.currentObjects];
        this.controller.objectsGrid.renderGrid();
    }

    bindMissionActions(mission) {
        console.log("Binding actions for mission:", mission?.id);

        // 1. Finish Button
        const btnFinish = this.dom.btnFinishMission;
        console.log("Btn Finish found:", !!btnFinish);

        if (btnFinish && mission) {
            btnFinish.onclick = async (e) => {
                console.log("Finish clicked");
                e.stopPropagation();

                // Use Custom Confirmation (FINISH / BLUE)
                if (await this.controller.confirmAction("¿Forzar finalización de esta misión?", 'FINISH')) {
                    btnFinish.textContent = "...";
                    await api.endMission(mission.id);
                    await this.loadMissions();
                    btnFinish.textContent = "Finalizar";
                }
            };
        }

        // 2. Delete Button
        const btnDelete = this.dom.btnDeleteMission;
        console.log("Btn Delete found:", !!btnDelete);

        if (btnDelete && mission) {
            btnDelete.onclick = async (e) => {
                console.log("Delete clicked");
                e.stopPropagation();

                // Use Custom Confirmation (DELETE / RED)
                if (await this.controller.confirmAction("⚠️ ¿ELIMINAR MISIÓN Y TODOS SUS OBJETOS?\n\nEsta acción no se puede deshacer.", 'DELETE')) {
                    btnDelete.textContent = "...";
                    console.log("Calling api.deleteMission...");
                    const res = await api.deleteMission(mission.id);
                    console.log("Delete result:", res);

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
