/**
 * MapController.js
 * Manages Leaflet map instance and object rendering.
 * Includes object sidebar panel with click-to-locate functionality.
 */

import { supabase } from '../../js/auth.js';

export class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.layerGroup = null;
        this.isInitialized = false;
        this.objects = []; // Store loaded objects
        this.markers = {}; // Map object ID to marker
        this.viewScope = 'mine'; // 'mine' or 'all'

        // Base coords (default view)
        this.baseCoords = [10.1833, -67.0000]; // Venezuela default
    }

    /**
     * Parse PostGIS WKB Hex to [lat, lon]
     */
    parseWKBPoint(wkbHex) {
        if (!wkbHex || typeof wkbHex !== 'string') return null;

        try {
            if (wkbHex.length < 50) return null;

            const headerLen = 18;
            const xHex = wkbHex.substring(headerLen, headerLen + 16);
            const yHex = wkbHex.substring(headerLen + 16, headerLen + 32);

            const hexToDouble = (hex) => {
                const bytes = [];
                for (let i = 0; i < 16; i += 2) {
                    bytes.push(parseInt(hex.substring(i, i + 2), 16));
                }
                const buffer = new ArrayBuffer(8);
                const view = new DataView(buffer);
                bytes.forEach((b, i) => view.setUint8(i, b));
                return view.getFloat64(0, true);
            };

            const lon = hexToDouble(xHex);
            const lat = hexToDouble(yHex);

            if (isNaN(lat) || isNaN(lon)) return null;
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

            return [lat, lon];
        } catch (e) {
            console.warn('Failed to parse WKB:', e);
            return null;
        }
    }

    /**
     * Get icon emoji based on object type
     */
    getTypeIcon(tipo) {
        const icons = {
            'tech': '💻',
            'marker': '📍',
            'rock': '🪨',
            'crater': '🕳️',
            'artifact': '🏺',
            'structure': '🏛️',
            'flora': '🌿',
            'unknown': '❓'
        };
        return icons[tipo?.toLowerCase()] || '📦';
    }

    /**
     * Initialize the map
     */
    async init() {
        if (this.isInitialized) return;

        if (typeof L === 'undefined') {
            console.error('Leaflet not loaded');
            return;
        }

        console.log('🗺️ Initializing Holographic Map...');

        // 1. Create Map Instance
        this.map = L.map(this.containerId, {
            center: this.baseCoords,
            zoom: 13,
            zoomControl: false,
            attributionControl: false
        });

        // 2. Add Tile Layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
            className: 'holo-tiles',
            crossOrigin: true
        }).addTo(this.map);

        // 3. Add Layer Group for Markers
        this.layerGroup = L.layerGroup().addTo(this.map);

        // 4. Add Zoom Control
        L.control.zoom({ position: 'topright' }).addTo(this.map);

        // 5. Create Object Panel
        this.createObjectPanel();

        this.isInitialized = true;

        // Initial Fetch
        await this.loadObjects();
    }

    /**
     * Create the object sidebar panel
     */
    createObjectPanel() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const panel = document.createElement('div');
        panel.className = 'map-object-panel';
        panel.id = 'map-object-panel';
        panel.innerHTML = `
            <div class="map-object-panel-header">
                <h3>📍 Objetos</h3>
                <span class="count" id="object-count">0</span>
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

        // Bind toggle events
        panel.querySelectorAll('.scope-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setScope(btn.dataset.scope));
        });
    }

    /**
     * Change scope and reload objects
     */
    async setScope(newScope) {
        if (this.viewScope === newScope) return;

        this.viewScope = newScope;

        // Update button states
        document.querySelectorAll('.scope-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scope === newScope);
        });

        // Reload objects
        await this.loadObjects();
    }

    /**
     * Update the object panel with loaded objects
     */
    updateObjectPanel() {
        const listEl = document.getElementById('map-object-list');
        const countEl = document.getElementById('object-count');

        if (!listEl) return;

        countEl.textContent = this.objects.length;

        if (this.objects.length === 0) {
            listEl.innerHTML = '<p style="color:#666; text-align:center; padding:20px;">Sin objetos</p>';
            return;
        }

        listEl.innerHTML = this.objects.map(obj => {
            const confidence = obj.metadata?.confidence || 0;
            const ownerHtml = (this.viewScope === 'all' && !obj.is_mine)
                ? `<div class="map-object-owner" data-owner-id="${obj.owner_id}">
                     <img src="${obj.owner_avatar || '/icons/default-avatar.svg'}" alt="" class="owner-avatar">
                     <span>@${obj.owner_name || 'usuario'}</span>
                   </div>`
                : '';

            return `
                <div class="map-object-item" data-id="${obj.id}">
                    <div class="map-object-icon">${this.getTypeIcon(obj.tipo)}</div>
                    <div class="map-object-info">
                        <div class="name">${obj.nombre || 'Sin nombre'}</div>
                        <div class="type">${obj.tipo || 'Desconocido'}</div>
                        ${ownerHtml}
                    </div>
                    <div class="map-object-confidence">${(confidence * 100).toFixed(0)}%</div>
                </div>
            `;
        }).join('');

        // Add click handlers
        listEl.querySelectorAll('.map-object-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.flyToObject(id);

                // Update active state
                listEl.querySelectorAll('.map-object-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Add click handlers for owner elements
        listEl.querySelectorAll('.map-object-owner').forEach(owner => {
            owner.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger parent item click
                const ownerId = owner.dataset.ownerId;
                if (ownerId) this.showProfileModal(ownerId);
            });
        });
    }

    /**
     * Fly to a specific object and open its popup
     */
    flyToObject(objectId) {
        const marker = this.markers[objectId];
        if (!marker) {
            console.warn('Marker not found for object:', objectId);
            return;
        }

        // Fly to the marker location
        const latLng = marker.getLatLng();
        this.map.flyTo(latLng, 17, {
            duration: 1.5
        });

        // Open the popup after flying
        setTimeout(() => {
            marker.openPopup();
        }, 1600);
    }

    /**
     * Fetch objects from Backend API (bypasses RLS)
     */
    async loadObjects() {
        if (!this.isInitialized) return;

        try {
            console.log('📍 Map: Fetching objects from backend API...');

            // Get auth token
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;

            if (!token) {
                console.warn('📍 Map: No auth token available');
                this.updateObjectPanel();
                return;
            }

            const response = await fetch(`/api/objects/map?scope=${this.viewScope}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.error) {
                console.error('📍 Map: API error:', result.error);
            }

            console.log('📍 Map: Loaded', result.objects?.length || 0, 'objects', result.objects);
            this.objects = result.objects || [];
            this.renderMarkers(this.objects);
            this.updateObjectPanel();

        } catch (e) {
            console.error('📍 Map: Failed to load objects:', e);
            const listEl = document.getElementById('map-object-list');
            if (listEl) {
                listEl.innerHTML = '<p style="color:#ff6666; text-align:center; padding:20px;">Error al cargar objetos</p>';
            }
        }
    }

    /**
     * Render markers on the map
     */
    renderMarkers(objects) {
        this.layerGroup.clearLayers();
        this.markers = {};

        let validCount = 0;

        objects.forEach(obj => {
            const coords = this.parseWKBPoint(obj.posicion);
            if (!coords) {
                console.warn('Skipping object without valid coords:', obj.nombre);
                return;
            }

            validCount++;
            const [lat, lon] = coords;
            const confidence = obj.metadata?.confidence || 0.5;

            const color = confidence > 0.8 ? '#00d4aa' : '#3fa8ff';

            const customIcon = L.divIcon({
                className: 'holo-marker',
                html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
                        <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.6)" />
                        <circle cx="12" cy="12" r="4" fill="${color}" />
                       </svg>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
                popupAnchor: [0, -14]
            });

            const marker = L.marker([lat, lon], { icon: customIcon });

            const imageData = obj.metadata?.image_base64;

            // Owner section for objects from other users
            const ownerSection = (this.viewScope === 'all' && !obj.is_mine && obj.owner_name)
                ? `<div class="popup-owner" data-owner-id="${obj.owner_id}">
                     <img src="${obj.owner_avatar || '/icons/default-avatar.svg'}" class="popup-owner-avatar">
                     <div class="popup-owner-info">
                       <span class="popup-owner-name">@${obj.owner_name}</span>
                       ${obj.owner_bio ? `<span class="popup-owner-bio">${obj.owner_bio.substring(0, 50)}...</span>` : ''}
                     </div>
                   </div>`
                : '';

            const popupContent = `
                <div class="holo-popup-content">
                    <h3>${obj.nombre || 'Sin nombre'}</h3>
                    <p><strong>Tipo:</strong> ${obj.tipo || 'Desconocido'}</p>
                    <p><strong>Confianza:</strong> ${(confidence * 100).toFixed(1)}%</p>
                    <p><strong>Detectado:</strong> ${new Date(obj.created_at).toLocaleDateString()}</p>
                    ${obj.descripcion ? `<p>${obj.descripcion}</p>` : ''}
                    ${imageData ? `<img src="${imageData}" style="width:100%; margin-top:5px; border-radius:4px; max-height:150px; object-fit:cover;">` : ''}
                    ${ownerSection}
                </div>
            `;

            marker.bindPopup(popupContent, {
                className: 'holo-popup',
                maxWidth: 250
            });

            // Add click handler for owner in popup when popup opens
            marker.on('popupopen', () => {
                const popupOwner = document.querySelector('.popup-owner');
                if (popupOwner) {
                    popupOwner.addEventListener('click', () => {
                        const ownerId = popupOwner.dataset.ownerId;
                        if (ownerId) this.showProfileModal(ownerId);
                    });
                }
            });

            this.layerGroup.addLayer(marker);
            this.markers[obj.id] = marker; // Store reference
        });

        console.log('📍 Rendered', validCount, 'markers on map');

        if (validCount > 0) {
            const group = new L.featureGroup(this.layerGroup.getLayers());
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    /**
     * Refresh map size
     */
    invalidateSize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }

    /**
     * Create user profile modal (called once)
     */
    createProfileModal() {
        if (document.getElementById('user-profile-modal')) return;

        const modal = document.createElement('div');
        modal.className = 'user-profile-modal';
        modal.id = 'user-profile-modal';
        modal.innerHTML = `
            <div class="profile-modal-content">
                <button class="profile-modal-close">&times;</button>
                <div class="profile-modal-header">
                    <img class="profile-modal-avatar" src="" alt="">
                    <div class="profile-modal-name"></div>
                </div>
                <div class="profile-modal-bio"></div>
                <div class="profile-modal-stats">
                    <div class="stat-item">
                        <span class="stat-value" id="stat-objects">0</span>
                        <span class="stat-label">📦 Objetos</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="stat-missions">0</span>
                        <span class="stat-label">🗺️ Misiones</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="stat-points">0</span>
                        <span class="stat-label">⭐ Puntos</span>
                    </div>
                </div>
                <div class="profile-modal-since"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.profile-modal-close').addEventListener('click', () => this.hideProfileModal());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideProfileModal();
        });
    }

    /**
     * Show user profile modal
     */
    async showProfileModal(userId) {
        this.createProfileModal();

        const modal = document.getElementById('user-profile-modal');
        if (!modal) return;

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;

            const response = await fetch(`/api/objects/user/${userId}/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const profile = await response.json();

            if (profile.error) {
                console.error('Profile error:', profile.error);
                return;
            }

            // Populate modal
            modal.querySelector('.profile-modal-avatar').src = profile.avatar_url || '/icons/default-avatar.svg';
            modal.querySelector('.profile-modal-name').textContent = `@${profile.username}`;
            modal.querySelector('.profile-modal-bio').textContent = profile.bio || 'Sin descripción';
            modal.querySelector('#stat-objects').textContent = profile.stats?.objects || 0;
            modal.querySelector('#stat-missions').textContent = profile.stats?.missions || 0;
            modal.querySelector('#stat-points').textContent = profile.stats?.points || 0;

            const since = profile.created_at ? new Date(profile.created_at).toLocaleDateString('es', { month: 'short', year: 'numeric' }) : '';
            modal.querySelector('.profile-modal-since').textContent = since ? `📅 Miembro desde ${since}` : '';

            modal.classList.add('active');
        } catch (e) {
            console.error('Failed to load profile:', e);
        }
    }

    /**
     * Hide profile modal
     */
    hideProfileModal() {
        const modal = document.getElementById('user-profile-modal');
        if (modal) modal.classList.remove('active');
    }
}
