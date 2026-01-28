/**
 * Object Modal Module
 * Handles object detail view, editing, and deletion
 */

import { api } from '../../../js/services/api.js';
import { taxonomiaApi } from '../../taxonomia/api.js';

export class ObjectModal {
    constructor(controller) {
        this.controller = controller;
        this.selectedObject = null;
        this.selectedTagIds = [];
    }

    get dom() {
        return this.controller.dom;
    }

    openDetail(obj) {
        this.selectedObject = obj;

        // Basic Fields
        this.dom.inpTitle.value = obj.nombre || '';
        this.dom.inpDesc.value = obj.descripcion || (obj.metadata?.description || '');

        let imgSrc = '../../assets/placeholder-mars.jpg';
        if (obj.metadata && obj.metadata.image_base64) {
            imgSrc = obj.metadata.image_base64;
        }
        this.dom.img.src = imgSrc;

        // Populate Categories
        this.controller.taxonomyFilters.populateCategories(obj.categoria_id || null);

        // Load subcategories if category exists
        if (obj.categoria_id) {
            this.controller.taxonomyFilters.updateSubcategoriesFromApi(obj.categoria_id).then(() => {
                if (obj.subcategoria_id && this.dom.inpSub) {
                    this.dom.inpSub.value = obj.subcategoria_id;
                }
            });
        } else {
            this.dom.inpSub.innerHTML = '<option value="">Seleccionar categoría primero</option>';
        }

        // Gender
        this.dom.inpGender.value = obj.genero || "";

        // Tags
        this.renderTagsSelector([]);

        this.dom.modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }

    closeModal() {
        this.dom.modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        this.selectedObject = null;
    }

    renderTagsSelector(selectedTagIds = []) {
        if (!this.dom.tagsSelector) return;

        this.selectedTagIds = [...selectedTagIds];
        const apiTags = this.controller.apiTags;

        this.dom.tagsSelector.innerHTML = apiTags.map(tag => {
            const isSelected = this.selectedTagIds.includes(tag.id);
            return `
                <div class="tag-chip ${isSelected ? 'selected' : ''}" 
                     data-id="${tag.id}" 
                     style="padding: 5px 12px; border-radius: 15px; cursor: pointer; font-size: 0.8rem;
                            background: ${isSelected ? tag.color : 'rgba(255,255,255,0.1)'};
                            color: ${isSelected ? '#fff' : '#888'};
                            border: 1px solid ${tag.color}44;
                            transition: all 0.2s;">
                    ${tag.nombre}
                </div>
            `;
        }).join('');

        this.dom.tagsSelector.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tagId = chip.dataset.id;
                if (this.selectedTagIds.includes(tagId)) {
                    this.selectedTagIds = this.selectedTagIds.filter(id => id !== tagId);
                } else {
                    this.selectedTagIds.push(tagId);
                }
                this.renderTagsSelector(this.selectedTagIds);
            });
        });
    }

    async saveObject() {
        if (!this.selectedObject) return;

        const newTitle = this.dom.inpTitle.value;
        const newDesc = this.dom.inpDesc.value;
        const newCatId = this.dom.inpCategory.value;
        const newSubId = this.dom.inpSub.value;
        const newGen = this.dom.inpGender.value;

        const payload = {
            nombre: newTitle,
            descripcion: newDesc,
            tipo: newCatId ? (this.controller.apiCategories.find(c => c.id === newCatId)?.nombre || 'Desconocido') : this.selectedObject.tipo,
            subcategoria: newSubId ? 'categorizado' : this.selectedObject.subcategoria,
            genero: newGen
        };

        this.dom.btnSave.textContent = "GUARDANDO...";

        const success = await api.updateObject(this.selectedObject.id, payload);

        if (success) {
            if (newCatId || this.selectedTagIds.length > 0) {
                try {
                    await taxonomiaApi.assignTaxonomy(this.selectedObject.id, {
                        categoria_id: newCatId || null,
                        subcategoria_id: newSubId || null,
                        etiqueta_ids: this.selectedTagIds
                    });
                } catch (e) {
                    console.error('Error saving taxonomy:', e);
                }
            }

            // Update local object
            Object.assign(this.selectedObject, {
                nombre: newTitle,
                descripcion: newDesc,
                categoria_id: newCatId,
                subcategoria_id: newSubId,
                genero: newGen
            });

            if (this.selectedObject.metadata) {
                this.selectedObject.metadata.description = newDesc;
            }

            this.controller.filteredObjects = [...this.controller.currentObjects];
            this.controller.objectsGrid.renderGrid();
            this.closeModal();
        } else {
            alert("Error al guardar cambios.");
        }
        this.dom.btnSave.textContent = "GUARDAR CAMBIOS";
    }

    async deleteObject() {
        if (!this.selectedObject) return;

        this.dom.btnDelete.textContent = "...";
        const success = await api.deleteObject(this.selectedObject.id);

        if (success) {
            this.controller.currentObjects = this.controller.currentObjects.filter(
                o => o.id !== this.selectedObject.id
            );
            this.controller.filteredObjects = this.controller.filteredObjects.filter(
                o => o.id !== this.selectedObject.id
            );
            this.controller.objectsGrid.renderGrid();
            this.closeModal();
        } else {
            alert("Error al eliminar.");
        }
        this.dom.btnDelete.textContent = "ELIMINAR";
    }
}
