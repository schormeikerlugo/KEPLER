import * as THREE from 'three';
import { ScannerEffect } from '../effects/ScannerEffect.js';

export class AREngine {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.worldGroup = null; 
        this.scanner = null; // New Scanner Effect
        this.video = null;
        this.clock = new THREE.Clock(); // For delta time
        
        this.fov = 80;
        this.heading = 0;
        this.headingOffset = 0;
        
        this.headingOffset = 0;
        
        // Raycasting for "Gravity"
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);

        this.isRunning = false;
    }

    async init() {
        // 1. Setup Scene
        this.scene = new THREE.Scene();

        // 2. Setup Camera
        this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 0);

        // 3. Setup Renderer (Transparent to show video behind)
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '10'; // Canvas in middle (above video)
        this.renderer.autoClear = false; // We will clear manually
        this.container.appendChild(this.renderer.domElement);

        // 4. Setup Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(0, 10, 0);
        this.scene.add(pointLight);

        // 5. World Group (The Anchor)
        this.worldGroup = new THREE.Group();
        this.scene.add(this.worldGroup);

        // 6. Setup Scanner Effect (Replaces simple Grid)
        this.scanner = new ScannerEffect(this.worldGroup);
        // this.scanner.mesh is added to worldGroup by the class itself? Class adds to passed scene.
        // Let's verify ScannerEffect code: "this.scene.add(this.mesh)". 
        // If we pass worldGroup as 'scene', it works and rotates with world!
        // (Original code used grid.position.y = -2)
        // Scanner defaults to -1.5. Good.

        // 7. Initialize Video Background
        await this.setupCameraFeed();

        // Handle Resize
        window.addEventListener('resize', () => this.onResize());

        this.isRunning = true;
        this.animate();
    }

    async setupCameraFeed() {
        this.video = document.createElement('video');
        this.video.setAttribute('autoplay', '');
        this.video.setAttribute('muted', '');
        this.video.setAttribute('playsinline', '');
        
        // CSS to make it a background
        Object.assign(this.video.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: '5', // Video slightly above background
            transform: 'scale(1)', // Will be updated for zoom
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out'
        });

        this.container.prepend(this.video);

        const tryCamera = async (constraints) => {
            try {
                // If constraints is boolean true, use it directly as the video property
                const videoConstraints = constraints === true ? true : constraints;
                return await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            } catch (e) {
                console.warn("Camera attempt failed:", e.name, constraints);
                return null;
            }
        };

        // Attempt 1: Optimal Mobile (Back Camera + 1080p)
        // This often fails on Desktop because 'environment' facing mode is rarely supported or no back cam exists.
        let stream = await tryCamera({ 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        });

        // Attempt 2: Minimal Mobile (Back Camera, Any Resolution)
        if (!stream) {
             console.log("High-res mobile cam failed. Trying standard back cam...");
             stream = await tryCamera({ facingMode: 'environment' });
        }

        // Attempt 3: Universal Fallback (Any Camera, Any Res)
        // This is what Desktop needs. { video: true }
        if (!stream) {
             console.log("Mobile camera failed. Trying generic webcam...");
             stream = await tryCamera(true);
        }

        if (stream) {
            this.video.srcObject = stream;
            await this.video.play();
            console.log("AREngine: Camera started", this.video.videoWidth, "x", this.video.videoHeight);
        } else {
            console.error("Camera access denied AR: All attempts failed.");
            throw new Error("No se pudo acceder a ninguna cámara.");
        }
    }

    setHeading(degrees) {
        this.heading = degrees;
    }

    setHeadingOffset(degrees) {
        this.headingOffset = degrees;
    }

    setFov(fov) {
        this.fov = fov;
        if(this.camera) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
        // CSS Zoom effect on video
        // Default 80 = Scale 1
        if(this.video) {
            const scale = 80 / fov;
            this.video.style.transform = `scale(${scale})`;
        }
    }

    triggerScan() {
        if(this.scanner) {
            console.log("AREngine: Triggering 3D Scan");
            this.scanner.startScan();
        }
    }

    addMarker(mesh) {
        this.getMarkersGroup().add(mesh);
    }

    clearMarkers() {
        // Remove children that are not the grid? 
        // For simplicity, let's keep grid at index 0 or manage a separate group
        // Better: create a 'markersGroup' inside worldGroup
        if(!this.markersGroup) {
            this.markersGroup = new THREE.Group();
            this.worldGroup.add(this.markersGroup);
        }
        this.markersGroup.clear();
    }

    getMarkersGroup() {
        if(!this.markersGroup) {
            this.markersGroup = new THREE.Group();
            this.worldGroup.add(this.markersGroup);
        }
        return this.markersGroup;
    }

    clampToGround(object) {
        if(!this.scanner || !this.scanner.mesh) return;

        // 1. Position object high up
        const currentPos = object.position.clone();
        object.position.y = 50;
        object.updateMatrixWorld(); // Ensure world coords are fresh

        // 2. Cast Ray down
        this.raycaster.set(object.position, this.downVector);

        // 3. Intersect with Ground (Scanner Mesh)
        // In a real WebXR app, this would be an array of detected planes.
        // Here we use our Virtual Floor (Scanner) which represents the ground level (-1.5m relative to cam)
        const intersects = this.raycaster.intersectObject(this.scanner.mesh);

        if (intersects.length > 0) {
            // 4. Adjust height to impact point
            object.position.y = intersects[0].point.y;
            // console.log("Gravity: Landed at", object.position.y);
        } else {
            // Fallback: Restore original or default to ground level
            object.position.y = -1.5; 
        }
    }

    onResize() {
        if(this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());

        // Update World Rotation based on Compass
        // targetRot = -heading
        const correctedHeading = this.heading + this.headingOffset;
        const targetRotRad = THREE.MathUtils.degToRad(-correctedHeading);
        
        // Smooth interpolation (Lerp)
        // Note: processing rotation in Y only
        // Shortest path interpolation for angles? 
        // For now simple lerp, might glitch slightly at 360->0 boundary
        
        // Basic angle lerp fix
        let currentY = this.worldGroup.rotation.y;
        let diff = targetRotRad - currentY;
        // Normalize diff to -PI, PI
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        
        this.worldGroup.rotation.y = currentY + diff * 0.05;

        const dt = this.clock.getDelta();
        
        // Update Scanner
        if(this.scanner) this.scanner.update(dt);

        // Render with explicit clear to avoid "smearing" artifacts on transparent background
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
    }

    captureFrame() {
        if(!this.video) return null;
        
        try {
            // Create an offscreen canvas
            const canvas = document.createElement('canvas');
            canvas.width = this.video.videoWidth;
            canvas.height = this.video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
            
            // Return Data URL (Base64)
            return canvas.toDataURL('image/jpeg', 0.8);
        } catch (e) {
            console.warn("Frame capture failed (Security/Context):", e);
            return null;
        }
    }

    setGridVisible(visible) {
        if(this.scanner) this.scanner.setVisible(visible);
    }

    dispose() {
        this.isRunning = false;
        // Cleanup Three.js
        if(this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
        if(this.video) {
            const stream = this.video.srcObject;
            if(stream) stream.getTracks().forEach(track => track.stop());
            this.container.removeChild(this.video);
        }
    }
}
