/**
 * MapSearch.js
 * Handles search bar UI and filtering logic by name/tag
 */

export class MapSearch {
    constructor(mapController) {
        this.controller = mapController;
        this.container = null;
        this.input = null;
        this.term = '';
    }

    /**
     * Create Search Bar UI
     * Returns the container element so Filters can append to it
     */
    createUI() {
        // Create main container (top left)
        this.container = document.createElement('div');
        this.container.className = 'map-search-container';

        // Input Wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'map-search-input-wrapper';

        // Icon
        const icon = document.createElement('i');
        icon.className = 'fas fa-search map-search-icon';

        // Input Field
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'map-search-input';
        this.input.placeholder = 'Buscar objetos...';

        // Event Listener (Debounced)
        let timeout;
        this.input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.term = e.target.value.toLowerCase().trim();
                this.controller.handleSearch(this.term);
            }, 300);
        });

        // Assemble
        wrapper.appendChild(icon);
        wrapper.appendChild(this.input);
        this.container.appendChild(wrapper);

        // Append to Map Container (ensure it's on top)
        const mapContainer = document.getElementById('map-view-container');
        if (mapContainer) {
            mapContainer.appendChild(this.container);

            // Prevent map drag/click/scroll (Native for MapLibre)
            ['mousedown', 'touchstart', 'click', 'dblclick', 'scroll', 'wheel'].forEach(evt => {
                this.container.addEventListener(evt, (e) => e.stopPropagation());
            });
        }

        return this.container;
    }

    /**
     * Clear search
     */
    clear() {
        this.term = '';
        if (this.input) this.input.value = '';
        this.controller.handleSearch('');
    }
}
