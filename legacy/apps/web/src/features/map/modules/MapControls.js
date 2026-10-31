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
                <button class="map-quick-btn mode-btn active" id="map-btn-explore" title="Explorar">🔍</button>
                <button class="map-quick-btn mode-btn" id="map-btn-routes" title="Planificar Rutas">🧭</button>
                <button class="map-quick-btn" id="map-btn-refresh" title="Refresh">🔄</button>
                <button class="map-quick-btn" id="map-btn-location" title="Mi ubicación">🎯</button>
                <button class="map-quick-btn" id="map-btn-layers" title="Capas">🌙</button>
            </div>

            <!-- Floating menu (mobile) -->
            <div class="map-menu-overlay" id="map-menu-overlay">
                <div class="map-menu">
                    <div class="map-menu-header">
                        <span class="menu-title">🛠️ HERRAMIENTAS</span>
                        <button class="map-menu-close" id="map-menu-close">×</button>
                    </div>
                    <div class="map-menu-items">
                        <button class="map-menu-item" data-action="mode-explore">
                            <span class="menu-icon">🔍</span>
                            <span>Explorar</span>
                        </button>
                        <button class="map-menu-item" data-action="mode-routes">
                            <span class="menu-icon">🧭</span>
                            <span>Planificar Rutas</span>
                        </button>
                        <div class="map-menu-divider"></div>
                        <button class="map-menu-item" data-action="objects">
                            <span class="menu-icon">📦</span>
                            <span>Objetos</span>
                        </button>
                        <button class="map-menu-item" data-action="search">
                            <span class="menu-icon">🔍</span>
                            <span>Buscar</span>
                        </button>
                        <button class="map-menu-item" data-action="filters">
                            <span class="menu-icon">📊</span>
                            <span>Filtros</span>
                        </button>
                        <div class="map-menu-divider"></div>
                        <button class="map-menu-item" data-action="location">
                            <span class="menu-icon">🎯</span>
                            <span>Mi ubicación</span>
                        </button>
                        <button class="map-menu-item" data-action="layers">
                            <span class="menu-icon">🗺️</span>
                            <span>Cambiar mapa</span>
                        </button>
                        <button class="map-menu-item" data-action="refresh">
                            <span class="menu-icon">🔄</span>
                            <span>Recargar</span>
                        </button>
                        <div class="map-menu-divider"></div>
                        <button class="map-menu-item exit-action" data-action="exit">
                            <span class="menu-icon">🔙</span>
                            <span>Volver al Dashboard</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Layer Selector Modal -->
            <div class="map-layer-modal" id="map-layer-modal">
                <div class="layer-modal-content">
                    <div class="layer-modal-header">
                        <span>🗺️ Seleccionar Mapa</span>
                        <button class="layer-modal-close" id="layer-modal-close">×</button>
                    </div>
                    <div class="layer-options">
                        <div class="layer-option-card" data-layer="vector">
                            <span class="layer-icon">⚡</span>
                            <span class="layer-name">Vector</span>
                            <span class="layer-desc">3D y animaciones</span>
                        </div>
                        <div class="layer-option-card" data-layer="dark">
                            <span class="layer-icon">🌙</span>
                            <span class="layer-name">Dark</span>
                            <span class="layer-desc">Modo oscuro</span>
                        </div>
                        <div class="layer-option-card" data-layer="street">
                            <span class="layer-icon">🛣️</span>
                            <span class="layer-name">Street</span>
                            <span class="layer-desc">Calles detalladas</span>
                        </div>
                        <div class="layer-option-card" data-layer="satellite">
                            <span class="layer-icon">🛰️</span>
                            <span class="layer-name">Satélite</span>
                            <span class="layer-desc">Imágenes reales</span>
                        </div>
                        <div class="layer-option-card" data-layer="terrain">
                            <span class="layer-icon">⛰️</span>
                            <span class="layer-name">Terrain</span>
                            <span class="layer-desc">Topográfico</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Layers dropdown (legacy, hidden) -->
            <div class="map-layers-dropdown" id="map-layers-dropdown" style="display:none;">
                <div class="layer-option" data-layer="vector">⚡ Vector (3D)</div>
                <div class="layer-option" data-layer="dark">🌙 Dark</div>
                <div class="layer-option" data-layer="street">🗺️ Street</div>
                <div class="layer-option" data-layer="satellite">🛰️ Satellite</div>
                <div class="layer-option" data-layer="terrain">⛰️ Terrain</div>
            </div>

            <!-- Toast notifications -->
            <div class="map-toast" id="map-toast"></div>

            <!-- Coordinate Display Widget -->
            <div class="map-coords-widget" id="map-coords-widget">
                <div class="coords-row">
                    <span class="coords-label">LAT</span>
                    <span class="coords-value" id="coords-lat">0.0000</span>
                </div>
                <div class="coords-row">
                    <span class="coords-label">LNG</span>
                    <span class="coords-value" id="coords-lng">0.0000</span>
                </div>
                <div class="coords-row">
                    <span class="coords-label">ZOOM</span>
                    <span class="coords-value" id="coords-zoom">13</span>
                </div>
            </div>
        `;

        container.appendChild(controls);
        this.bindEvents();
        this.initCoordinateWidget();
    }

    /**
     * Initialize coordinate widget with map events
     */
    initCoordinateWidget() {
        const map = this.controller.map;
        if (!map) return;

        const updateCoords = () => {
            const center = map.getCenter();
            const zoom = map.getZoom();

            const latEl = document.getElementById('coords-lat');
            const lngEl = document.getElementById('coords-lng');
            const zoomEl = document.getElementById('coords-zoom');

            if (latEl) latEl.textContent = center.lat.toFixed(5);
            if (lngEl) lngEl.textContent = center.lng.toFixed(5);
            if (zoomEl) zoomEl.textContent = zoom.toFixed(1);
        };

        // Update on map move
        map.on('move', updateCoords);

        // Initial update
        updateCoords();
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

        // Mode toggle buttons
        document.getElementById('map-btn-explore')?.addEventListener('click', () => {
            this.setMode('explore');
        });

        document.getElementById('map-btn-routes')?.addEventListener('click', () => {
            this.setMode('routes');
        });

        document.getElementById('map-btn-layers')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openLayerModal();
        });

        // Menu items
        document.querySelectorAll('.map-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleMenuAction(action);
            });
        });

        // Layer modal events
        document.getElementById('layer-modal-close')?.addEventListener('click', () => {
            this.closeLayerModal();
        });

        document.getElementById('map-layer-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'map-layer-modal') {
                this.closeLayerModal();
            }
        });

        // Layer option cards
        document.querySelectorAll('.layer-option-card').forEach(card => {
            card.addEventListener('click', () => {
                const layer = card.dataset.layer;
                this.controller.layersMod?.setLayer(layer);
                this.closeLayerModal();
                this.showToast(`Mapa cambiado a ${card.querySelector('.layer-name')?.textContent}`);
            });
        });

        // Legacy layer options (for desktop quick buttons)
        document.querySelectorAll('.layer-option').forEach(opt => {
            opt.addEventListener('click', () => {
                this.controller.layersMod?.setLayer(opt.dataset.layer);
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
        this.closeMenu(); // Close menu after action

        switch (action) {
            case 'mode-explore':
                this.setMode('explore');
                break;
            case 'mode-routes':
                this.setMode('routes');
                break;
            case 'refresh':
                this.controller.loadObjects();
                this.showToast('Objetos actualizados');
                break;
            case 'location':
                this.controller.location?.goToMyLocation();
                break;
            case 'layers':
                this.openLayerModal();
                break;
            case 'objects':
                this.toggleObjectPanel();
                break;
            case 'search':
                this.toggleSearchBar();
                break;
            case 'filters':
                this.toggleFiltersPanel();
                break;
            case 'exit':
                // Ensure chat is visible before exiting
                const chatFab = document.getElementById('chat-fab');
                if (chatFab) chatFab.style.display = 'flex';

                document.getElementById('btn-close-map')?.click();
                break;
        }
    }

    /**
     * Set map mode (explore | routes)
     */
    setMode(mode) {
        this.controller.setMode(mode);

        // Update button states
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.getElementById(`map-btn-${mode}`);
        if (activeBtn) activeBtn.classList.add('active');

        this.showToast(mode === 'routes' ? 'Modo Rutas activado' : 'Modo Explorar activado');
    }

    /**
     * Open layer selector modal
     */
    openLayerModal() {
        const modal = document.getElementById('map-layer-modal');
        if (modal) {
            modal.classList.add('active');
            // Mark current layer as active
            const currentLayer = this.controller.layersMod?.currentLayer || 'vector';
            modal.querySelectorAll('.layer-option-card').forEach(card => {
                card.classList.toggle('active', card.dataset.layer === currentLayer);
            });
        }
    }

    /**
     * Close layer modal
     */
    closeLayerModal() {
        document.getElementById('map-layer-modal')?.classList.remove('active');
    }

    /**
     * Toggle search bar visibility
     */
    toggleSearchBar() {
        const searchContainer = document.querySelector('.map-search-container');
        if (searchContainer) {
            searchContainer.classList.toggle('visible');
            if (searchContainer.classList.contains('visible')) {
                searchContainer.querySelector('input')?.focus();
            }
        }
    }

    /**
     * Toggle filters panel
     */
    toggleFiltersPanel() {
        const filterToggle = document.getElementById('filter-toggle');
        if (filterToggle) {
            filterToggle.click(); // Trigger existing filter toggle
        }
    }

    /**
     * Open chat (dispatch event to dashboard)
     */
    openChat() {
        // Dispatch custom event that dashboard can listen to
        window.dispatchEvent(new CustomEvent('kepler:openChat'));
        this.showToast('Abriendo Chat IA...');
    }

    /**
     * Toggle object panel visibility (mobile)
     */
    toggleObjectPanel() {
        const panel = document.getElementById('map-object-panel');
        if (panel) {
            panel.classList.toggle('mobile-visible');
            const isVisible = panel.classList.contains('mobile-visible');

            // Toggle Chat FAB visibility to prevent overlap
            const chatFab = document.getElementById('chat-fab');
            if (chatFab) {
                // If panel is visible, hide chat. Else show chat.
                // We'll use opacity or display. Opacity keeps layout but untappable if pointer-events none.
                // display: none is safer to ensure no tap.
                chatFab.style.display = isVisible ? 'none' : 'flex';
            }

            this.showToast(isVisible ? 'Panel de objetos abierto' : 'Panel de objetos cerrado');
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
