/**
 * MapMarkers.js
 * Hybrid approach: GeoJSON clustering (groups) + HTML markers (individuals).
 *
 * Features:
 *  - Semantic cluster colors by density (cyan → warning → danger)
 *  - RAF animated glow halo for cluster layers (1 shared loop)
 *  - Glassmorphic cluster popup with mini donut chart (Canvas 2D, no libs)
 *  - Original pulse-ring CSS animation for individual markers w/ stagger
 *  - Draggable popups (pointerdown/move/up, header as handle)
 *  - Floating type-legend HUD updated on map idle
 */

export class MapMarkers {
    constructor(controller) {
        this.controller = controller;
        this.map = controller.map;
        this.popup = null;

        this.currentGeojson = { type: 'FeatureCollection', features: [] };

        // HTML markers cache: objectId → maplibregl.Marker
        this._htmlMarkers = new Map();

        // RAF for cluster glow animation
        this._glowRaf = null;
        this._glowRunning = false;

        // Legend HUD element
        this._legendEl = null;

        // Bound listeners
        this._onMapIdle = this._onIdle.bind(this);
        this._syncTimer = null;
    }

    // ─────────────────────────────────────────────
    // ICON / COLOR helpers
    // ─────────────────────────────────────────────

    getTypeIcon(tipo) {
        const icons = {
            'tech': '💻', 'marker': '📍', 'rock': '🪨', 'crater': '🕳️',
            'artifact': '🏺', 'structure': '🏛️', 'flora': '🌿', 'unknown': '❓'
        };
        return icons[tipo?.toLowerCase()] || '📦';
    }

    getTypeColor(tipo) {
        const colors = {
            'tech': '#00f7ff', 'marker': '#ff0055', 'rock': '#aaaaaa',
            'crater': '#ffaa00', 'artifact': '#bd00ff', 'structure': '#00ffaa',
            'flora': '#39ff14', 'unknown': '#ffffff'
        };
        return colors[tipo?.toLowerCase()] || '#ffffff';
    }

    // ─────────────────────────────────────────────
    // GEOJSON
    // ─────────────────────────────────────────────

    objectsToGeojson(objects) {
        return {
            type: 'FeatureCollection',
            features: objects.map(obj => {
                const coords = this.controller.parseWKBPoint(obj.posicion);
                if (!coords) return null;
                return {
                    type: 'Feature',
                    properties: {
                        id: obj.id,
                        nombre: obj.nombre || 'Sin nombre',
                        tipo: obj.tipo || 'unknown',
                        descripcion: obj.descripcion || '',
                        icon: this.getTypeIcon(obj.tipo),
                        color: this.getTypeColor(obj.tipo),
                        confidence: obj.metadata?.confidence || 0,
                        imagen: obj.imagen || obj.metadata?.image_base64 || '',
                        owner_id: obj.owner_id || null,
                        owner_name: obj.owner_name || '',
                        owner_avatar: obj.owner_avatar || '',
                        is_mine: obj.is_mine || false
                    },
                    geometry: { type: 'Point', coordinates: [coords[1], coords[0]] }
                };
            }).filter(f => f !== null)
        };
    }

    // ─────────────────────────────────────────────
    // CLUSTER LAYERS SETUP
    // ─────────────────────────────────────────────

