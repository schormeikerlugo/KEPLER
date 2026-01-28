import * as THREE from 'three';

export class ScannerEffect {
    constructor(scene) {
        this.scene = scene;
        this.isScanning = false;
        this.mesh = null;
        
        // Shader Uniforms
        this.uniforms = {
            uTime: { value: 0 },
            uCenter: { value: new THREE.Vector3(0, 0, 0) },
            uPulseRadius: { value: 0 },
            uMaxRadius: { value: 50.0 }, // 50 meters range
            uPulseColor: { value: new THREE.Color(0x00ffff) }, // Cyan
            uGridColor: { value: new THREE.Color(0x004488) }, // Darker Blue for persistent grid
        };

        this.init();
    }

    init() {
        // Vertex Shader
        const vertexShader = `
            varying vec3 vWorldPosition;
            varying vec2 vUv;
            
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        // Fragment Shader (Pulse + Grid)
        const fragmentShader = `
            uniform float uPulseRadius;
            uniform float uMaxRadius;
            uniform vec3 uPulseColor;
            uniform vec3 uGridColor;
            uniform vec3 uCenter;
            
            varying vec3 vWorldPosition;
            varying vec2 vUv;

            void main() {
                // 1. Grid Pattern calculation
                // Use absolute world coordinates for grid so it doesn't move with the plane if we move the plane
                float gridSize = 1.0; // 1 meter grid
                
                // Simple anti-aliased grid lines
                vec2 grid = abs(fract(vWorldPosition.xz / gridSize - 0.5) - 0.5) / fwidth(vWorldPosition.xz / gridSize);
                float line = min(grid.x, grid.y);
                float gridIntensity = 1.0 - min(line, 1.0);
                
                // Base grid visibility (fades out with distance)
                float centerDist = distance(vWorldPosition.xz, uCenter.xz);
                float gridAlpha = gridIntensity * 0.3 * (1.0 - smoothstep(0.0, uMaxRadius, centerDist));


                // 2. Pulse Calculation
                float dist = distance(vWorldPosition, uCenter);
                float width = 2.0; // Pulse width in meters
                
                float pulse = smoothstep(uPulseRadius - width, uPulseRadius, dist) - 
                              smoothstep(uPulseRadius, uPulseRadius * 1.05, dist);
                              
                // Pulse Alpha (stronger than grid)
                float pulseAlpha = pulse * 0.8 * (1.0 - (uPulseRadius / uMaxRadius));
                
                // Combine
                vec3 finalColor = uPulseColor;
                float finalAlpha = max(gridAlpha, pulseAlpha);
                
                // If pure grid (no pulse hitting it), use grid color
                if (pulseAlpha < 0.1) {
                    finalColor = uGridColor;
                } else {
                    finalColor = mix(uGridColor, uPulseColor, pulseAlpha); // Pulse glows on top
                }

                if (finalAlpha < 0.05) discard;

                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `;

        // Create Plane (Large, to cover ground)
        // We use a large plane geometry. 
        // For AR, we assume user is at (0,0,0) and ground is at y = -1.6 (approx camera height)
        // Optimization: Reduced segments from 100x100 to 1x1. 
        // The shader manages the grid/pulse pixel-perfectly using WorldPosition. 
        // We don't need high vertex density for a flat plane.
        
        const geometry = new THREE.PlaneGeometry(200, 200, 1, 1);
        geometry.rotateX(-Math.PI / 2); // Lay flat
        
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.DoubleSide
            // blending: THREE.AdditiveBlending // Optional for neon look
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = -1.5; // Approximate ground level assuming user holds phone at 1.5m
        this.scene.add(this.mesh);
    }

    startScan(origin) {
        this.isScanning = true;
        this.uniforms.uPulseRadius.value = 0;
        // If origin provided, update uCenter (but keep y at ground level)
        // this.uniforms.uCenter.value.set(origin.x, -1.5, origin.z);
    }

    update(dt) {
        if (this.isScanning) {
            // Expand at speed of sound... or slower for effect ;)
            // Speed = 15m/s
            this.uniforms.uPulseRadius.value += 15 * dt; 

            if (this.uniforms.uPulseRadius.value > this.uniforms.uMaxRadius.value) {
                this.uniforms.uPulseRadius.value = 0;
                this.isScanning = false;
            }
        }
    }

    setVisible(visible) {
        if(this.mesh) this.mesh.visible = visible;
    }
}
