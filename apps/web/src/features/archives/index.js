/**
 * Archives Controller - Mars-Sight AR
 * Main orchestrator for the Archives feature
 */

import { auth } from '../../js/auth.js';

// Import modules
import { MissionsManager } from './modules/missions.js';
import { ObjectsGrid } from './modules/objects-grid.js';
import { ObjectModal } from './modules/object-modal.js';
import { TaxonomyFilters } from './modules/taxonomy-filters.js';
import { ModalSystem } from '../../js/components/ModalSystem.js';

class ArchivesController {
    constructor() {
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
        this.modalSystem = new ModalSystem(); // Init new system

        this.init();
    }

    async init() {
        // Auth check
        const user = await auth.getUser();
        if (!user) {
            window.location.href = '../../index.html';
            return;
        }

        // Load taxonomy data
        await this.taxonomyFilters.loadTaxonomy();

        // Bind events
        this.bindEvents();

        // Load missions
        await this.missionsManager.loadMissions();
    }

    bindEvents() {
        // Modal close
        this.dom.btnCloseModal.addEventListener('click', () => this.objectModal.closeModal());

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
    }

    /**
     * Shows a custom confirmation modal using the system
     * @param {string} message 
     * @param {string} type - 'DELETE' | 'FINISH' | 'CONFIRM'
     * @returns {Promise<boolean>}
     */
    confirmAction(message, type = 'DELETE') {
        return this.modalSystem.confirm(message, type);
    }
}

// Initialize
new ArchivesController();
