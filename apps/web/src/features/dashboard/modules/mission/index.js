/**
 * Mission Module
 * Handles mission modal, start mission flow, and navigation buttons
 */

import { dbService } from '../../../../js/services/DatabaseService.js';

export function initMission() {
    const startBtn = document.getElementById('btn-start-mission');
    const mobileStartBtn = document.getElementById('mobile-btn-start-mission');
    const missionModal = document.getElementById('mission-modal');
    const closeMissionBtn = document.getElementById('btn-close-mission');
    const confirmMissionBtn = document.getElementById('btn-confirm-start-mission');

    // Function to handle opening the modal
    const openMissionModal = async () => {
        if (!missionModal) return;
        missionModal.style.display = 'flex';


        // Restore Saved Selections
        // AI Mode is implicitly 'local'
        const savedModelVersion = localStorage.getItem('kepler_ai_model_version') || 'auto';

        const modelVerSelect = document.getElementById('select-ai-model-version');

        if (modelVerSelect) modelVerSelect.value = savedModelVersion;


        const titleInput = document.getElementById('inp-dash-mission-title');
        const zoneInput = document.getElementById('inp-dash-mission-zone');
        const loadingBar = document.getElementById('mission-loading-bar');
        const loadingProgress = document.getElementById('mission-loading-progress');
        const loadingText = document.getElementById('mission-loading-text');
        const helper = document.getElementById('zone-description-helper');
        const confirmBtn = document.getElementById('btn-confirm-start-mission');

        // Show loading bar
        if (loadingBar) loadingBar.style.display = 'block';
        if (loadingProgress) loadingProgress.style.width = '10%';
        if (loadingText) loadingText.textContent = '⏳ Preparando misión...';

        // 1. Auto-generate mission name
        const now = new Date();
        const missionName = `MISION-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        if (titleInput) titleInput.value = missionName;

        // Logic pipeline
        const pipeline = async () => {
            try {
                // Check Secure Context for GPS
                if (!window.isSecureContext && window.location.hostname !== 'localhost') {
                    throw new Error('GPS requires HTTPS');
                }

                if (loadingProgress) loadingProgress.style.width = '30%';
                if (loadingText) loadingText.textContent = '📍 Detectando ubicación GPS...';

                // 2. Get GPS location (Increased Timeout: 15s for mobile compatibility)
                const pos = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('GPS timeout')), 15000);
                    if (!navigator.geolocation) return reject(new Error('No Geolocation support'));

                    navigator.geolocation.getCurrentPosition(
                        (p) => { clearTimeout(timeout); resolve(p); },
                        (e) => { clearTimeout(timeout); reject(e); },
                        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 } // Low accuracy for speed
                    );
                });

                const { latitude, longitude } = pos.coords;
                console.log(`[Mission] GPS: ${latitude}, ${longitude}`);

                if (loadingProgress) loadingProgress.style.width = '60%';
                if (loadingText) loadingText.textContent = '🤖 Generando descripción...';

                // 3. Call backend (Timeout: 8s)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                const response = await fetch('/api/missions/describe-zone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude, longitude }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const data = await response.json();

                if (data.success) {
                    if (zoneInput) zoneInput.value = data.location_name;
                    if (helper) {
                        helper.textContent = `📍 ${data.description}`;
                        helper.style.display = 'block';
                    }
                } else {
                    if (zoneInput) zoneInput.value = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
                }

            } catch (err) {
                console.warn('[Mission] Setup warning:', err.message);
                if (zoneInput && !zoneInput.value) zoneInput.value = 'Ubicación Desconocida (Manual)';

                if (helper) {
                    let msg = '⚠️ Misión manual activa.';
                    if (err.message.includes('GPS requires HTTPS')) msg = '⚠️ GPS requiere HTTPS. Usando modo manual.';
                    else if (err.message.includes('GPS timeout')) msg = '⚠️ GPS tardó demasiado. Usando modo manual.';
                    else if (err.message.includes('NetworkError')) msg = '⚠️ Sin conexión a servidor IA. Usando modo manual.';
                    else if (err.name === 'AbortError') msg = '⚠️ IA tardó demasiado. Usando modo manual.';

                    helper.textContent = msg;
                    helper.style.display = 'block';
                    helper.style.color = '#ffaa00';
                }
            } finally {
                // 4. ALWAYS Enable DESPEGAR button
                if (loadingProgress) loadingProgress.style.width = '100%';
                if (loadingText) loadingText.textContent = '✅ Listo para despegar';

                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.classList.add('ready');
                    confirmBtn.textContent = 'DESPEGAR 🚀';
                }

                setTimeout(() => {
                    if (loadingBar) loadingBar.style.display = 'none';
                }, 1000);
            }
        };

        // Run pipeline but don't block UI indefinitely
        pipeline();
    };

    // Attach listener to Desktop Button
    if (startBtn) {
        startBtn.addEventListener('click', openMissionModal);
    }

    // Attach listener to Mobile Button
    if (mobileStartBtn) {
        mobileStartBtn.addEventListener('click', openMissionModal);
    }


    // Close Modal
    if (closeMissionBtn) {
        closeMissionBtn.addEventListener('click', () => {
            missionModal.style.display = 'none';
        });
    }

    // Confirm Start
    if (confirmMissionBtn) {
        confirmMissionBtn.addEventListener('click', async () => {
            const titleInput = document.getElementById('inp-dash-mission-title');
            const zoneInput = document.getElementById('inp-dash-mission-zone');
            const modelVerSelect = document.getElementById('select-ai-model-version');
            const helper = document.getElementById('zone-description-helper');
            const terrenoSelect = document.getElementById('select-mission-terreno');
            const objetivoInput = document.getElementById('inp-mission-objetivo');
            const dificultadSelect = document.getElementById('select-mission-dificultad');
            const modelVersion = modelVerSelect?.value || 'auto';

            localStorage.setItem('kepler_ai_mode', 'local'); // Force Local
            localStorage.setItem('kepler_ai_model_version', modelVersion);
            console.log(`[Mission] Config: Mode=Local, Version=${modelVersion}`);

            const title = titleInput.value || "Misión Exploración";
            const zone = zoneInput.value || "Sector Desconocido";

            // Capture AI description (remove emoji prefix if present)
            let descripcionIA = null;
            if (helper && helper.textContent) {
                descripcionIA = helper.textContent.replace(/^📍\s*/, '').trim();
            }

            // Phase 1: Capture enrichment fields
            const missionOpts = {
                tipo_terreno: terrenoSelect?.value || null,
                objetivo: objetivoInput?.value?.trim() || null,
                dificultad: dificultadSelect?.value || null,
                coords_inicio: null
            };

            // Try to capture GPS coords for mission start point
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 60000, timeout: 3000 });
                });
                missionOpts.coords_inicio = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (e) { /* GPS optional here, already captured zone */ }

            try {
                confirmMissionBtn.textContent = 'Iniciando...';
                await dbService.startMission(title, zone, descripcionIA, missionOpts);
                window.history.pushState({}, '', '/ar');
                window.location.reload();
            } catch (e) {
                console.error("Error starting mission:", e);
                alert("Error al iniciar misión. Revisa consola.");
                confirmMissionBtn.textContent = 'DESPEGAR 🚀';
            }
        });
    }


    // Archives Button Logic
    const archivesBtn = document.getElementById('btn-archives');
    if (archivesBtn) {
        archivesBtn.addEventListener('click', () => {
            window.location.href = '/src/features/archives/archives.html';
        });
    }

    // Taxonomy Button Logic
    const taxonomiaBtn = document.getElementById('btn-taxonomia');
    if (taxonomiaBtn) {
        taxonomiaBtn.addEventListener('click', () => {
            window.location.href = '/taxonomia';
        });
    }

    return missionModal;
}
