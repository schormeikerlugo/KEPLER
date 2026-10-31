/**
 * MapWaypoints.js
 * Handles route planning with waypoints, route lines, and corridor visualization.
 */

import { api } from '../../../js/services/api.js';

export class MapWaypoints {
    constructor(controller) {
        this.controller = controller;
        this.map = controller.map;
        this.waypoints = [];
        this.isRouteMode = false;
        this.popup = null;
    }

    /**
     * Enable route planning mode
     */
    enable() {
        this.isRouteMode = true;
        this.setupLayers();
        this.map.on('click', this.handleClick);
        this.map.getCanvas().style.cursor = 'crosshair';
        console.log('[Waypoints] Route mode enabled');
    }

    /**
     * Disable route planning mode
     */
    disable() {
        this.isRouteMode = false;
        this.map.off('click', this.handleClick);
        this.map.getCanvas().style.cursor = '';
        console.log('[Waypoints] Route mode disabled');
    }

    /**
     * Click handler (bound context)
     */
    handleClick = (e) => {
        if (!this.isRouteMode) return;
        this.addWaypoint(e.lngLat.lat, e.lngLat.lng);
    }

    /**
     * Setup route layers on the map
     */
    setupLayers() {
        if (!this.map) return;

        // Route corridor (buffer)
        if (!this.map.getSource('route-corridor')) {
            this.map.addSource('route-corridor', {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }
            });

            this.map.addLayer({
                id: 'route-corridor-layer',
                type: 'fill',
                source: 'route-corridor',
                paint: {
                    'fill-color': '#3FA8FF',
                    'fill-opacity': 0.08,
                    'fill-outline-color': '#3FA8FF'
                }
            }, 'clusters'); // Below clusters
        }

        // Route line
        if (!this.map.getSource('route-line')) {
            this.map.addSource('route-line', {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
            });

            this.map.addLayer({
                id: 'route-line-layer',
                type: 'line',
                source: 'route-line',
                paint: {
                    'line-color': '#3FA8FF',
                    'line-width': 3,
                    'line-dasharray': [2, 2],
                    'line-opacity': 0.9
                }
            }, 'route-corridor-layer');

            // Route outline glow
            this.map.addLayer({
                id: 'route-line-glow',
                type: 'line',
                source: 'route-line',
                paint: {
                    'line-color': '#3FA8FF',
                    'line-width': 8,
                    'line-opacity': 0.2,
                    'line-blur': 4
                }
            }, 'route-line-layer');
        }

        // Waypoint circles
        if (!this.map.getSource('route-waypoints')) {
            this.map.addSource('route-waypoints', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Outer glow
            this.map.addLayer({
                id: 'waypoint-glow',
                type: 'circle',
                source: 'route-waypoints',
                paint: {
                    'circle-radius': 18,
                    'circle-color': '#3FA8FF',
                    'circle-opacity': 0.15,
                    'circle-blur': 1
                }
            });

            // Main circle
            this.map.addLayer({
                id: 'waypoint-circle',
                type: 'circle',
                source: 'route-waypoints',
                paint: {
                    'circle-radius': 12,
                    'circle-color': '#0d0d0d',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#3FA8FF'
                }
            });

            // Number labels
            this.map.addLayer({
                id: 'waypoint-label',
                type: 'symbol',
                source: 'route-waypoints',
                layout: {
                    'text-field': ['get', 'number'],
                    'text-size': 11,
                    'text-allow-overlap': true
                },
                paint: {
                    'text-color': '#ffffff'
                }
            });
        }
    }

    /**
     * Add a waypoint
     */
    addWaypoint(lat, lng) {
        this.waypoints.push({ lat, lng });
        this.updateLayers();

        // Emit event for UI updates
        window.dispatchEvent(new CustomEvent('kepler:waypoint-added', {
            detail: { lat, lng, count: this.waypoints.length }
        }));

        // Fly to first waypoint
        if (this.waypoints.length === 1) {
            this.map.flyTo({ center: [lng, lat], zoom: 15 });
        }
    }

    /**
     * Remove last waypoint
     */
    removeLastWaypoint() {
        if (this.waypoints.length === 0) return;
        this.waypoints.pop();
        this.updateLayers();

        window.dispatchEvent(new CustomEvent('kepler:waypoint-removed', {
            detail: { count: this.waypoints.length }
        }));
    }

    /**
     * Remove waypoint at index
     */
    removeWaypointAt(index) {
        if (index < 0 || index >= this.waypoints.length) return;
        this.waypoints.splice(index, 1);
        this.updateLayers();

        window.dispatchEvent(new CustomEvent('kepler:waypoint-removed', {
            detail: { count: this.waypoints.length }
        }));
    }

    /**
     * Clear all waypoints
     */
    clearWaypoints() {
        this.waypoints = [];
        this.updateLayers();

        // Clear corridor
        const corridorSource = this.map.getSource('route-corridor');
        if (corridorSource) {
            corridorSource.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } });
        }

        window.dispatchEvent(new CustomEvent('kepler:waypoints-cleared'));
    }

    /**
     * Update all route layers
     */
    updateLayers() {
        // Update waypoints source
        const wpSource = this.map.getSource('route-waypoints');
        if (wpSource) {
            wpSource.setData({
                type: 'FeatureCollection',
                features: this.waypoints.map((wp, i) => ({
                    type: 'Feature',
                    properties: { number: String(i + 1) },
                    geometry: { type: 'Point', coordinates: [wp.lng, wp.lat] }
                }))
            });
        }

        // Update route line
        const lineSource = this.map.getSource('route-line');
        if (lineSource) {
            if (this.waypoints.length < 2) {
                lineSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
            } else {
                lineSource.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: this.waypoints.map(wp => [wp.lng, wp.lat])
                    }
                });
            }
        }
    }

    /**
     * Analyze route corridor
     */
    async analyzeCorridor(bufferMeters = 200) {
        if (this.waypoints.length < 2) return null;

        try {
            const risk = await api.getRouteRiskAssessment(this.waypoints, bufferMeters);

            // Emit event with risk data
            window.dispatchEvent(new CustomEvent('kepler:corridor-analyzed', {
                detail: risk
            }));

            return risk;
        } catch (e) {
            console.error('[Waypoints] Corridor analysis failed:', e);
            return null;
        }
    }

    /**
     * Load route from saved data
     */
    loadRoute(route) {
        this.waypoints = [];
        if (route.waypoints && route.waypoints.length > 0) {
            route.waypoints.forEach(wp => {
                this.waypoints.push({ lat: wp.lat, lng: wp.lng });
            });
            this.updateLayers();

            // Fit bounds
            const bounds = new maplibregl.LngLatBounds();
            this.waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));
            this.map.fitBounds(bounds, { padding: 60 });
        }
    }

    /**
     * Get current waypoints
     */
    getWaypoints() {
        return this.waypoints;
    }

    /**
     * Calculate total distance
     */
    getTotalDistance() {
        let total = 0;
        for (let i = 1; i < this.waypoints.length; i++) {
            total += this.getDistance(this.waypoints[i-1], this.waypoints[i]);
        }
        return total; // meters
    }

    /**
     * Haversine distance between two points
     */
    getDistance(a, b) {
        const R = 6371000;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLng = (b.lng - a.lng) * Math.PI / 180;
        const x = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
    }
}