
import * as THREE from 'three';

export class ARMarkerController {
    constructor(context) {
        this.context = context; // Access to main ARController
    }

    renderMarkers(missions) {
        // Clear logic delegates to Engine
        this.context.arEngine.clearMarkers();
        
        const labelsContainer = this.context.ui.ui.labelsContainer; // Access deeply nested UI or via context.ui
        // Alternatively, use document selector if context.ui doesn't expose it cleanly yet
        // Let's use document.getElementById as backup or rely on context.ui
        const container = document.getElementById('labels-container');
        if(container) container.innerHTML = '';

        this.context.state.markers = []; // Reset local state reference

        missions.forEach(poi => {
            const lastLocation = this.context.state.lastLocation;
            
            // Create 3D Marker
            const markerGroup = this.context.markerSystem.createMarker(poi, lastLocation);
            this.context.arEngine.addMarker(markerGroup);
            
            // Create 2D Label
            const labelDiv = document.createElement('div');
            labelDiv.className = 'ar-label';
            labelDiv.innerHTML = `<b>${poi.title}</b><br>Analyzing...`;
            labelDiv.style.display = 'none';
            
            // Interaction
            labelDiv.addEventListener('click', (e) => {
                 e.stopPropagation();
                 // Calculate distance now for fresh data
                 if(this.context.state.lastLocation) {
                     poi.metadata = poi.metadata || {};
                     poi.metadata.distance = this.getDistance(
                         this.context.state.lastLocation.lat, this.context.state.lastLocation.lng,
                         poi.lat, poi.lng
                     );
                 }
                 this.context.ui.openMarkerModal(poi);
            });
            
            if(container) container.appendChild(labelDiv);
            
            this.context.state.markers.push({
                mesh: markerGroup,
                label: labelDiv,
                poi: poi
            });
        });
    }

    updateMarkerPositions() {
        const arEngine = this.context.arEngine;
        if(!arEngine.camera) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const widthHalf = width / 2;
        const heightHalf = height / 2;
        const lastLocation = this.context.state.lastLocation;

        this.context.state.markers.forEach(item => {
            const { mesh, label, poi } = item;
            
            const pos = new THREE.Vector3();
            if(mesh.children.length > 1) {
                // Usually the second child is the visible Icon if Group structure is used
                mesh.children[1].getWorldPosition(pos);
            } else {
                mesh.getWorldPosition(pos);
            }
            
            // Project 3D -> 2D
            pos.project(arEngine.camera);
            
            const x = (pos.x * widthHalf) + widthHalf;
            const y = -(pos.y * heightHalf) + heightHalf;

            // Check visibility (in front of camera)
            if(pos.z < 1 && x > 0 && x < width && y > 0 && y < height) {
                 // Check distance
                 let dist = 1000;
                 if(lastLocation) {
                     dist = this.getDistance(
                         lastLocation.lat, lastLocation.lng,
                         poi.lat, poi.lng
                     );
                 }
                 
                 // Scale by distance (Effect: Closer = Larger)
                 const scale = Math.max(0.8, Math.min(1.5, 60 / dist));
                 
                 label.style.display = 'block';
                 label.style.transform = `translate(-50%, -50%) scale(${scale})`;
                 label.style.left = `${x}px`;
                 label.style.top = `${y}px`;
                 label.innerHTML = `<b>${poi.title}</b><br>${dist.toFixed(0)}m`;
                 label.style.zIndex = Math.max(0, 1000 - Math.floor(dist)); 
                 
                 // Add Entry Animation Class if new
                 if(!label.classList.contains('ar-marker-entry')) {
                     label.classList.add('ar-marker-entry');
                 }

            } else {
                label.style.display = 'none';
            }
        });
    }

    getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lng2-lng1) * Math.PI/180;
      
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
}
