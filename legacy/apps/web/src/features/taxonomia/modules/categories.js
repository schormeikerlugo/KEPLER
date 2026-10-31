/**
 * Categories Module
 * Handles category CRUD operations and rendering
 */

import { taxonomiaApi } from '../api.js';

// Icon mapping
const ICON_MAP = {
    'folder': '📁',
    'user': '👤',
    'paw': '🐾',
    'car': '🚗',
    'map-pin': '📍',
    'home': '🏠',
    'smartphone': '📱',
    'coffee': '☕',
    'alert-triangle': '⚠️',
    'briefcase': '💼',
    'leaf': '🌿',
    'building': '🏗️',
    'help-circle': '❓'
};

export class CategoriesManager {
    constructor(controller) {
        this.controller = controller;
        this.categories = [];
        this.selectedCategoryId = null;
        this.editingCategoryId = null;
    }

    get dom() {
        return this.controller.dom;
    }

    async loadCategories() {
        try {
            this.categories = await taxonomiaApi.getCategories();
            this.renderCategories();
        } catch (e) {
            console.error('Error loading categories:', e);
            this.controller.showToast('Error al cargar categorías');
        }
    }

    renderCategories() {
        if (!this.dom.categoriesGrid) return;

        if (this.categories.length === 0) {
            this.dom.categoriesGrid.innerHTML = '<div class="loading-placeholder">No hay categorías</div>';
            return;
        }

        this.dom.categoriesGrid.innerHTML = this.categories.map(cat => `
            <div class="category-card ${this.selectedCategoryId === cat.id ? 'selected' : ''}" 
                 data-id="${cat.id}"
                 style="--cat-color: ${cat.color}">
                <div class="category-icon">${ICON_MAP[cat.icono] || '📁'}</div>
                <div class="category-name">${cat.nombre}</div>
                <div class="category-count">${cat.descripcion || ''}</div>
                <div class="category-actions">
                    <button class="btn-icon edit" data-action="edit" data-id="${cat.id}">✏️</button>
                    <button class="btn-icon delete" data-action="delete" data-id="${cat.id}">🗑️</button>
                </div>
            </div>
        `).join('');

        // Bind click events
        this.dom.categoriesGrid.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const id = e.target.dataset.id || card.dataset.id;

                if (action === 'edit') {
                    this.openCategoryModal(id);
                } else if (action === 'delete') {
                    this.deleteCategory(id);
                } else {
                    this.selectCategory(id);
                }
            });
        });
    }

    async selectCategory(categoryId) {
        this.selectedCategoryId = categoryId;
        this.renderCategories();

        const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            this.dom.subcategoriesTitle.textContent = `📂 ${category.nombre} - Subcategorías`;
            this.dom.subcategoriesSection.style.display = 'block';
            await this.controller.subcategoriesManager.loadSubcategories(categoryId);
        }
    }

    openCategoryModal(editId = null) {
        this.editingCategoryId = editId;
        const title = document.getElementById('modal-category-title');

        if (editId) {
            const cat = this.categories.find(c => c.id === editId);
            if (cat) {
                title.textContent = 'Editar Categoría';
                document.getElementById('cat-nombre').value = cat.nombre;
                document.getElementById('cat-descripcion').value = cat.descripcion || '';
                document.getElementById('cat-color').value = cat.color || '#3498db';
                document.getElementById('cat-icono').value = cat.icono || 'folder';
            }
        } else {
            title.textContent = 'Nueva Categoría';
            this.dom.formCategory.reset();
        }

        this.dom.modalCategory.style.display = 'flex';
    }

    async handleCategorySubmit(e) {
        e.preventDefault();

        const data = {
            nombre: document.getElementById('cat-nombre').value,
            descripcion: document.getElementById('cat-descripcion').value,
            color: document.getElementById('cat-color').value,
            icono: document.getElementById('cat-icono').value
        };

        try {
            let result;
            if (this.editingCategoryId) {
                result = await taxonomiaApi.updateCategory(this.editingCategoryId, data);
            } else {
                result = await taxonomiaApi.createCategory(data);
            }

            if (result.success) {
                this.controller.showToast(this.editingCategoryId ? 'Categoría actualizada' : 'Categoría creada');
                this.controller.closeModal(this.dom.modalCategory);
                await this.loadCategories();
            } else {
                this.controller.showToast(`Error: ${result.error}`);
            }
        } catch (e) {
            this.controller.showToast('Error al guardar');
        }
    }

    async deleteCategory(categoryId) {
        if (!confirm('¿Eliminar esta categoría y todas sus subcategorías?')) return;

        try {
            const result = await taxonomiaApi.deleteCategory(categoryId);
            if (result.success) {
                this.controller.showToast('Categoría eliminada');
                if (this.selectedCategoryId === categoryId) {
                    this.selectedCategoryId = null;
                    this.dom.subcategoriesSection.style.display = 'none';
                }
                await this.loadCategories();
            }
        } catch (e) {
            this.controller.showToast('Error al eliminar');
        }
    }
}
