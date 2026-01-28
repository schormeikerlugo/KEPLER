/**
 * Taxonomy Filters Module
 * Handles category/subcategory dropdowns and tag filtering
 */

import { taxonomiaApi } from '../../taxonomia/api.js';

// Legacy fallback categories
const LEGACY_CATEGORIES = {
    "PERSONAS": { subs: ["Civil", "Trabajador", "Desconocido"], hasGender: true },
    "ANIMALES": { subs: ["Mascota", "Ave", "Fauna Silvestre"], hasGender: true },
    "ESTRUCTURAS": { subs: ["Puente", "Refugio", "Vehículo"], hasGender: false },
    "Sin Clasificar": { subs: ["Genérico"], hasGender: false }
};

export class TaxonomyFilters {
    constructor(controller) {
        this.controller = controller;
    }

    get dom() {
        return this.controller.dom;
    }

    async loadTaxonomy() {
        try {
            this.controller.apiCategories = await taxonomiaApi.getCategories();
            this.controller.apiTags = await taxonomiaApi.getTags();
            this.populateFilterDropdowns();
        } catch (e) {
            console.error('Error loading taxonomy:', e);
        }
    }

    populateFilterDropdowns() {
        const { apiCategories, apiTags } = this.controller;

        // Category filter
        if (this.dom.filterCategory) {
            this.dom.filterCategory.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">Todas las Categorías</option>';
            apiCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nombre;
                opt.style.background = '#1a1a2e';
                opt.style.color = '#fff';
                this.dom.filterCategory.appendChild(opt);
            });
        }

        // Tag filter
        if (this.dom.filterTag) {
            this.dom.filterTag.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">Todas las Etiquetas</option>';
            apiTags.forEach(tag => {
                const opt = document.createElement('option');
                opt.value = tag.id;
                opt.textContent = tag.nombre;
                opt.style.background = '#1a1a2e';
                opt.style.color = '#fff';
                this.dom.filterTag.appendChild(opt);
            });
        }
    }

    populateCategories(selectedCatId = null) {
        const catSelect = this.dom.inpCategory;
        const { apiCategories } = this.controller;

        catSelect.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">-- Seleccionar Categoría --</option>';

        if (apiCategories && apiCategories.length > 0) {
            apiCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nombre;
                opt.style.background = '#1a1a2e';
                opt.style.color = '#fff';
                if (cat.id === selectedCatId) opt.selected = true;
                catSelect.appendChild(opt);
            });
        } else {
            Object.keys(LEGACY_CATEGORIES).forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                opt.style.background = '#1a1a2e';
                opt.style.color = '#fff';
                catSelect.appendChild(opt);
            });
        }
    }

    async updateSubcategoriesFromApi(categoryId) {
        const subSelect = this.dom.inpSub;
        subSelect.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">Cargando...</option>';

        if (!categoryId) {
            subSelect.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">Seleccionar primero categoría</option>';
            this.dom.domGender.style.display = 'none';
            return;
        }

        try {
            const subcats = await taxonomiaApi.getSubcategories(categoryId);
            subSelect.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">-- Seleccionar --</option>';

            subcats.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub.id;
                opt.textContent = sub.nombre;
                opt.style.background = '#1a1a2e';
                opt.style.color = '#fff';
                subSelect.appendChild(opt);
            });

            this.dom.domGender.style.display = 'none';
        } catch (e) {
            console.error('Error loading subcategories:', e);
            subSelect.innerHTML = '<option value="" style="background:#1a1a2e;color:#fff;">Error al cargar</option>';
        }
    }

    // Legacy fallback
    updateSubcategories(category, selectedSub = null) {
        const config = LEGACY_CATEGORIES[category];
        const subSelect = this.dom.inpSub;
        subSelect.innerHTML = '';

        if (!config) {
            subSelect.innerHTML = '<option value="">Generico</option>';
            this.dom.domGender.style.display = 'none';
            return;
        }

        config.subs.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            if (sub === selectedSub) opt.selected = true;
            subSelect.appendChild(opt);
        });

        if (config.hasGender) {
            this.dom.domGender.style.display = 'block';
        } else {
            this.dom.domGender.style.display = 'none';
            this.dom.inpGender.value = "";
        }
    }

    bindFilterEvents() {
        if (this.dom.filterCategory) {
            this.dom.filterCategory.addEventListener('change', () => {
                this.controller.filterCategoryId = this.dom.filterCategory.value;
                this.controller.objectsGrid.applyFilters();
            });
        }

        if (this.dom.filterTag) {
            this.dom.filterTag.addEventListener('change', () => {
                this.controller.filterTagId = this.dom.filterTag.value;
                this.controller.objectsGrid.applyFilters();
            });
        }

        // Category change in modal
        this.dom.inpCategory.addEventListener('change', async () => {
            await this.updateSubcategoriesFromApi(this.dom.inpCategory.value);
        });
    }
}
