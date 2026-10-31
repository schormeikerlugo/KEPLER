/**
 * MapObjectPanel.js
 * Side panel showing list of objects with filtering and scope toggle.
 */

export class MapObjectPanel {
    constructor(controller) {
        this.controller = controller;
        this.panel = null;
    }

    /**
     * Create the object panel in the map container
     */
    create() {
        const container = document.getElementById(this.controller.containerId);
        if (!container) return;

        const panel = document.createElement('div');
        panel.className = 'map-object-panel';
        panel.id = 'map-object-panel';
        panel.innerHTML = `
            <div class="map-object-panel-header">
                <h3>📍 Objetos</h3>
                <div class="header-actions">
                    <span class="count" id="object-count">0</span>
                    <button class="panel-collapse-btn" id="panel-collapse-btn" title="Minimizar">▼</button>
                    <button class="panel-close-btn" id="panel-close-btn" title="Cerrar">×</button>
                </div>
            </div>
            <div class="map-scope-toggle">
                <button class="scope-btn active" data-scope="mine">👤 Míos</button>
                <button class="scope-btn" data-scope="all">🌍 Todos</button>
            </div>
            <div class="map-object-list" id="map-object-list">
                <p style="color:#666; text-align:center; padding:20px;">Cargando...</p>
            </div>
        `;

        container.appendChild(panel);
        this.panel = panel;

        // Prevent map interaction when interacting with panel
        ['mousedown', 'touchstart', 'click', 'scroll', 'wheel'].forEach(evt => {
            panel.addEventListener(evt, (e) => e.stopPropagation());
        });

        // Bind toggle events
        panel.querySelectorAll('.scope-btn').forEach(btn => {
            btn.addEventListener('click', () => this.controller.setScope(btn.dataset.scope));
        });

        // Mobile collapse/expand
        document.getElementById('panel-collapse-btn')?.addEventListener('click', () => {
            this.toggleCollapse();
        });

        // Mobile close
        document.getElementById('panel-close-btn')?.addEventListener('click', () => {
            panel.classList.remove('mobile-visible');
            const chatFab = document.getElementById('chat-fab');
            if (chatFab) chatFab.style.display = 'flex';
        });
    }

    /**
     * Toggle collapsed state (mobile)
     */
    toggleCollapse() {
        if (!this.panel) return;
        this.panel.classList.toggle('mobile-collapsed');
        const btn = document.getElementById('panel-collapse-btn');
        if (btn) {
            btn.textContent = this.panel.classList.contains('mobile-collapsed') ? '▲' : '▼';
        }
    }

    /**
     * Update the list of objects in the panel
     */
    update(filteredList = null) {
        const listEl = document.getElementById('map-object-list');
        const countEl = document.getElementById('object-count');
        if (!listEl) return;

        const objectsToShow = filteredList || this.controller.objects;
        countEl.textContent = objectsToShow.length;

        if (objectsToShow.length === 0) {
            listEl.innerHTML = '<p style="color:#666; text-align:center; padding:20px;">Sin objetos</p>';
            return;
        }

        listEl.innerHTML = objectsToShow.map(obj => {
            const confidence = obj.metadata?.confidence || 0;
            const icon = this.controller.markersMod?.getTypeIcon(obj.tipo) || '📍';
            return `
                <div class="map-object-item" data-id="${obj.id}">
                    <div class="map-object-icon">${icon}</div>
                    <div class="map-object-info">
                        <div class="name">${obj.nombre || 'Sin nombre'}</div>
                        <div class="type">${obj.tipo || 'Desconocido'}</div>
                    </div>
                    <div class="map-object-confidence">${(confidence * 100).toFixed(0)}%</div>
                </div>
            `;
        }).join('');

        // Bind click events
        listEl.querySelectorAll('.map-object-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.controller.markersMod?.flyToObject(id);
                listEl.querySelectorAll('.map-object-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    /**
     * Update scope button UI
     */
    setActiveScope(scope) {
        if (!this.panel) return;
        this.panel.querySelectorAll('.scope-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scope === scope);
        });
    }
}
