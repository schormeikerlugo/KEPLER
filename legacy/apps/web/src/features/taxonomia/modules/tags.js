/**
 * Tags Module
 * Handles tag CRUD operations and rendering
 */

import { taxonomiaApi } from '../api.js';

export class TagsManager {
    constructor(controller) {
        this.controller = controller;
        this.tags = [];
    }

    get dom() {
        return this.controller.dom;
    }

    async loadTags() {
        try {
            this.tags = await taxonomiaApi.getTags();
            this.renderTags();
        } catch (e) {
            console.error('Error loading tags:', e);
        }
    }

    renderTags() {
        if (!this.dom.tagsContainer) return;

        if (this.tags.length === 0) {
            this.dom.tagsContainer.innerHTML = '<div class="loading-placeholder">No hay etiquetas</div>';
            return;
        }

        this.dom.tagsContainer.innerHTML = this.tags.map(tag => `
            <div class="tag-item" style="background: ${tag.color}22; border-color: ${tag.color}55;" data-id="${tag.id}">
                <span class="tag-color-dot" style="background: ${tag.color}"></span>
                <span>${tag.nombre}</span>
                <button class="tag-delete" data-action="delete">×</button>
            </div>
        `).join('');

        // Bind delete events
        this.dom.tagsContainer.querySelectorAll('.tag-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.tag-item').dataset.id;
                this.deleteTag(id);
            });
        });
    }

    openTagModal() {
        this.dom.formTag.reset();
        this.dom.modalTag.style.display = 'flex';
    }

    async handleTagSubmit(e) {
        e.preventDefault();

        const data = {
            nombre: document.getElementById('tag-nombre').value,
            color: document.getElementById('tag-color').value
        };

        try {
            const result = await taxonomiaApi.createTag(data);
            if (result.success) {
                this.controller.showToast('Etiqueta creada');
                this.controller.closeModal(this.dom.modalTag);
                await this.loadTags();
            } else {
                this.controller.showToast(`Error: ${result.error}`);
            }
        } catch (e) {
            this.controller.showToast('Error al guardar');
        }
    }

    async deleteTag(tagId) {
        if (!confirm('¿Eliminar esta etiqueta?')) return;

        try {
            const result = await taxonomiaApi.deleteTag(tagId);
            if (result.success) {
                this.controller.showToast('Etiqueta eliminada');
                await this.loadTags();
            }
        } catch (e) {
            this.controller.showToast('Error al eliminar');
        }
    }
}
