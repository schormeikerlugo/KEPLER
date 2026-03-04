/**
 * MapLocation.js
 * GPS location functionality - Centers map on user's current position
 * Updated for MapLibre GL JS
 */

export class MapLocation {
    constructor(mapController) {
        this.controller = mapController;
        this.userMarker = null;
        this.watchId = null;
    }

    /**
     * Request and fly to user's current GPS position, with IP fallback
     */
    goToMyLocation() {
        // Show loading state
        const btn = document.getElementById('map-btn-location');
        if (btn) btn.classList.add('loading');

        this.controller.controls?.showToast?.('Obteniendo ubicación...');

        const fallbackToIP = async (reason) => {
            console.warn(`GPS failed (${reason}), attempting IP fallback...`);
            try {
                const response = await fetch('https://ipapi.co/json/');
                const data = await response.json();

                if (data.error || !data.latitude || !data.longitude) {
                    throw new Error('IP API return missing or error data');
                }

                console.log(`📡 IP Location: ${data.latitude}, ${data.longitude} (${data.city})`);

                // Fly to position
                this.controller.map.flyTo({
                    center: [data.longitude, data.latitude],
                    zoom: 14, // Slightly wider zoom for IP accuracy
                    duration: 1500
                });

                // Set marker with a generic accuracy for IP
                this.setUserMarker(data.latitude, data.longitude, 5000);

                if (btn) btn.classList.remove('loading');
                this.controller.controls?.showToast?.(`Ubicación aproximada (IP: ${data.city})`, 'success');
            } catch (err) {
                console.error('IP Fallback Error:', err);
                if (btn) btn.classList.remove('loading');
                this.controller.controls?.showToast?.('Error obteniendo ubicación (GPS e IP fallaron)', 'error');
            }
        };

        if (!navigator.geolocation) {
            fallbackToIP('API No Soportada');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                console.log(`📍 GPS: ${latitude}, ${longitude} (±${Math.round(accuracy)}m)`);

                // Fly to position with MapLibre
                this.controller.map.flyTo({
                    center: [longitude, latitude], // MapLibre uses [lng, lat]
                    zoom: 16,
                    duration: 1500
                });

                // Add/update user marker
                this.setUserMarker(latitude, longitude, accuracy);

                if (btn) btn.classList.remove('loading');
                this.controller.controls?.showToast?.(`Ubicación encontrada (±${Math.round(accuracy)}m)`, 'success');
            },
            (error) => {
                console.warn('GPS Error:', error);

                let msg = 'Error desconocido';
                if (error.code === 1) msg = 'Permiso denegado';
                if (error.code === 2) msg = 'Ubicación no disponible';
                if (error.code === 3) msg = 'Timeout';

                // Trigger IP fallback instead of outright failing
                fallbackToIP(msg);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    }

    /**
     * Set or update user location marker (MapLibre version)
     */
    setUserMarker(lat, lon, accuracy) {
        // Remove existing marker
        if (this.userMarker) {
            this.userMarker.remove();
        }

        // Get MapLibre reference from window or map
        const maplibregl = window.maplibregl;
        if (!maplibregl) {
            console.warn('MapLibre GL not available');
            return;
        }

        // Create pulsing user marker element
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        el.innerHTML = `
            <div class="user-marker-pulse"></div>
            <div class="user-marker-dot"></div>
        `;

        // Create MapLibre marker
        this.userMarker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat])
            .setPopup(
                new maplibregl.Popup({ offset: 25 })
                    .setHTML(`
                        <div class="user-location-popup">
                            <strong>📍 Tu ubicación</strong>
                            <br><small>±${Math.round(accuracy)}m de precisión</small>
                            <br><small style="color:#888;">${lat.toFixed(5)}, ${lon.toFixed(5)}</small>
                        </div>
                    `)
            )
            .addTo(this.controller.map);
    }

    /**
     * Start watching position (continuous tracking)
     */
    startTracking() {
        if (!navigator.geolocation || this.watchId) return;

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.setUserMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
            (err) => console.warn('Watch error:', err),
            { enableHighAccuracy: true }
        );
    }

    /**
     * Stop watching position
     */
    stopTracking() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }
}
