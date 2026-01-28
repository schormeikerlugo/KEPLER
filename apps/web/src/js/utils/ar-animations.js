/**
 * AR Animations System - Death Stranding Inspired Effects
 * Uses GSAP (GreenSock) for high-performance animations
 */

import gsap from 'gsap';

class ARAnimationsSystem {
    constructor() {
        this.isInitialized = false;
        this.activeAnimations = new Map();
    }

    /**
     * Initialize GSAP with optimal settings
     */
    initializeGSAP() {
        if (this.isInitialized) return;

        // Set default easing for smoother animations
        gsap.defaults({
            ease: 'power2.out',
            duration: 0.6
        });

        this.isInitialized = true;
        console.log('[ARAnimations] GSAP initialized');
    }

    /**
     * Holographic Scan Effect - Expanding wave from center
     * @param {HTMLElement} element - Target element (usually reticle)
     * @param {Object} options - Animation options
     */
    createHolographicScanEffect(element, options = {}) {
        const {
            duration = 1.5,
            color = 'rgba(0, 255, 150, 0.6)',
            onComplete = null
        } = options;

        // Create scan wave element if it doesn't exist
        let scanWave = element.querySelector('.scan-wave');
        if (!scanWave) {
            scanWave = document.createElement('div');
            scanWave.className = 'scan-wave';
            element.appendChild(scanWave);
        }

        // Reset and animate
        gsap.set(scanWave, {
            scale: 0,
            opacity: 1,
            borderColor: color
        });

        const tl = gsap.timeline({
            onComplete: () => {
                if (onComplete) onComplete();
            }
        });

        tl.to(scanWave, {
            scale: 3,
            opacity: 0,
            duration: duration,
            ease: 'power2.out'
        });

        return tl;
    }

    /**
     * Animate HUD element entry (from hidden to visible)
     * @param {HTMLElement} element - HUD element
     * @param {String} direction - Entry direction: 'left', 'right', 'top', 'bottom', 'center'
     */
    animateHUDEntry(element, direction = 'center') {
        const animations = {
            left: { x: -100, opacity: 0 },
            right: { x: 100, opacity: 0 },
            top: { y: -100, opacity: 0 },
            bottom: { y: 100, opacity: 0 },
            center: { scale: 0.5, opacity: 0 }
        };

        const fromState = animations[direction] || animations.center;

        gsap.fromTo(element,
            { ...fromState },
            {
                x: 0,
                y: 0,
                scale: 1,
                opacity: 1,
                duration: 0.8,
                ease: 'power3.out'
            }
        );
    }

    /**
     * Animate HUD element exit
     * @param {HTMLElement} element - HUD element
     * @param {Function} onComplete - Callback after animation
     */
    animateHUDExit(element, onComplete = null) {
        gsap.to(element, {
            scale: 0.5,
            opacity: 0,
            duration: 0.4,
            ease: 'power2.in',
            onComplete: onComplete
        });
    }

    /**
     * Glitch Effect - Temporary distortion
     * @param {HTMLElement} element - Target element
     * @param {Number} intensity - Glitch intensity (0-1)
     */
    createGlitchEffect(element, intensity = 0.5) {
        const tl = gsap.timeline();

        const maxShift = intensity * 10;

        tl.to(element, {
            x: gsap.utils.random(-maxShift, maxShift),
            duration: 0.05,
            repeat: 5,
            yoyo: true
        })
        .to(element, {
            x: 0,
            duration: 0.05
        });

        return tl;
    }

    /**
     * Animate 3D marker appearance
     * @param {HTMLElement} element - Marker label element
     */
    animateMarkerAppear(element) {
        gsap.fromTo(element,
            {
                scale: 0,
                y: 50,
                opacity: 0
            },
            {
                scale: 1,
                y: 0,
                opacity: 1,
                duration: 0.6,
                ease: 'back.out(1.7)'
            }
        );
    }

    /**
     * Animate modal open
     * @param {HTMLElement} modal - Modal element
     */
    animateModalOpen(modal) {
        // Set display first, then animate
        modal.style.display = 'block';
        
        // Reset any previous GSAP properties
        gsap.set(modal, { clearProps: 'all' });
        modal.style.display = 'block';

        gsap.fromTo(modal,
            {
                scale: 0.8,
                opacity: 0,
                y: 20
            },
            {
                scale: 1,
                opacity: 1,
                y: 0,
                duration: 0.4,
                ease: 'power3.out'
            }
        );
    }

    /**
     * Animate modal close
     * @param {HTMLElement} modal - Modal element
     * @param {Function} onComplete - Callback to hide element
     */
    animateModalClose(modal, onComplete = null) {
        gsap.to(modal, {
            scale: 0.8,
            opacity: 0,
            y: 20,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => {
                modal.style.display = 'none';
                // Clear GSAP inline styles to prevent conflicts
                gsap.set(modal, { clearProps: 'transform,opacity' });
                if (onComplete) onComplete();
            }
        });
    }

