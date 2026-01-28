/**
 * Objects Grid Module
 * Handles rendering the objects grid and filtering
 */

export class ObjectsGrid {
    constructor(controller) {
        this.controller = controller;
    }

    get dom() {
        return this.controller.dom;
    }

    applyFilters() {
        const { filterCategoryId, filterTagId, currentObjects } = this.controller;

        if (!filterCategoryId && !filterTagId) {
            this.controller.filteredObjects = [...currentObjects];
        } else {
            this.controller.filteredObjects = currentObjects.filter(obj => {
                let matchesCat = true;
                let matchesTag = true;

                if (filterCategoryId) {
                    matchesCat = obj.categoria_id === filterCategoryId;
                }

                return matchesCat && matchesTag;
            });
        }
        this.renderGrid();
    }

    renderGrid() {
        this.dom.grid.innerHTML = '';

        const { filteredObjects, currentObjects, filterCategoryId, filterTagId } = this.controller;

        const objectsToRender = filteredObjects.length > 0 || (filterCategoryId || filterTagId)
            ? filteredObjects
            : currentObjects;

        if (objectsToRender.length === 0) {
            this.dom.grid.innerHTML = '<div class="empty-state">No hay registros visuales en esta misión.</div>';
            return;
        }

        objectsToRender.forEach(obj => {
            const card = document.createElement('div');
            card.className = 'object-card';
            card.onclick = () => this.controller.objectModal.openDetail(obj);

            let imgSrc = '../../assets/placeholder-mars.jpg';
            if (obj.metadata && obj.metadata.image_base64) {
                imgSrc = obj.metadata.image_base64;
            }

            const dateStr = new Date(obj.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const displayName = obj.nombre || 'Sin Nombre';
            const hasCategory = obj.categoria_id || obj.subcategoria;
            const categoryClass = hasCategory ? 'categorizado' : 'sin-categorizar';
            const categoryLabel = hasCategory ? 'CATEGORIZADO' : 'SIN CATEGORIZAR';

            card.innerHTML = `
                <img src="${imgSrc}" class="object-img" loading="lazy" alt="${displayName}">
                <div class="object-info">
                    <div class="object-category ${categoryClass}">${categoryLabel}</div>
                    <div class="object-name">${displayName}</div>
                    <div class="object-time">${dateStr}</div>
                </div>
            `;
            this.dom.grid.appendChild(card);
        });
    }
}
