/**
 * Archives Controller - Mars-Sight AR
 * Main orchestrator for the Archives feature
 */

import { auth } from '../../js/auth.js';
import { api } from '../../js/services/api.js';

// Import modules
import { MissionsManager } from './modules/missions.js';
import { ObjectsGrid } from './modules/objects-grid.js';
import { ObjectModal } from './modules/object-modal.js';
import { TaxonomyFilters } from './modules/taxonomy-filters.js';
import { PersonasGrid } from './modules/personas-grid.js';
import { RutasGrid } from './modules/rutas-grid.js';
import { TelemetryPanel } from './modules/telemetry-panel.js';
import { ModalSystem } from '../../js/components/ModalSystem.js';
import { IdentityComparator } from './modules/identity-comparator.js';

class ArchivesController {
    constructor(container) {
        this.container = container;
        // Data state
        this.currentObjects = [];
        this.filteredObjects = [];
        this.apiCategories = [];
        this.apiTags = [];

        // Filter state
        this.filterCategoryId = '';
        this.filterTagId = '';

        // Cache DOM elements
        this.dom = {
            missionList: document.getElementById('mission-list'),
            grid: document.getElementById('evidence-grid'),
            headerTitle: document.getElementById('current-mission-title'),
            btnFinishMission: document.getElementById('btn-finish-mission'),
            btnDeleteMission: document.getElementById('btn-delete-mission'),

            modal: document.getElementById('detail-modal'),
            btnCloseModal: document.getElementById('btn-close-modal'),

            // Detail Inputs
            img: document.getElementById('detail-img'),
            inpTitle: document.getElementById('inp-detail-title'),
            inpDesc: document.getElementById('inp-detail-desc'),

            // Selects
            inpCategory: document.getElementById('inp-detail-category'),
            inpSub: document.getElementById('inp-detail-subcategory'),
            domGender: document.getElementById('group-gender'),
            inpGender: document.getElementById('inp-detail-gender'),
            tagsSelector: document.getElementById('tags-selector'),

            // Filters
            filterCategory: document.getElementById('filter-category'),
            filterTag: document.getElementById('filter-tag'),

            btnSave: document.getElementById('btn-save-obj'),
            btnDelete: document.getElementById('btn-delete-obj')
        };

        // Initialize modules
        this.missionsManager = new MissionsManager(this);
        this.objectsGrid = new ObjectsGrid(this);
        this.objectModal = new ObjectModal(this);
        this.taxonomyFilters = new TaxonomyFilters(this);
        this.personasGrid = new PersonasGrid(this);
        this.rutasGrid = new RutasGrid(this);
        this.telemetryPanel = new TelemetryPanel(this);
        this.modalSystem = new ModalSystem();
        this.identityComparator = new IdentityComparator(this);

        this.init();
    }

    async init() {
        // Auth check
        const user = await auth.getUser();
        if (!user) {
            window.kepler?.navigate?.('/login') || (window.location.href = '/login');
            return;
        }

        // Load taxonomy data
        await this.taxonomyFilters.loadTaxonomy();

        // Load global stats
        this.loadStats();

        // Bind events
        this.bindEvents();

        // Bind tab switching
        this.bindTabs();

        // Load missions
        await this.missionsManager.loadMissions();
    }

    async loadStats() {
        const stats = await api.getArchivesStats();
        const statsBar = document.getElementById('stats-bar');
        if (!statsBar) return;

        statsBar.innerHTML = `
            <span class="stat-chip">
                Misiones: <span class="stat-value">${stats.total_missions}</span>
            </span>
            <span class="stat-chip active">
                Activas: <span class="stat-value">${stats.active_missions}</span>
            </span>
            <span class="stat-chip">
                Objetos: <span class="stat-value">${stats.total_objects}</span>
            </span>
            ${stats.total_personas > 0 ? `
            <span class="stat-chip">
                Personas: <span class="stat-value">${stats.total_personas}</span>
            </span>` : ''}
            ${stats.total_rutas > 0 ? `
            <span class="stat-chip">
                Rutas: <span class="stat-value">${stats.total_rutas}</span>
            </span>` : ''}
        `;
    }

    bindEvents() {
        // Mobile: back to missions list
        const btnBackMissions = document.getElementById('btn-back-missions');
        if (btnBackMissions) {
            btnBackMissions.addEventListener('click', () => {
                const main = document.querySelector('.archives-main');
                if (main) main.classList.remove('show-content');
            });
        }

        // Modal close
        this.dom.btnCloseModal.addEventListener('click', () => this.objectModal.closeModal());

        // Close modal on overlay click
        this.dom.modal.addEventListener('click', (e) => {
            if (e.target === this.dom.modal) {
                this.objectModal.closeModal();
            }
        });

        // Close modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dom.modal.style.display === 'flex') {
                this.objectModal.closeModal();
            }
        });

        // Save object
        this.dom.btnSave.addEventListener('click', async () => {
            if (this.objectModal.selectedObject) {
                await this.objectModal.saveObject();
            }
        });

        // Delete object
        this.dom.btnDelete.addEventListener('click', async () => {
            if (this.objectModal.selectedObject && await this.confirmAction("¿Eliminar este registro permanentemente?", 'DELETE')) {
                await this.objectModal.deleteObject();
            }
        });

        // Taxonomy filter events
        this.taxonomyFilters.bindFilterEvents();

        // Identity Comparator
        document.getElementById('btn-open-comparator')?.addEventListener('click', () => {
            this.identityComparator.open();
        });
    }

    bindTabs() {
        const tabsContainer = document.getElementById('content-tabs');
        if (!tabsContainer) return;

        tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tabName = btn.dataset.tab;

                // Update active tab button
                tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update active panel
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                const panel = document.getElementById(`panel-${tabName}`);
                if (panel) panel.classList.add('active');

                // Load data for the tab if mission is selected
                const missionId = this.missionsManager.activeMissionId;
                if (missionId) {
                    if (tabName === 'objetos') {
                        // Objects are already loaded, just re-render
                        this.objectsGrid.renderGrid();
                    } else if (tabName === 'personas') {
                        await this.personasGrid.loadPersonas(missionId);
                    } else if (tabName === 'rutas') {
                        await this.rutasGrid.loadRutas(missionId);
                    } else if (tabName === 'telemetria') {
                        await this.telemetryPanel.loadTelemetry(missionId);
                    }
                }
            });
        });
    }

    confirmAction(message, type = 'DELETE') {
        return this.modalSystem.confirm(message, type);
    }
}

/**
 * SPA render entry point
 */
export async function render(container) {
    const [{ default: template }] = await Promise.all([
        import('./archives-template.html?raw'),
        import('./archives.css')
    ]);
    container.innerHTML = template;
    new ArchivesController(container);
}

// Support standalone page (archives.html) — auto-init if no SPA router
if (document.querySelector('.archives-container')) {
    new ArchivesController(document.querySelector('.archives-container').parentElement);
}
