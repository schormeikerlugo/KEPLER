import * as THREE from 'three';
import { gpsToVector, getDistance } from '../utils/geo.js';

export class MarkerSystem {
    constructor() {
        this.loader = new THREE.TextureLoader(); // If we needed textures
    }

    /**
     * Creates a Three.js Group representing a POI
     */
    createMarker(poi, userLocation) {
        const group = new THREE.Group();

        // Calculate Position
        const [x, y, z] = gpsToVector(userLocation.lat, userLocation.lng, poi.lat, poi.lng);
        group.position.set(x, poi.altitude || 0, z);

        // Distance Check for color/LOD
        // We calculate initial style here, but update loop handled elsewhere?
        // In Vanilla Three.js, it's better to add an 'update' method to the mesh userdata
        // so the main loop can call it.
        
        // Color Coding (Extended Palette)
        let color = 0x00A8FF; // Default (Common/Object) - Blue
        
        const type = (poi.type || '').toLowerCase();
        
        if (type === 'marker' || type === 'hazard') color = 0xFF5500; // Orange
        else if (type === 'tech') color = 0x00FFFF;   // Cyan/Silver
        else if (type === 'plant') color = 0x00FF00;  // Green
        else if (type === 'animal') color = 0xFFD700; // Gold/Yellow
        else if (type === 'person') color = 0xDDA0DD; // Plum/Purple
        else if (type === 'place') color = 0xFFFFFF;  // White
        else if (type === 'water') color = 0x0080FF;  // Aqua
        else if (type === 'base') color = 0x00FF00;   // Legacy Green

        // 1. The Stick (Cylinder)
        const geometryStick = new THREE.CylinderGeometry(0.02, 0.02, 2, 8);
        const materialStick = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.6 
        });
        const stick = new THREE.Mesh(geometryStick, materialStick);
        stick.position.y = -1; // Stick down from center
        group.add(stick);

        // 2. The Icon (Octahedron)
        const geometryIcon = new THREE.OctahedronGeometry(0.5);
        const materialIcon = new THREE.MeshBasicMaterial({ 
            color: color, 
            wireframe: true 
        });
        const icon = new THREE.Mesh(geometryIcon, materialIcon);
        icon.position.y = 1;
        
        // Add animation data
        icon.userData = {
            isIcon: true,
            baseY: 1,
            speed: 2,
            amp: 0.2
        };
        group.add(icon);

        // 3. HTML Label (We will project this 3D position to 2D screen in the View loop)
        // For now, let's stick to 3D geometry or simple DOM overlays managed by View.
        // Let's store metadata so the View knows to draw a label.
        group.userData = {
            id: poi.id,
            title: poi.title,
            type: poi.type,
            lat: poi.lat,
            lng: poi.lng,
            color: color
        };

        return group;
    }
}