    /**
     * Pulse effect with GSAP Timeline
     * @param {HTMLElement} element - Element to pulse
     * @param {String} color - Pulse color
     */
    pulseElement(element, color = 'rgba(0, 255, 255, 0.8)') {
        const tl = gsap.timeline({ repeat: -1, yoyo: true });

        tl.to(element, {
            scale: 1.1,
            boxShadow: `0 0 20px ${color}`,
            duration: 0.8,
            ease: 'power1.inOut'
        });

        this.activeAnimations.set(element, tl);
        return tl;
    }

    /**
     * Stop pulse animation
     * @param {HTMLElement} element - Element to stop pulsing
     */
    stopPulse(element) {
        const tl = this.activeAnimations.get(element);
        if (tl) {
            tl.kill();
            this.activeAnimations.delete(element);
            gsap.to(element, { scale: 1, boxShadow: 'none', duration: 0.3 });
        }
    }

    /**
     * Create detection box animation (Death Stranding style corners)
     * @param {HTMLElement} box - Detection box element
     * @param {Boolean} locked - Whether object is locked/recognized
     */
    animateDetectionBox(box, locked = false) {
        const color = locked ? 'rgba(0, 255, 255, 0.9)' : 'rgba(255, 100, 0, 0.7)';
        
        gsap.fromTo(box,
            {
                scale: 0.8,
                opacity: 0
            },
            {
                scale: 1,
                opacity: 1,
                borderColor: color,
                boxShadow: `0 0 15px ${color}`,
                duration: 0.3,
                ease: 'power2.out'
            }
        );

        if (locked) {
            // Lock animation - corners expand
            gsap.to(box, {
                scale: 1.05,
                duration: 0.2,
                repeat: 1,
                yoyo: true,
                ease: 'power1.inOut'
            });
        }
    }

    /**
     * Animate scanline overlay
     * @param {HTMLElement} container - Container for scanlines
     */
    createScanlineEffect(container) {
        let scanlineDiv = container.querySelector('.scanline-overlay');
        
        if (!scanlineDiv) {
            scanlineDiv = document.createElement('div');
            scanlineDiv.className = 'scanline-overlay';
            container.appendChild(scanlineDiv);
        }

        // Continuous scanline animation
        gsap.to(scanlineDiv, {
            backgroundPosition: '0 100%',
            duration: 3,
            repeat: -1,
            ease: 'none'
        });

        this.activeAnimations.set('scanlines', scanlineDiv);
    }

    /**
     * Compass smooth rotation
     * @param {HTMLElement} compassStrip - Compass strip element
     * @param {Number} heading - Heading in degrees
     */
    animateCompass(compassStrip, heading) {
        // Initialize state if missing
        if (!this.compassState) {
            this.compassState = {
                lastHeading: heading,
                virtualHeading: heading,
                renderHeading: heading
            };
        }

        // 1. Calculate shortest path delta
        let delta = heading - this.compassState.lastHeading;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        // 2. Update virtual heading (continuous, unbounded)
        this.compassState.virtualHeading += delta;
        this.compassState.lastHeading = heading;

        // 3. Define Metric
        // We assume 1 cycle (360deg) corresponds to a specific pixel width.
        // We revert to 2px/deg as per legacy code (visual density has not changed).
        const pixelsPerDeg = 2; 
        const cycleWidth = 360 * pixelsPerDeg;

        // 4. Animate 'renderHeading' to the new 'virtualHeading'
        gsap.to(this.compassState, {
            renderHeading: this.compassState.virtualHeading,
            duration: 0.3,
            ease: 'power1.out',
            overwrite: 'auto', // Important so we don't fight previous tweens
            onUpdate: () => {
                // 5. Wrap visually to stay within the first cycle
                // We use modulo to map the unbounded virtual heading back to [0, 360]
                
                let h = this.compassState.renderHeading;
                // Shift h so we are not near 0 to avoid negative modulo weirdness easily
                // or just use proper modulo logic: ((h % n) + n) % n
                
                let wrappedH = ((h % 360) + 360) % 360;
                
                // We offset by 1 full cycle (360) to ensure we are rendering in the "middle" 
                // of our 3-cycle strip (S.. S.. S..) so edges aren't visible?
                // Our HTML starts with S. 
                // wrappedH 0 -> x = 0 (Start). 
                // wrappedH 359 -> x = -Width.
                
                let x = -wrappedH * pixelsPerDeg;
                
                compassStrip.style.transform = `translateX(${x}px)`;
            }
        });
    }

    /**
     * Loading spinner with GSAP
     * @param {HTMLElement} element - Loading element
     */
    animateLoader(element) {
        const tl = gsap.timeline({ repeat: -1 });
        
        tl.to(element, {
            rotation: 360,
            duration: 1,
            ease: 'none'
        });

        this.activeAnimations.set(element, tl);
        return tl;
    }

    /**
     * Kill all active animations
     */
    killAllAnimations() {
        this.activeAnimations.forEach(tl => tl.kill());
        this.activeAnimations.clear();
    }

    /**
     * Create stagger animation for multiple elements
     * @param {NodeList|Array} elements - Elements to animate
     * @param {Object} animProps - Animation properties
     */
    staggerAnimation(elements, animProps = {}) {
        gsap.from(elements, {
            opacity: 0,
            y: 20,
            stagger: 0.1,
            duration: 0.5,
            ease: 'power2.out',
            ...animProps
        });
    }
}

// Export singleton instance
export const ARAnimations = new ARAnimationsSystem();
