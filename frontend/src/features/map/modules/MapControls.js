/**
 * MapControls.js
 * Mobile-friendly floating control menu
 */

export class MapControls {
    constructor(mapController) {
        this.controller = mapController;
        this.menuOpen = false;
        this.activePanel = null;
    }

    /**
     * Create the floating control button and menu
     */
    createControls() {
        const container = document.getElementById(this.controller.containerId);
        if (!container) return;

        // Create controls container
        const controls = document.createElement('div');
        controls.className = 'map-controls';
        controls.innerHTML = `
            <!-- Main floating button -->
            <button class="map-control-fab" id="map-control-fab" title="Map Tools">
                <span class="fab-icon">☰</span>
            </button>

            <!-- Quick action buttons (desktop) -->
            <div class="map-quick-actions" id="map-quick-actions">
                <button class="map-quick-btn" id="map-btn-refresh" title="Refresh">🔄</button>
                <button class="map-quick-btn" id="map-btn-location" title="Mi ubicación">🎯</button>
                <button class="map-quick-btn" id="map-btn-layers" title="Capas">🌙</button>
            </div>

            <!-- Floating menu (mobile) -->
            <div class="map-menu-overlay" id="map-menu-overlay">
                <div class="map-menu">
                    <div class="map-menu-header">
                        <span>🛠️ Map Tools</span>
                        <button class="map-menu-close" id="map-menu-close">×</button>
                    </div>
                    <div class="map-menu-items">
                        <button class="map-menu-item" data-action="refresh">
                            <span class="menu-icon">🔄</span>
                            <span>Recargar objetos</span>
                        </button>
                        <button class="map-menu-item" data-action="location">
                            <span class="menu-icon">🎯</span>
                            <span>Mi ubicación</span>
                        </button>
                        <button class="map-menu-item" data-action="layers">
                            <span class="menu-icon">📡</span>
                            <span>Cambiar capa</span>
                        </button>
                        <div class="map-menu-divider"></div>
                        <button class="map-menu-item" data-action="search">
                            <span class="menu-icon">🔍</span>
                            <span>Buscar</span>
                        </button>
                        <button class="map-menu-item" data-action="filters">
                            <span class="menu-icon">📊</span>
                            <span>Filtros</span>
                        </button>
                        <button class="map-menu-item" data-action="export">
                            <span class="menu-icon">📤</span>
                            <span>Exportar</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Layers dropdown -->
            <div class="map-layers-dropdown" id="map-layers-dropdown">
                <div class="layer-option" data-layer="dark">🌙 Dark</div>
                <div class="layer-option" data-layer="street">🗺️ Street</div>
                <div class="layer-option" data-layer="satellite">🛰️ Satellite</div>
                <div class="layer-option" data-layer="terrain">⛰️ Terrain</div>
            </div>

            <!-- Toast notifications -->
            <div class="map-toast" id="map-toast"></div>
        `;

        container.appendChild(controls);
        this.bindEvents();
    }

    /**
     * Bind control event handlers
     */
    bindEvents() {
        // FAB toggle menu
        const fab = document.getElementById('map-control-fab');
        const overlay = document.getElementById('map-menu-overlay');
        const closeBtn = document.getElementById('map-menu-close');

        fab?.addEventListener('click', () => this.toggleMenu());
        closeBtn?.addEventListener('click', () => this.closeMenu());
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeMenu();
        });

        // Quick action buttons
        document.getElementById('map-btn-refresh')?.addEventListener('click', () => {
            this.controller.loadObjects();
            this.showToast('Objetos actualizados');
        });

        document.getElementById('map-btn-location')?.addEventListener('click', () => {
            this.controller.location?.goToMyLocation();
        });

        document.getElementById('map-btn-layers')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLayersDropdown();
        });

        // Menu items
        document.querySelectorAll('.map-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleMenuAction(action);
                this.closeMenu();
            });
        });

        // Layer options
        document.querySelectorAll('.layer-option').forEach(opt => {
            opt.addEventListener('click', () => {
                this.controller.layers?.setLayer(opt.dataset.layer);
                this.hideLayersDropdown();
            });
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => this.hideLayersDropdown());
    }

    /**
     * Handle menu action
     */
    handleMenuAction(action) {
        switch (action) {
            case 'refresh':
                this.controller.loadObjects();
                this.showToast('Objetos actualizados');
                break;
            case 'location':
                this.controller.location?.goToMyLocation();
                break;
            case 'layers':
                this.controller.layers?.cycleLayer();
                break;
            case 'search':
                this.showPanel('search');
                break;
            case 'filters':
                this.showPanel('filters');
                break;
            case 'export':
                this.controller.export?.exportData();
                break;
        }
    }

    /**
     * Toggle mobile menu
     */
    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        const overlay = document.getElementById('map-menu-overlay');
        const fab = document.getElementById('map-control-fab');

        overlay?.classList.toggle('active', this.menuOpen);
        fab?.classList.toggle('active', this.menuOpen);
    }

    /**
     * Close mobile menu
     */
    closeMenu() {
        this.menuOpen = false;
        document.getElementById('map-menu-overlay')?.classList.remove('active');
        document.getElementById('map-control-fab')?.classList.remove('active');
    }

    /**
     * Toggle layers dropdown
     */
    toggleLayersDropdown() {
        const dropdown = document.getElementById('map-layers-dropdown');
        dropdown?.classList.toggle('active');
    }

    /**
     * Hide layers dropdown
     */
    hideLayersDropdown() {
        document.getElementById('map-layers-dropdown')?.classList.remove('active');
    }

    /**
     * Show a feature panel
     */
    showPanel(panelName) {
        // To be implemented in Phase 2
        console.log('Show panel:', panelName);
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.getElementById('map-toast');
        if (!toast) return;

        toast.textContent = message;
        toast.className = `map-toast active ${type}`;

        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }
}
