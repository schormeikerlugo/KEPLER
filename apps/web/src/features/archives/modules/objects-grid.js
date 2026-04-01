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

    updateTabCount() {
        const countEl = document.getElementById('tab-count-objetos');
        if (countEl) {
            countEl.textContent = this.controller.currentObjects.length;
        }
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

                // Tag filtering is done client-side if tags are loaded
                if (filterTagId) {
                    matchesTag = false; // Default no match if filter set but no tag data
                }

                return matchesCat && matchesTag;
            });
        }
        this.renderGrid();
    }

    renderGrid() {
        this.dom.grid.innerHTML = '';

        const { filteredObjects, currentObjects, filterCategoryId, filterTagId } = this.controller;

        const objectsToRender = (filteredObjects.length > 0 || filterCategoryId || filterTagId)
            ? filteredObjects
            : currentObjects;

        if (objectsToRender.length === 0) {
            this.dom.grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    No hay registros visuales en esta misión.
                </div>`;
            return;
        }

        objectsToRender.forEach((obj, index) => {
            const card = document.createElement('div');
            card.className = 'object-card';
            card.style.animationDelay = `${index * 0.03}s`;
            card.onclick = () => this.controller.objectModal.openDetail(obj);

            let imgSrc = '../../assets/placeholder-mars.jpg';
            if (obj.metadata && obj.metadata.image_base64) {
                imgSrc = obj.metadata.image_base64;
            }

            const dateStr = new Date(obj.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const displayName = obj.nombre || 'Sin Nombre';

            // Category info from JOIN
            const catData = obj.categorias;
            const subcatData = obj.subcategorias;
            const hasCategory = catData || obj.categoria_id;
            const categoryClass = hasCategory ? 'categorizado' : 'sin-categorizar';
            const categoryLabel = catData?.nombre || (hasCategory ? 'Categorizado' : 'Sin categorizar');
            const catColor = catData?.color || '';

            // Subcategory label
            const subcatLabel = subcatData?.nombre || '';

            card.innerHTML = `
                <img src="${imgSrc}" class="object-img" loading="lazy" alt="${displayName}">
                <div class="object-info">
                    <div class="object-category ${categoryClass}" ${catColor && hasCategory ? `style="background:${catColor}22; color:${catColor};"` : ''}>
                        ${categoryLabel}${subcatLabel ? ' · ' + subcatLabel : ''}
                    </div>
                    <div class="object-name">${displayName}</div>
                    <div class="object-time">${dateStr}</div>
                </div>
            `;
            this.dom.grid.appendChild(card);
        });

        // Update tab count
        this.updateTabCount();
    }
}