    setupClusteringLayers() {
        if (!this.map) return;
        this.removeLayers();

        this.map.addSource('objects-source', {
            type: 'geojson',
            data: this.currentGeojson,
            cluster: true,
            clusterMaxZoom: 15,
            clusterRadius: 50
        });

        // 0. Animated glow halo (RAF drives opacity)
        this.map.addLayer({
            id: 'clusters-glow',
            type: 'circle',
            source: 'objects-source',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step', ['get', 'point_count'],
                    '#3FA8FF', 10, '#ffb400', 50, '#ff4444'
                ],
                'circle-radius': [
                    'step', ['get', 'point_count'],
                    38, 10, 52, 50, 66
                ],
                'circle-opacity': 0.14,
                'circle-blur': 1.2
            }
        });

        // 1. Cluster fill — semantic color by density
        this.map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'objects-source',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step', ['get', 'point_count'],
                    '#3FA8FF', 10,   // cyan: small
                    '#ffb400', 50,   // warning: medium
                    '#ff4444'        // danger: large
                ],
                'circle-radius': [
                    'step', ['get', 'point_count'],
                    22, 10, 32, 50, 42
                ],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': [
                    'step', ['get', 'point_count'],
                    'rgba(63,168,255,0.6)', 10,
                    'rgba(255,180,0,0.6)', 50,
                    'rgba(255,68,68,0.6)'
                ],
                'circle-opacity': 0.9
            }
        });

        // 2. Cluster count labels
        this.map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'objects-source',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Noto Sans Regular'],
                'text-size': 13,
                'text-allow-overlap': true
            },
            paint: { 'text-color': '#ffffff' }
        });

        // 3. Invisible reference layer for individual unclustered points.
        // queryRenderedFeatures on this layer is reliable with clustered GeoJSON.
        // querySourceFeatures has a known MapLibre limitation for clustered sources.
        this.map.addLayer({
            id: 'unclustered-ref',
            type: 'circle',
            source: 'objects-source',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-radius': 1,
                'circle-opacity': 0,
                'circle-stroke-opacity': 0
            }
        });

        this.bindEvents();
        this.map.on('idle', this._onMapIdle);
        this.map.on('moveend', this._onMapIdle);
        this._startGlowAnimation();
        this._createLegendHud();
    }

    // ─────────────────────────────────────────────
    // CLUSTER GLOW RAF ANIMATION
    // ─────────────────────────────────────────────

    _startGlowAnimation() {
        if (this._glowRunning) return;
        this._glowRunning = true;

        const animate = () => {
            if (!this._glowRunning) return;
            if (this.map && this.map.getLayer('clusters-glow')) {
                const s = (Math.sin(Date.now() / 1000 * 1.2) + 1) / 2;
                this.map.setPaintProperty('clusters-glow', 'circle-opacity', 0.10 + s * 0.12);
            }
            this._glowRaf = requestAnimationFrame(animate);
        };
        this._glowRaf = requestAnimationFrame(animate);
    }

    _stopGlowAnimation() {
        this._glowRunning = false;
        if (this._glowRaf !== null) {
            cancelAnimationFrame(this._glowRaf);
            this._glowRaf = null;
        }
    }

    // ─────────────────────────────────────────────
    // IDLE — sync HTML markers + legend
    // ─────────────────────────────────────────────

    _onIdle() {
        this._syncHtmlMarkers();
        this._updateLegendHud();
    }

    // ─────────────────────────────────────────────
    // HTML MARKERS (individual objects with CSS pulse)
    // ─────────────────────────────────────────────

    _syncHtmlMarkers() {
        if (!this.map || !this.map.getSource('objects-source')) return;
        if (!this.map.getLayer('unclustered-ref')) return;
        if (!this.map.isSourceLoaded('objects-source')) return;

        let rendered;
        try {
            rendered = this.map.queryRenderedFeatures(null, {
                layers: ['unclustered-ref']
            });
        } catch (e) {
            // Fallback: query entire canvas bounds
            const canvas = this.map.getCanvas();
            rendered = this.map.queryRenderedFeatures(
                [[0, 0], [canvas.width, canvas.height]],
                { layers: ['unclustered-ref'] }
            );
        }

        // Deduplicate (queryRenderedFeatures can return dupes across tiles)
        const seen = new Map();
        for (const f of rendered) {
            const id = f.properties.id;
            if (id && !seen.has(id)) seen.set(id, f);
        }

        const visibleIds = new Set(seen.keys());

        // Remove markers no longer visible
        for (const [id, marker] of this._htmlMarkers) {
            if (!visibleIds.has(id)) {
                marker.remove();
                this._htmlMarkers.delete(id);
            }
        }

        // Create markers for newly visible features
        for (const [id, feature] of seen) {
            if (this._htmlMarkers.has(id)) continue;
            const marker = this._createHtmlMarker(feature);
            if (marker) {
                marker.addTo(this.map);
                this._htmlMarkers.set(id, marker);
            }
        }
    }

    _createHtmlMarker(feature) {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        const color = props.color || '#ffffff';
        const icon = props.icon || '📦';
        const delay = Math.random() * 3;

        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.setProperty('--marker-color', color);
        el.innerHTML = `
            <div class="marker-pin">${icon}</div>
            <div class="marker-pulse" style="animation-delay: -${delay.toFixed(2)}s"></div>
        `;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            // Remove active from others
            document.querySelectorAll('.custom-marker.active').forEach(m => m.classList.remove('active'));
            el.classList.add('active');
            this.showPopup(props, coords);
        });
        el.style.cursor = 'pointer';

        return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coords);
    }

    _clearHtmlMarkers() {
        for (const marker of this._htmlMarkers.values()) marker.remove();
        this._htmlMarkers.clear();
    }

    // ─────────────────────────────────────────────
    // LEGEND HUD
    // ─────────────────────────────────────────────

    _createLegendHud() {
        if (this._legendEl) return;
        const container = this.map.getContainer();
        const hud = document.createElement('div');
        hud.className = 'map-type-legend';
        hud.id = 'map-type-legend';
        container.appendChild(hud);
        this._legendEl = hud;
    }

    _updateLegendHud() {
        if (!this._legendEl || !this.map.getSource('objects-source')) return;

        const rendered = this.map.querySourceFeatures('objects-source', {
            filter: ['!', ['has', 'point_count']]
        });

        const counts = {};
        rendered.forEach(f => {
            const tipo = f.properties.tipo || 'unknown';
            counts[tipo] = (counts[tipo] || 0) + 1;
        });

        const entries = Object.entries(counts);
        if (entries.length === 0) {
            this._legendEl.innerHTML = '';
            this._legendEl.style.display = 'none';
            return;
        }

        this._legendEl.style.display = 'flex';
        this._legendEl.innerHTML = entries.map(([tipo, count]) => `
            <span class="legend-badge" style="--badge-color:${this.getTypeColor(tipo)}">
                ${this.getTypeIcon(tipo)} <span class="legend-tipo">${tipo}</span>
                <span class="legend-count">×${count}</span>
            </span>
        `).join('');
    }

    // ─────────────────────────────────────────────
    // DRAG & DROP helper (shared by both popups)
    // ─────────────────────────────────────────────

    _makeDraggable(panelEl, handleEl) {
        let isDragging = false;
        let startX, startY, origLeft, origTop;

        handleEl.style.cursor = 'grab';

        const onPointerDown = (e) => {
            // Only left button
            if (e.button !== undefined && e.button !== 0) return;

            isDragging = true;
            handleEl.style.cursor = 'grabbing';

            // Switch panel to fixed positioning on first drag
            if (panelEl.style.position !== 'fixed') {
                const rect = panelEl.getBoundingClientRect();
                panelEl.style.position = 'fixed';
                panelEl.style.left = rect.left + 'px';
                panelEl.style.top = rect.top + 'px';
                panelEl.style.margin = '0';
                panelEl.style.transform = 'none';
                panelEl.style.zIndex = '99999';
            }

            const rect = panelEl.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            origLeft = rect.left;
            origTop = rect.top;

            e.preventDefault();
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Clamp within viewport
            const maxLeft = window.innerWidth - panelEl.offsetWidth - 8;
            const maxTop = window.innerHeight - panelEl.offsetHeight - 8;
            const newLeft = Math.max(8, Math.min(maxLeft, origLeft + dx));
            const newTop  = Math.max(8, Math.min(maxTop,  origTop  + dy));

            panelEl.style.left = newLeft + 'px';
            panelEl.style.top  = newTop + 'px';
        };

        const onPointerUp = () => {
            isDragging = false;
            handleEl.style.cursor = 'grab';
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };

        handleEl.addEventListener('pointerdown', onPointerDown);
    }

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    bindEvents() {
        this.map.on('click', 'clusters', async (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            if (!features.length) return;

            const cluster = features[0];
            const clusterId = cluster.properties.cluster_id;
            const pointCount = cluster.properties.point_count;
            const coordinates = cluster.geometry.coordinates;

            const source = this.map.getSource('objects-source');
            const allFeatures = await source.getClusterLeaves(clusterId, pointCount, 0);

            const categories = {};
            allFeatures.forEach(f => {
                const tipo = f.properties.tipo || 'unknown';
                if (!categories[tipo]) categories[tipo] = {
                    count: 0, icon: this.getTypeIcon(tipo), color: this.getTypeColor(tipo)
                };
                categories[tipo].count++;
            });

            this.showClusterPopup(categories, coordinates, clusterId, pointCount);
        });

        this.map.on('mouseenter', 'clusters', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'clusters', () => { this.map.getCanvas().style.cursor = ''; });
    }

    // ─────────────────────────────────────────────
    // CLUSTER POPUP (glassmorphism + donut chart)
    // ─────────────────────────────────────────────

    showClusterPopup(categories, coordinates, clusterId, total) {
        if (this.popup) this.popup.remove();

        const popupNode = document.createElement('div');
        popupNode.className = 'cluster-popup';

        // Header (drag handle)
        const header = document.createElement('div');
        header.className = 'cluster-popup-header';
        const clusterColor = total >= 50 ? '#ff4444' : total >= 10 ? '#ffb400' : '#3FA8FF';
        header.innerHTML = `
            <span class="cluster-drag-hint">⠿</span>
            <span class="cluster-title">ZONA DE OBJETOS</span>
            <span class="cluster-total-badge" style="background:${clusterColor}22; color:${clusterColor}; border-color:${clusterColor}40">${total}</span>
        `;
        popupNode.appendChild(header);

        // Donut chart + breakdown
        const body = document.createElement('div');
        body.className = 'cluster-popup-body';

        // Canvas donut
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        canvas.className = 'cluster-donut';
        body.appendChild(canvas);

        // Category breakdown
        const breakdown = document.createElement('div');
        breakdown.className = 'cluster-breakdown';

        const entries = Object.entries(categories);
        entries.forEach(([tipo, data]) => {
            const row = document.createElement('div');
            row.className = 'cluster-breakdown-row';
            row.style.setProperty('--cat-color', data.color);
            row.innerHTML = `
                <span class="cb-dot" style="background:${data.color}"></span>
                <span class="cb-icon">${data.icon}</span>
                <span class="cb-tipo">${tipo}</span>
                <span class="cb-count">${data.count}</span>
            `;
            breakdown.appendChild(row);
        });
        body.appendChild(breakdown);
        popupNode.appendChild(body);

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'cluster-actions';

        entries.forEach(([tipo, data]) => {
            const btn = document.createElement('button');
            btn.className = 'cluster-category-btn';
            btn.title = `Filtrar por ${tipo}`;
            btn.style.setProperty('--cat-color', data.color);
            btn.innerHTML = `${data.icon} <span>${tipo}</span> <span class="cat-count">${data.count}</span>`;

            btn.addEventListener('click', () => {
                if (this.popup) this.popup.remove();
                window.dispatchEvent(new CustomEvent('kepler:filter-by-type', { detail: { tipo } }));
                this.map.getSource('objects-source').getClusterExpansionZoom(clusterId).then(zoom => {
                    this.map.easeTo({ center: coordinates, zoom });
                });
            });
            actions.appendChild(btn);
        });

        const showAllBtn = document.createElement('button');
        showAllBtn.className = 'cluster-category-btn cluster-show-all';
        showAllBtn.innerHTML = `👁️ <span>Ver todos</span>`;
        showAllBtn.addEventListener('click', () => {
            if (this.popup) this.popup.remove();
            this.map.getSource('objects-source').getClusterExpansionZoom(clusterId).then(zoom => {
                this.map.easeTo({ center: coordinates, zoom });
            });
        });
        actions.appendChild(showAllBtn);
        popupNode.appendChild(actions);

        this.popup = new maplibregl.Popup({
            offset: 30,
            className: 'cluster-popup-wrapper',
            maxWidth: '300px',
            closeButton: true
        })
            .setLngLat(coordinates)
            .setDOMContent(popupNode)
            .addTo(this.map);

        // Draw donut after DOM is attached
        requestAnimationFrame(() => this._drawDonut(canvas, entries));

        // Make draggable via header
        const wrapperEl = this.popup.getElement();
        if (wrapperEl) this._makeDraggable(wrapperEl, header);
    }

    /**
     * Draw a simple donut chart (Canvas 2D) — no external libraries.
     */
    _drawDonut(canvas, entries) {
        const ctx = canvas.getContext('2d');
        const cx = 40, cy = 40, r = 30, innerR = 18;
        const total = entries.reduce((s, [, d]) => s + d.count, 0);
        let startAngle = -Math.PI / 2;

        entries.forEach(([, data]) => {
            const slice = (data.count / total) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + slice);
            ctx.closePath();
            ctx.fillStyle = data.color;
            ctx.globalAlpha = 0.85;
            ctx.fill();
            startAngle += slice;
        });

        // Hollow center
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,14,20,0.95)';
        ctx.fill();

        // Count label in center
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px "Jura", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total, cx, cy);
    }

    // ─────────────────────────────────────────────
    // OBJECT POPUP (glassmorphism + draggable)
    // ─────────────────────────────────────────────

    showPopup(props, coordinates) {
        if (this.popup) this.popup.remove();

        const popupNode = document.createElement('div');
        popupNode.className = 'popup-content';

        // Draggable header
        const header = document.createElement('div');
        header.className = 'popup-drag-header';
        header.innerHTML = `
            <span class="cluster-drag-hint">⠿</span>
            <span class="popup-type-tag" style="background:${props.color}22; color:${props.color}">${props.tipo || 'objeto'}</span>
            <span style="flex:1"></span>
        `;
        popupNode.appendChild(header);

        // Image
        if (props.imagen && props.imagen.length > 50) {
            const img = document.createElement('img');
            img.src = props.imagen;
            img.className = 'popup-image';
            Object.assign(img.style, {
                width: '100%', borderRadius: '8px', marginBottom: '10px',
                height: 'auto', maxHeight: '180px', objectFit: 'contain',
                backgroundColor: 'rgba(0,0,0,0.3)'
            });
            popupNode.appendChild(img);
        }

        // Info
        const info = document.createElement('div');
        const confVal = props.confidence ? (parseFloat(props.confidence) * 100).toFixed(0) : '0';
        info.innerHTML = `
            <h3 style="margin:0 0 8px; font-size:15px; color:#fff; font-family:'Jura',sans-serif;">${props.nombre}</h3>
            <p style="margin:0 0 8px; font-size:12.5px; color:#aaa; line-height:1.5;">${props.descripcion || 'Sin descripción'}</p>
            <div class="popup-confidence-bar">
                <div style="width:${confVal}%; background:${props.color};"></div>
            </div>
            <div style="font-size:0.72rem; color:#666; margin-top:4px;">Confianza: ${confVal}%</div>
        `;
        popupNode.appendChild(info);

        // Owner
        if (props.owner_id && props.is_mine === 'false') {
            const owner = document.createElement('div');
            owner.className = 'popup-owner';
            owner.innerHTML = `<span>@${props.owner_name || 'Explorador'}</span>`;
            owner.onclick = (e) => { e.stopPropagation(); this.controller.showProfileModal(props.owner_id); };
            popupNode.appendChild(owner);
        }

        this.popup = new maplibregl.Popup({
            offset: 25,
            className: 'custom-popup',
            maxWidth: '300px',
            closeButton: true
        })
            .setLngLat(coordinates)
            .setDOMContent(popupNode)
            .addTo(this.map);

        // Make draggable via header
        const wrapperEl = this.popup.getElement();
        if (wrapperEl) this._makeDraggable(wrapperEl, header);
    }

    // ─────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────

    removeLayers() {
        this._stopGlowAnimation();
        if (this.map) {
            this.map.off('idle', this._onMapIdle);
            this.map.off('moveend', this._onMapIdle);
        }
        this._clearHtmlMarkers();
        if (this._syncTimer) { clearTimeout(this._syncTimer); this._syncTimer = null; }

        // Remove legend HUD
        if (this._legendEl) {
            this._legendEl.remove();
            this._legendEl = null;
        }

        const layerIds = ['clusters-glow', 'clusters', 'cluster-count', 'unclustered-ref'];
        layerIds.forEach(id => {
            if (this.map.getLayer(id)) this.map.removeLayer(id);
        });
        if (this.map.getSource('objects-source')) {
            this.map.removeSource('objects-source');
        }
    }

    clearMarkers() {
        if (this.popup) { this.popup.remove(); this.popup = null; }
        document.querySelectorAll('.custom-marker.active').forEach(m => m.classList.remove('active'));
    }

    renderMarkers(objectsToRender) {
        this.currentGeojson = this.objectsToGeojson(objectsToRender);
        const source = this.map?.getSource('objects-source');
        if (source) {
            source.setData(this.currentGeojson);
            this._clearHtmlMarkers();
            // Schedule a sync after the source processes the new data.
            // idle/moveend may not fire if the map was already still.
            if (this._syncTimer) clearTimeout(this._syncTimer);
            this._syncTimer = setTimeout(() => {
                this._syncHtmlMarkers();
                this._updateLegendHud();
            }, 300);
        } else {
            this.setupClusteringLayers();
        }
    }

    flyToObject(objectId) {
        const obj = this.controller.objects.find(o => o.id === objectId);
        if (!obj) return;
        const coords = this.controller.parseWKBPoint(obj.posicion);
        if (!coords) return;
        const lngLat = [coords[1], coords[0]];
        this.map.flyTo({ center: lngLat, zoom: 17, essential: true });
        setTimeout(() => {
            this.showPopup({
                id: obj.id, nombre: obj.nombre, tipo: obj.tipo,
                descripcion: obj.descripcion, icon: this.getTypeIcon(obj.tipo),
                color: this.getTypeColor(obj.tipo),
                confidence: obj.metadata?.confidence || 0,
                imagen: obj.imagen || obj.metadata?.image_base64 || '',
                owner_id: obj.owner_id, owner_name: obj.owner_name,
                owner_avatar: obj.owner_avatar, is_mine: obj.is_mine
            }, lngLat);
        }, 1500);
    }
}