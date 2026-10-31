/**
 * Subcategories Module
 * Handles subcategory CRUD operations and rendering
 */

import { taxonomiaApi } from '../api.js';

export class SubcategoriesManager {
    constructor(controller) {
        this.controller = controller;
        this.subcategories = [];
    }

    get dom() {
        return this.controller.dom;
    }

    async loadSubcategories(categoryId) {
        try {
            this.subcategories = await taxonomiaApi.getSubcategories(categoryId);
            this.renderSubcategories();
        } catch (e) {
            console.error('Error loading subcategories:', e);
        }
    }

    renderSubcategories() {
        if (!this.dom.subcategoriesList) return;

        if (this.subcategories.length === 0) {
            this.dom.subcategoriesList.innerHTML = '<div class="loading-placeholder">No hay subcategorías. ¡Crea una!</div>';
            return;
        }

        this.dom.subcategoriesList.innerHTML = this.subcategories.map(sub => `
            <div class="subcategory-item" data-id="${sub.id}">
                <div>
                    <span class="subcategory-name">${sub.nombre}</span>
                    <span class="subcategory-desc">${sub.descripcion || ''}</span>
                </div>
                <button class="btn-icon delete" data-action="delete">🗑️</button>
            </div>
        `).join('');

        // Bind delete events
        this.dom.subcategoriesList.querySelectorAll('.btn-icon.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.subcategory-item').dataset.id;
                this.deleteSubcategory(id);
            });
        });
    }

    openSubcategoryModal() {
        const selectedCategoryId = this.controller.categoriesManager.selectedCategoryId;

        if (!selectedCategoryId) {
            this.controller.showToast('Selecciona una categoría primero');
            return;
        }

        document.getElementById('subcat-categoria-id').value = selectedCategoryId;
        this.dom.formSubcategory.reset();
        this.dom.modalSubcategory.style.display = 'flex';
    }

    async handleSubcategorySubmit(e) {
        e.preventDefault();

        const data = {
            categoria_id: document.getElementById('subcat-categoria-id').value,
            nombre: document.getElementById('subcat-nombre').value,
            descripcion: document.getElementById('subcat-descripcion').value
        };

        try {
            const result = await taxonomiaApi.createSubcategory(data);
            if (result.success) {
                this.controller.showToast('Subcategoría creada');
                this.controller.closeModal(this.dom.modalSubcategory);
                await this.loadSubcategories(this.controller.categoriesManager.selectedCategoryId);
            } else {
                this.controller.showToast(`Error: ${result.error}`);
            }
        } catch (e) {
            this.controller.showToast('Error al guardar');
        }
    }

    async deleteSubcategory(subcategoryId) {
        if (!confirm('¿Eliminar esta subcategoría?')) return;

        try {
            const result = await taxonomiaApi.deleteSubcategory(subcategoryId);
            if (result.success) {
                this.controller.showToast('Subcategoría eliminada');
                await this.loadSubcategories(this.controller.categoriesManager.selectedCategoryId);
            }
        } catch (e) {
            this.controller.showToast('Error al eliminar');
        }
    }
}