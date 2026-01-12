/**
 * MapFilters.js
 * Handles category and confidence filtering
 */

export class MapFilters {
    constructor(mapController) {
        this.controller = mapController;
        this.activeFilters = {
            types: new Set(), // empty = all
            minConfidence: 0
        };
        this.availableTypes = new Set();
    }

    getFilters() {
        return {
            types: Array.from(this.activeFilters.types),
            minConfidence: this.activeFilters.minConfidence * 100
        };
    }

    /**
     * Initialize UI (Button + Panel)
     * @param {HTMLElement} parentContainer - Search container to append button to
     */
    createUI(parentContainer) {
        if (!parentContainer) return;

        // 1. Filter Button
        const btn = document.createElement('div');
        btn.className = 'map-filter-btn';
        btn.title = 'Filtrar objetos';
        // Use SVG directly to ensure visibility
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
        `;

        // Badge for active filters
        const badge = document.createElement('div');
        badge.className = 'filter-badge-count';
        badge.id = 'filter-badge';
        btn.appendChild(badge);

        btn.onclick = () => this.togglePanel();
        parentContainer.appendChild(btn);

        // 2. Filter Panel
        this.panel = document.createElement('div');
        this.panel.className = 'map-filter-panel';
        this.panel.innerHTML = `
            <div class="filter-section">
                <div class="filter-title">Confianza Mínima (<span id="conf-val">0</span>%)</div>
                <div class="filter-slider-container">
                    <input type="range" min="0" max="100" value="0" class="filter-slider" id="filter-confidence">
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-title">Tipos de Objeto</div>
                <div class="filter-checkbox-group" id="filter-types-list">
                    <!-- Checkboxes injected here -->
                    <div style="color:#666; font-size:0.8rem;">Cargando tipos...</div>
                </div>
            </div>
            <div style="text-align:right; margin-top:10px;">
                <button id="btn-reset-filters" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size:0.8rem;">
                    Limpiar Filtros
                </button>
            </div>
        `;

        // Add to map container (not search container, to keep z-index logic valid)
        const mapContainer = document.getElementById('map-view-container');
        if (mapContainer) {
            mapContainer.appendChild(this.panel);

            // Prevent map interaction (CRITICAL for sliders)
            // MapLibre doesn't have disableClickPropagation, use native
            ['mousedown', 'touchstart', 'click', 'dblclick', 'scroll', 'wheel'].forEach(evt => {
                this.panel.addEventListener(evt, (e) => e.stopPropagation());
            });

            this.bindEvents();
        }
    }

    bindEvents() {
        // Confidence Slider
        const slider = document.getElementById('filter-confidence');
        const valDisplay = document.getElementById('conf-val');

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            valDisplay.textContent = val;
            this.activeFilters.minConfidence = val / 100;
            this.controller.handleFilterChange();
            this.updateBadge();
        });

        // Reset Button
        document.getElementById('btn-reset-filters').addEventListener('click', () => {
            this.resetFilters();
        });
    }

    togglePanel() {
        console.log('🔘 Toggling filter panel');
        this.panel.classList.toggle('active');
        document.querySelector('.map-filter-btn').classList.toggle('active');
    }

    /**
     * Update filter options based on loaded objects
     */
    updateTypeOptions(objects) {
        const types = new Set(objects.map(o => o.tipo || 'Desconocido'));

        // Only update DOM if types changed
        const currentTypes = Array.from(types).sort().join(',');
        const prevTypes = Array.from(this.availableTypes).sort().join(',');

        if (currentTypes === prevTypes) return;

        this.availableTypes = types;
        const container = document.getElementById('filter-types-list');
        container.innerHTML = '';

        types.forEach(type => {
            const label = document.createElement('label');
            label.className = 'filter-checkbox-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = type;
            checkbox.checked = this.activeFilters.types.has(type);

            checkbox.change = () => { /* handled by delegation below */ };

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(type));
            container.appendChild(label);
        });

        // Event delegation for checkboxes
        container.onchange = (e) => {
            if (e.target.type === 'checkbox') {
                const val = e.target.value;
                if (e.target.checked) {
                    this.activeFilters.types.add(val);
                } else {
                    this.activeFilters.types.delete(val);
                }
                this.controller.handleFilterChange();
                this.updateBadge();
            }
        };
    }

    resetFilters() {
        this.activeFilters = { types: new Set(), minConfidence: 0 };

        // Update UI
        document.getElementById('filter-confidence').value = 0;
        document.getElementById('conf-val').textContent = '0';
        document.querySelectorAll('#filter-types-list input').forEach(cb => cb.checked = false);

        this.updateBadge();
        this.controller.handleFilterChange();
    }

    updateBadge() {
        const count = this.activeFilters.types.size + (this.activeFilters.minConfidence > 0 ? 1 : 0);
        const badge = document.getElementById('filter-badge');
        if (count > 0) {
            badge.textContent = count;
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    }

    /**
     * Check if an object passes filters
     */
    passes(obj) {
        // Confidence check
        const conf = obj.confidence || obj.confianza || 0;
        if (conf < this.activeFilters.minConfidence) return false;

        // Type check
        if (this.activeFilters.types.size > 0) {
            const type = obj.tipo || 'Desconocido';
            if (!this.activeFilters.types.has(type)) return false;
        }

        return true;
    }
}
