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

        // Populate metadata section
        this.renderMetadata(obj);

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

    renderMetadata(obj) {
        const container = document.getElementById('modal-metadata');
        if (!container) return;

        const confidence = obj.metadata?.confidence;
        const heading = obj.metadata?.heading;
        const source = obj.metadata?.source;
        const dateStr = new Date(obj.created_at).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // GPS coordinates
        let gpsLink = '';
        if (obj.metadata?.lat && obj.metadata?.lng) {
            const lat = obj.metadata.lat;
            const lng = obj.metadata.lng;
            gpsLink = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lng.toFixed(5)}</a>`;
        }

        container.innerHTML = `
            ${confidence ? `
            <div class="meta-item">
                <span class="meta-label">Confianza</span>
                <span class="meta-value">${(confidence * 100).toFixed(0)}%</span>
            </div>` : ''}
            ${source ? `
            <div class="meta-item">
                <span class="meta-label">Fuente</span>
                <span class="meta-value">${source}</span>
            </div>` : ''}
            <div class="meta-item">
                <span class="meta-label">Fecha</span>
                <span class="meta-value">${dateStr}</span>
            </div>
            ${gpsLink ? `
            <div class="meta-item">
                <span class="meta-label">GPS</span>
                <span class="meta-value">${gpsLink}</span>
            </div>` : ''}
            ${heading !== undefined ? `
            <div class="meta-item">
                <span class="meta-label">Rumbo</span>
                <span class="meta-value">${heading.toFixed(1)}°</span>
            </div>` : ''}
            ${obj.tipo ? `
            <div class="meta-item">
                <span class="meta-label">Tipo</span>
                <span class="meta-value">${obj.tipo}</span>
            </div>` : ''}
        `;
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

        if (!apiTags || apiTags.length === 0) {
            this.dom.tagsSelector.innerHTML = '<span style="color:#555; font-size:0.75rem;">No hay etiquetas disponibles</span>';
            return;
        }

        this.dom.tagsSelector.innerHTML = apiTags.map(tag => {
            const isSelected = this.selectedTagIds.includes(tag.id);
            const tagColor = tag.color || '#888';
            return `
                <div class="tag-chip ${isSelected ? 'selected' : ''}"
                     data-id="${tag.id}"
                     style="background: ${isSelected ? tagColor + '33' : 'rgba(255,255,255,0.05)'};
                            color: ${isSelected ? tagColor : '#888'};
                            border-color: ${tagColor}44;">
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
        this.dom.btnSave.textContent = "Guardar Cambios";
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
            this.controller.objectsGrid.updateTabCount();
            this.closeModal();
        } else {
            alert("Error al eliminar.");
        }
        this.dom.btnDelete.textContent = "Eliminar";
    }
}
