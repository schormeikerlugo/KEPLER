/**
 * Dashboard Central Tactical Module
 * Handles Weather API and Radial Sonar initialization
 */

// Mock Weather Data Initialization
function initWeatherWidget() {
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const windEl = document.getElementById('weather-wind');
    const humEl = document.getElementById('weather-hum');
    const presEl = document.getElementById('weather-pres');

    if (!tempEl) return;

    // TODO: Replace with Real OpenWeatherMap API call when API Key is provided
    setTimeout(() => {
        tempEl.textContent = '+24°C';
        descEl.textContent = 'STABLE ATMOSPHERE';
        windEl.textContent = '12 km/h';
        humEl.textContent = '45%';
        presEl.textContent = '1012 hPa';

        // Add a subtle glow effect to show data is active
        tempEl.style.textShadow = '0 0 25px rgba(0, 255, 204, 0.8)';
        tempEl.style.color = '#00ffcc';
    }, 1500); // Simulate network load
}

// Sonar Blips Animation
function initRadialSonar() {
    const container = document.getElementById('sonar-blips-container');
    if (!container) return;

    // Create random pings every few seconds
    setInterval(() => {
        // Spawn 1 to 3 blips randomly
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) {
            setTimeout(() => createRadarPing(container), i * 800);
        }
    }, 4000);

    // Initial ping
    setTimeout(() => createRadarPing(container), 1000);
}

function createRadarPing(container) {
    const blip = document.createElement('div');
    blip.className = 'sonar-blip';

    // Random position within the radar circle (approx half the container width)
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 70 + 10; // Avoid dead center

    // Container is flexed, assuming ~200x200 for the grid size constraints
    const x = Math.cos(angle) * radius + 100; // 100 is roughly center
    const y = Math.sin(angle) * radius + 100;

    blip.style.left = `calc(50% + ${Math.cos(angle) * radius}px)`;
    blip.style.top = `calc(50% + ${Math.sin(angle) * radius}px)`;

    container.appendChild(blip);

    // Remove blip after animation finishes (4s)
    setTimeout(() => {
        if (blip.parentElement) {
            blip.remove();
        }
    }, 3900);
}

export function initTacticalGrid() {
    initWeatherWidget();
    initRadialSonar();
    console.log('[Tactical Grid] Weather & Sonar Initialized');
}
