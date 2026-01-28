/**
 * MapMarkers.js
 * Handles marker rendering, popup creation, and marker interactions.
 */

export class MapMarkers {
    constructor(controller) {
        this.controller = controller;
        this.map = controller.map;
        this.markers = {}; // Object ID -> Marker instance
    }

    /**
     * Get emoji icon for object type
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
     * Get color for object type (used for pulsing animation)
     */
    getTypeColor(tipo) {
        const colors = {
            'tech': '#00f7ff',      // Cyan
            'marker': '#ff0055',    // Red
            'rock': '#aaaaaa',      // Grey
            'crater': '#ffaa00',    // Orange
            'artifact': '#bd00ff',  // Purple
            'structure': '#00ffaa', // Mint
            'flora': '#39ff14',     // Neon Green
            'unknown': '#ffffff'    // White
        };
        return colors[tipo?.toLowerCase()] || '#ffffff';
    }

    /**
     * Clear all markers from the map
     */
    clearMarkers() {
        Object.values(this.markers).forEach(marker => marker.remove());
        this.markers = {};
    }

    /**
     * Render markers for given objects
     */
    renderMarkers(objectsToRender) {
        this.clearMarkers();

        objectsToRender.forEach(obj => {
            const coords = this.controller.parseWKBPoint(obj.posicion);
            if (!coords) return;

            // Convert to [Lng, Lat] for MapLibre
            const lngLat = [coords[1], coords[0]];

            // Create marker element
            const el = this.createMarkerElement(obj);

            // Create marker
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat(lngLat)
                .addTo(this.map);

            // Create and attach popup
            const popup = this.createPopup(obj);
            marker.setPopup(popup);

            this.markers[obj.id] = marker;
        });
    }

    /**
     * Create marker DOM element
     */
    createMarkerElement(obj) {
        const el = document.createElement('div');
        el.className = 'custom-marker';

        const color = this.getTypeColor(obj.tipo);
        const delay = Math.random() * 3;

        el.style.setProperty('--marker-color', color);

        el.innerHTML = `
            <div class="marker-pin">${this.getTypeIcon(obj.tipo)}</div>
            <div class="marker-pulse" style="animation-delay: -${delay.toFixed(2)}s"></div>
        `;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.flyToObject(obj.id);
        });

        return el;
    }

    /**
     * Create popup for marker
     */
    createPopup(obj) {
        const popupNode = document.createElement('div');
        popupNode.className = 'popup-content';

        // 1. Image
        const imgSrc = obj.metadata?.image_base64 || obj.imagen;
        if (imgSrc && imgSrc.length > 50) {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.className = 'popup-image';
            Object.assign(img.style, {
                width: '100%',
                borderRadius: '4px',
                marginBottom: '8px',
                height: 'auto',
                maxHeight: '250px',
                objectFit: 'contain',
                backgroundColor: 'rgba(0,0,0,0.3)'
            });
            popupNode.appendChild(img);
        }

        // 2. Info
        const info = document.createElement('div');
        const confVal = obj.metadata?.confidence ? (obj.metadata.confidence * 100).toFixed(0) : '0';

        info.innerHTML = `
            <h3>${obj.nombre || 'Sin nombre'}</h3>
            <div>
                <span class="popup-type-tag" style="background:rgba(63,168,255,0.2); color:#4db8ff; padding:2px 6px; border-radius:4px; font-size:0.7rem; text-transform:uppercase;">
                    ${obj.tipo || 'DESCONOCIDO'}
                </span>
            </div>
            <p style="margin-top:8px;">${obj.descripcion || 'Sin descripción'}</p>
            <div class="popup-meta" style="margin-top:5px; font-size:0.8rem; color:#888;">
                <span>Confianza: ${confVal}%</span>
            </div>
        `;
        popupNode.appendChild(info);

        // 3. Owner
        if (obj.owner_id && !obj.is_mine) {
            const owner = this.createOwnerElement(obj);
            popupNode.appendChild(owner);
        }

        return new maplibregl.Popup({ offset: 25, className: 'custom-popup', maxWidth: '300px' })
            .setDOMContent(popupNode);
    }

    /**
     * Create owner section for popup
     */
    createOwnerElement(obj) {
        const owner = document.createElement('div');
        owner.className = 'popup-owner';
        Object.assign(owner.style, {
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
        });

        owner.innerHTML = `
            <img src="${obj.owner_avatar || 'src/assets/icons/default-avatar.svg'}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
            <span style="color:var(--color-primary); font-size:0.85rem;">@${obj.owner_name || 'Explorador'}</span>
        `;

        owner.onclick = (e) => {
            e.stopPropagation();
            this.controller.showProfileModal(obj.owner_id);
        };

        return owner;
    }

    /**
     * Fly to a specific object on the map
     */
    flyToObject(objectId) {
        const obj = this.controller.objects.find(o => o.id === objectId);
        if (!obj) return;

        const coords = this.controller.parseWKBPoint(obj.posicion);
        if (!coords) return;

        const lngLat = [coords[1], coords[0]];

        this.map.flyTo({
            center: lngLat,
            zoom: 17,
            essential: true
        });

        // Open popup
        const marker = this.markers[objectId];
        if (marker) {
            marker.togglePopup();
        }
    }

    /**
     * Get marker by object ID
     */
    getMarker(objectId) {
        return this.markers[objectId];
    }
}
