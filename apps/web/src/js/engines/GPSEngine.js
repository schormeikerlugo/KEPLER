export class GPSEngine {
    constructor() {
        this.position = null; // { lat, lng }

        // Sensor Fusion State
        this.filteredHeading = 0;
        this.magneticHeading = 0;
        this.gyroZ = 0; // degrees per second
        this.lastTimestamp = 0;
        this.alpha = 0.98; // Complementary Filter Coeff (Trust Gyro 98%)

        this.smoothingAlpha = 0.2; // For GPS position smoothness
        this.permissionStatus = 'prompt';
        this.watchId = null;
        this.isSensorRunning = false;

        // Callbacks
        this.onPositionUpdate = null; // (pos) => {}
        this.onHeadingUpdate = null; // (heading) => {}
        this.onError = null; // (msg) => {}
    }

    start() {
        if (!navigator.geolocation) {
            console.warn("Geolocation API missing, attempting IP fallback...");
            this.fetchIPLocation();
            return;
        }

        // 1. GPS Tracking
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.handleGPS(pos),
            (err) => this.handleError(err),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );

        // 2. Sensor Fusion (Compass + Gyro)
        this.startSensors();
    }

    async startSensors() {
        // iOS 13+ Permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    this.bindSensorEvents();
                } else {
                    console.warn("Sensor permission denied");
                }
            } catch (e) {
                console.error(e);
            }
        } else {
            // Android / Non-iOS 13+
            this.bindSensorEvents();
        }
    }

    bindSensorEvents() {
        // A. Magnetometer (Absolute Reference)
        // Uses 'deviceorientationabsolute' for Android (more precise) or 'deviceorientation'
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', (e) => this.handleMagnetometer(e));
        } else {
            window.addEventListener('deviceorientation', (e) => this.handleMagnetometer(e));
        }

        // B. Gyroscope (Fast Updates)
        window.addEventListener('devicemotion', (e) => this.handleGyroscope(e));

        // Start Fusion Loop
        this.isSensorRunning = true;
        this.lastTimestamp = performance.now();
        this.fusionLoop();
    }

    stop() {
        if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
        this.isSensorRunning = false;
    }

    handleGPS(pos) {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;

        if (!this.position) {
            this.position = { lat: newLat, lng: newLng, source: 'GPS' };
        } else {
            // Check delta to avoid jitter
            const dist = this.calculateDistance(newLat, newLng, this.position.lat, this.position.lng);

            // If jump > 2m, snap. Else smooth.
            if (dist > 2) {
                this.position = { lat: newLat, lng: newLng, source: 'GPS' };
            } else {
                // Smooth (Lerp)
                this.position = {
                    lat: this.position.lat + (newLat - this.position.lat) * this.smoothingAlpha,
                    lng: this.position.lng + (newLng - this.position.lng) * this.smoothingAlpha,
                    source: 'GPS'
                };
            }
        }

        this.permissionStatus = 'granted';
        if (this.onPositionUpdate) this.onPositionUpdate(this.position);
    }

    handleMagnetometer(e) {
        // Extract Compass Heading
        let compass = 0;

        // iOS
        if (e.webkitCompassHeading) {
            compass = e.webkitCompassHeading;
        }
        // Android / Standard
        else if (e.alpha !== null) {
            compass = 360 - e.alpha; // Alpha is counter-clockwise
        }

        this.magneticHeading = compass;

        // Initialize filteredHeading if first run
        if (this.filteredHeading === 0) {
            this.filteredHeading = this.magneticHeading;
        }
    }

    handleGyroscope(e) {
        if (!e.rotationRate) return;

        let rate = e.rotationRate.alpha; // Z-axis rotation (Yaw) in deg/s

        // Correction for device orientation (Portrait vs Landscape) could be added here
        // For now assuming Portrait

        // Android/iOS sign difference check?
        // Usually anti-clockwise is positive.
        // We want positive map rotation = Clockwise (Heading increases 0->360)?
        // Actually Heading increases Compass-wise (0=N, 90=E).
        // If I turn right, Heading increases.
        // Gyro alpha: turning right (Clockwise) is usually Negative on Z-axis right-hand rule?
        // Need to test. For now, assume +alpha adds to heading. If inverted, flip sign.
        // *Testing Note*: On many devices, alpha rate is negative when turning right.
        // So we might need: rate = -e.rotationRate.alpha;

        // Let's stick to simple addition first, visual test confirms.
        // Wait, standard web: rotationRate.alpha is Z axis.

        if (rate !== null) {
            this.gyroZ = rate;
        }
    }

    fusionLoop() {
        if (!this.isSensorRunning) return;
        requestAnimationFrame(() => this.fusionLoop());

        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000; // seconds
        this.lastTimestamp = now;

        if (dt > 1) return; // Skip large gaps

        // 1. Integrate Gyro
        // filtered = filtered + (gyro * dt)
        // Note: Sign might need flipping based on device. trying (-) as typical correction
        // If the map spins opposite, we flip this.
        let gyroStep = this.gyroZ * dt;

        // 2. Complementary Filter
        // New = Alpha * (Old + Gyro) + (1-Alpha) * Compass
        // We deal with 360 degree wrapping carefully

        let predicted = this.filteredHeading - gyroStep; // Try minus first (Device Left = +Alpha?)

        // Normalize predicted to 0-360
        if (predicted < 0) predicted += 360;
        if (predicted >= 360) predicted -= 360;

        let mag = this.magneticHeading;

        // Shortest path interpolation correction
        if (mag - predicted > 180) mag -= 360;
        if (mag - predicted < -180) mag += 360;

        this.filteredHeading = (this.alpha * predicted) + ((1 - this.alpha) * mag);

        // Normalize Result
        if (this.filteredHeading < 0) this.filteredHeading += 360;
        if (this.filteredHeading >= 360) this.filteredHeading -= 360;

        if (this.onHeadingUpdate) this.onHeadingUpdate(this.filteredHeading);
    }

    handleError(err) {
        console.warn("GPS Error:", err);

        // Fallback to IP Geolocation if GPS fails/denied
        if (!this.position) {
            console.log("Attempting IP Geolocation Fallback...");
            this.fetchIPLocation();
        }

        const msg = err.code === 1 // PERMISSION_DENIED
            ? 'GPS denegado. Usando IP...'
            : err.message;

        if (this.onError) this.onError(msg);
    }

    async fetchIPLocation() {
        console.log("Using Manual Dev Coordinates (User Provided)");

        // Manual Override for Desktop Testing
        this.position = {
            lat: 10.186183835674685,
            lng: -66.89599527275112,
            isApproximate: false,
            source: 'MANUAL'
        };

        if (this.onPositionUpdate) this.onPositionUpdate(this.position);
        this.permissionStatus = 'granted_manual';

        /* IP Geolocation Disabled in favor of precise manual coords
        try {
            const res = await fetch('https://ipapi.co/json/');
            // ...
        } catch (e) { ... }
        */
    }


    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
