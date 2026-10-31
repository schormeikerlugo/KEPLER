/**
 * Taxonomia Controller - Mars-Sight AR
 * Main orchestrator for Categories, Subcategories, and Tags management
 */

import template from './taxonomia.html?raw';
import './taxonomia.css';

// Import modules
import { CategoriesManager } from './modules/categories.js';
import { SubcategoriesManager } from './modules/subcategories.js';
import { TagsManager } from './modules/tags.js';

export default class TaxonomiaController {
    constructor(container) {
        this.container = container;

        // Initialize modules (will be set after DOM is ready)
        this.categoriesManager = null;
        this.subcategoriesManager = null;
        this.tagsManager = null;

        // DOM cache
        this.dom = {};
    }

    async init() {
        // Only inject template if container is empty (SPA mode)
        // When loaded directly, HTML is already present
        if (!this.container.querySelector('.taxonomia-header')) {
            this.container.innerHTML = template;
        }

        // Cache DOM elements
        this.cacheDOMElements();

        // Initialize modules
        this.categoriesManager = new CategoriesManager(this);
        this.subcategoriesManager = new SubcategoriesManager(this);
        this.tagsManager = new TagsManager(this);

        // Bind events
        this.bindEvents();

        // Load data
        await this.loadData();
    }

    cacheDOMElements() {
        this.dom = {
            // Grids & Containers
            categoriesGrid: document.getElementById('categories-grid'),
            subcategoriesSection: document.getElementById('subcategories-section'),
            subcategoriesTitle: document.getElementById('subcategories-title'),
            subcategoriesList: document.getElementById('subcategories-list'),
            tagsContainer: document.getElementById('tags-container'),

            // Buttons
            btnAddCategory: document.getElementById('btn-add-category'),
            btnAddSubcategory: document.getElementById('btn-add-subcategory'),
            btnAddTag: document.getElementById('btn-add-tag'),

            // Modals
            modalCategory: document.getElementById('modal-category'),
            modalSubcategory: document.getElementById('modal-subcategory'),
            modalTag: document.getElementById('modal-tag'),

            // Forms
            formCategory: document.getElementById('form-category'),
            formSubcategory: document.getElementById('form-subcategory'),
            formTag: document.getElementById('form-tag'),

            // Toast
            toast: document.getElementById('toast')
        };
    }

    bindEvents() {
        // Add buttons
        this.dom.btnAddCategory?.addEventListener('click', () => this.categoriesManager.openCategoryModal());
        this.dom.btnAddSubcategory?.addEventListener('click', () => this.subcategoriesManager.openSubcategoryModal());
        this.dom.btnAddTag?.addEventListener('click', () => this.tagsManager.openTagModal());

        // Cancel buttons
        document.getElementById('btn-cancel-category')?.addEventListener('click', () => this.closeModal(this.dom.modalCategory));
        document.getElementById('btn-cancel-subcategory')?.addEventListener('click', () => this.closeModal(this.dom.modalSubcategory));
        document.getElementById('btn-cancel-tag')?.addEventListener('click', () => this.closeModal(this.dom.modalTag));

        // Form submissions
        this.dom.formCategory?.addEventListener('submit', (e) => this.categoriesManager.handleCategorySubmit(e));
        this.dom.formSubcategory?.addEventListener('submit', (e) => this.subcategoriesManager.handleSubcategorySubmit(e));
        this.dom.formTag?.addEventListener('submit', (e) => this.tagsManager.handleTagSubmit(e));

        // Close modals on overlay click
        [this.dom.modalCategory, this.dom.modalSubcategory, this.dom.modalTag].forEach(modal => {
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal);
            });
        });
    }

    async loadData() {
        await Promise.all([
            this.categoriesManager.loadCategories(),
            this.tagsManager.loadTags()
        ]);
    }

    // Utilities
    closeModal(modal) {
        if (modal) modal.style.display = 'none';
    }

    showToast(message, duration = 3000) {
        if (!this.dom.toast) return;
        this.dom.toast.textContent = message;
        this.dom.toast.style.display = 'block';
        setTimeout(() => {
            this.dom.toast.style.display = 'none';
        }, duration);
    }
}
