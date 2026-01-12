/**
 * MapLocation.js
 * GPS location functionality - Centers map on user's current position
 */

export class MapLocation {
    constructor(mapController) {
        this.controller = mapController;
        this.userMarker = null;
        this.watchId = null;
    }

    /**
     * Request and fly to user's current GPS position
     */
    goToMyLocation() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            this.controller.showToast?.('GPS no soportado en este navegador', 'error');
            return;
        }

        // Show loading state
        const btn = document.getElementById('map-btn-location');
        if (btn) btn.classList.add('loading');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                console.log(`📍 GPS: ${latitude}, ${longitude} (±${Math.round(accuracy)}m)`);

                // Fly to position
                this.controller.map.flyTo([latitude, longitude], 16, { duration: 1.5 });

                // Add/update user marker
                this.setUserMarker(latitude, longitude, accuracy);

                if (btn) btn.classList.remove('loading');
            },
            (error) => {
                console.error('GPS Error:', error);
                if (btn) btn.classList.remove('loading');

                let msg = 'Error obteniendo ubicación';
                if (error.code === 1) msg = 'Permiso de ubicación denegado';
                if (error.code === 2) msg = 'Ubicación no disponible';
                if (error.code === 3) msg = 'Timeout obteniendo ubicación';

                this.controller.showToast?.(msg, 'error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }

    /**
     * Set or update user location marker
     */
    setUserMarker(lat, lon, accuracy) {
        const L = window.L;

        // Remove existing marker
        if (this.userMarker) {
            this.controller.map.removeLayer(this.userMarker);
        }

        // Create pulsing user marker
        const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `
                <div class="user-marker-pulse"></div>
                <div class="user-marker-dot"></div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        this.userMarker = L.marker([lat, lon], { icon: userIcon })
            .addTo(this.controller.map)
            .bindPopup(`
                <div class="user-location-popup">
                    <strong>📍 Tu ubicación</strong>
                    <br><small>±${Math.round(accuracy)}m de precisión</small>
                </div>
            `);
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
