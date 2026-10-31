/**
 * Mission Module
 * Handles mission modal, start mission flow, and navigation buttons
 */

import { dbService } from '../../../../js/services/DatabaseService.js';
import { api } from '../../../../js/services/api.js';

// Cache for loaded routes
let cachedRoutes = [];

/**
 * Load planned routes into the route selector dropdown
 */
async function loadRoutesIntoSelector() {
    const routeSelect = document.getElementById('select-mission-route');
    if (!routeSelect) return;

    // Keep first option (sin ruta), remove rest
    while (routeSelect.options.length > 1) routeSelect.remove(1);

    try {
        const res = await api.getPlannedRoutes(50, 0);
        cachedRoutes = res.routes || [];

        for (const route of cachedRoutes) {
            const opt = document.createElement('option');
            opt.value = route.id;
            const dist = route.distancia_total ? `${(route.distancia_total / 1000).toFixed(1)}km` : '';
            const wps = route.waypoints?.length || 0;
            opt.textContent = `${route.nombre} — ${wps} waypoints${dist ? ` · ${dist}` : ''}`;
            routeSelect.appendChild(opt);
        }
    } catch (e) {
        console.warn('[Mission] Could not load routes:', e.message);
    }
}

/**
 * Handle route selection change — prefill mission fields from route data
 */
function setupRouteSelector() {
    const routeSelect = document.getElementById('select-mission-route');
    if (!routeSelect) return;

    routeSelect.addEventListener('change', () => {
        const routeId = routeSelect.value;
        const previewInfo = document.getElementById('route-preview-info');
        const hint = document.getElementById('route-selector-hint');

        if (!routeId) {
            if (previewInfo) previewInfo.style.display = 'none';
            if (hint) hint.textContent = 'Selecciona una ruta guardada para guiar tu misión con waypoints';
            return;
        }

        const route = cachedRoutes.find(r => r.id === routeId);
        if (!route) return;

        // Show route preview
        if (previewInfo) {
            previewInfo.style.display = 'flex';
            const distEl = document.getElementById('route-preview-distance');
            const wpsEl = document.getElementById('route-preview-waypoints');
            const terrEl = document.getElementById('route-preview-terrain');

            if (distEl) distEl.textContent = `📏 ${route.distancia_total ? (route.distancia_total / 1000).toFixed(1) + ' km' : 'N/A'}`;
            if (wpsEl) wpsEl.textContent = `📍 ${route.waypoints?.length || 0} waypoints`;
            if (terrEl) terrEl.textContent = `🏔️ ${route.tipo_terreno || 'No definido'}`;
        }
        if (hint) hint.textContent = '✅ Ruta seleccionada — los waypoints guiarán tu exploración';

        // Auto-fill terrain if route has it
        if (route.tipo_terreno) {
            const terrenoSelect = document.getElementById('select-mission-terreno');
            if (terrenoSelect) {
                const match = [...terrenoSelect.options].find(o => o.value === route.tipo_terreno);
                if (match) terrenoSelect.value = route.tipo_terreno;
            }
        }

        // Auto-fill zone from first waypoint name or coords
        if (route.waypoints?.length > 0) {
            const first = route.waypoints[0];
            const zoneInput = document.getElementById('inp-dash-mission-zone');
            if (zoneInput && !zoneInput.dataset.gpsSet) {
                zoneInput.value = route.nombre || `Lat: ${first.lat?.toFixed(4)}, Lng: ${first.lng?.toFixed(4)}`;
            }
        }

        // Auto-generate objective from route data
        const objetivoInput = document.getElementById('inp-mission-objetivo');
        if (objetivoInput && !objetivoInput.value) {
            const dist = route.distancia_total ? `${(route.distancia_total / 1000).toFixed(1)} km` : '';
            const terrain = route.tipo_terreno || '';
            objetivoInput.value = `Exploración de "${route.nombre}"${terrain ? ` — ${terrain}` : ''}${dist ? ` · ${dist}` : ''}`;
        }
    });
}

export function initMission() {
    const startBtn = document.getElementById('btn-start-mission');
    const mobileStartBtn = document.getElementById('mobile-btn-start-mission');
    const missionModal = document.getElementById('mission-modal');
    const closeMissionBtn = document.getElementById('btn-close-mission');
    const confirmMissionBtn = document.getElementById('btn-confirm-start-mission');

    // Setup route selector change handler once
    setupRouteSelector();

    // Function to handle opening the modal
    const openMissionModal = async () => {
        if (!missionModal) return;
        missionModal.style.display = 'flex';

        // Load routes into selector (parallel, non-blocking)
        loadRoutesIntoSelector();

        const titleInput = document.getElementById('inp-dash-mission-title');
        const zoneInput = document.getElementById('inp-dash-mission-zone');
        const loadingBar = document.getElementById('mission-loading-bar');
        const loadingProgress = document.getElementById('mission-loading-progress');
        const loadingText = document.getElementById('mission-loading-text');
        const helper = document.getElementById('zone-description-helper');
        const confirmBtn = document.getElementById('btn-confirm-start-mission');
        const terrenoSelect = document.getElementById('select-mission-terreno');
        const dificultadSelect = document.getElementById('select-mission-dificultad');
        const objetivoInput = document.getElementById('inp-mission-objetivo');

        // 1. Auto-generate mission name
        const now = new Date();
        const missionName = `MISION-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        if (titleInput) titleInput.value = missionName;

        // Show loading bar
        if (loadingBar) loadingBar.style.display = 'block';
        if (loadingProgress) loadingProgress.style.width = '10%';
        if (loadingText) loadingText.textContent = '⏳ Preparando misión...';

        // ═══ QUICK LAUNCH PIPELINE ═══
        // Strategy: use cached coords immediately, GPS refines in background, enable button ASAP

        const pipeline = async () => {
            let latitude = null, longitude = null;

            // Phase 1: Get coords (cached → instant, GPS → background)
            const cachedLat = sessionStorage.getItem('kepler_lat');
            const cachedLng = sessionStorage.getItem('kepler_lng');

            if (cachedLat && cachedLng) {
                latitude = parseFloat(cachedLat);
                longitude = parseFloat(cachedLng);
                console.log(`[Mission] Using cached coords: ${latitude}, ${longitude}`);
                if (loadingProgress) loadingProgress.style.width = '40%';
                if (loadingText) loadingText.textContent = '🤖 Analizando zona...';
            }

            // Start GPS in background (updates coords if available, doesn't block)
            const gpsPromise = new Promise((resolve) => {
                if (!navigator.geolocation || (!window.isSecureContext && window.location.hostname !== 'localhost')) {
                    resolve(null);
                    return;
                }
                const timeout = setTimeout(() => resolve(null), 10000);
                navigator.geolocation.getCurrentPosition(
                    (p) => { clearTimeout(timeout); resolve(p.coords); },
                    () => { clearTimeout(timeout); resolve(null); },
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                );
            });

            // If no cached coords, wait for GPS
            if (!latitude || !longitude) {
                if (loadingProgress) loadingProgress.style.width = '20%';
                if (loadingText) loadingText.textContent = '📍 Detectando ubicación GPS...';

                const gpsCoords = await gpsPromise;
                if (gpsCoords) {
                    latitude = gpsCoords.latitude;
                    longitude = gpsCoords.longitude;
                    sessionStorage.setItem('kepler_lat', latitude);
                    sessionStorage.setItem('kepler_lng', longitude);
                }
            }

            // Phase 2: Enable DESPEGAR immediately if we have coords
            if (latitude && longitude) {
                // Enable button early — user can launch while IA works in background
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.classList.add('ready');
                    confirmBtn.textContent = 'DESPEGAR 🚀';
                }
                if (zoneInput && !zoneInput.value) {
                    zoneInput.value = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
                }
            }

            // Phase 3: Call describe-zone for auto-fill (non-blocking)
            if (latitude && longitude) {
                if (loadingProgress) loadingProgress.style.width = '60%';
                if (loadingText) loadingText.textContent = '🤖 Analizando zona...';

                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 12000);

                    const response = await fetch('/api/missions/describe-zone', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude, longitude }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    const data = await response.json();

                    if (data.success) {
                        // Auto-fill zona
                        if (zoneInput) zoneInput.value = data.location_name;
                        zoneInput.dataset.gpsSet = 'true';

                        // Auto-fill description
                        if (helper) {
                            helper.textContent = `📍 ${data.description}`;
                            helper.style.display = 'block';
                            helper.style.color = '';
                        }

                        // Auto-fill terreno (if user hasn't changed it and no route selected)
                        const routeSelect = document.getElementById('select-mission-route');
                        if (data.terrain_type && terrenoSelect && !routeSelect?.value) {
                            const match = [...terrenoSelect.options].find(o => o.value === data.terrain_type);
                            if (match) terrenoSelect.value = data.terrain_type;
                        }

                        // Auto-fill dificultad
                        if (data.difficulty && dificultadSelect) {
                            const match = [...dificultadSelect.options].find(o => o.value === data.difficulty);
                            if (match) dificultadSelect.value = data.difficulty;
                        }
                    }
                } catch (err) {
                    console.warn('[Mission] describe-zone failed:', err.message);
                    if (helper) {
                        helper.textContent = '⚠️ IA no disponible. Campos editables manualmente.';
                        helper.style.display = 'block';
                        helper.style.color = '#ffaa00';
                    }
                }
            } else {
                // No coords at all — manual mode
                if (zoneInput && !zoneInput.value) zoneInput.value = 'Ubicación Desconocida (Manual)';
                if (helper) {
                    helper.textContent = '⚠️ GPS no disponible. Misión en modo manual.';
                    helper.style.display = 'block';
                    helper.style.color = '#ffaa00';
                }
            }

            // Phase 4: Update GPS coords in background if fresh ones arrived
            if (!cachedLat) {
                // We already waited for GPS above
            } else {
                // We used cache — check if GPS gives fresher coords
                gpsPromise.then(gpsCoords => {
                    if (gpsCoords) {
                        sessionStorage.setItem('kepler_lat', gpsCoords.latitude);
                        sessionStorage.setItem('kepler_lng', gpsCoords.longitude);
                    }
                });
            }

            // Phase 5: Finalize UI
            if (loadingProgress) loadingProgress.style.width = '100%';
            if (loadingText) loadingText.textContent = '✅ Listo para despegar';

            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.classList.add('ready');
                confirmBtn.textContent = 'DESPEGAR 🚀';
            }

            setTimeout(() => {
                if (loadingBar) loadingBar.style.display = 'none';
            }, 800);
        };

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


    // Close Modal with animation
    const closeMissionModal = () => {
        if (!missionModal) return;
        missionModal.classList.add('closing');
        setTimeout(() => {
            missionModal.style.display = 'none';
            missionModal.classList.remove('closing');
        }, 250);
    };

    if (closeMissionBtn) {
        closeMissionBtn.addEventListener('click', closeMissionModal);
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

            // Phase 2: Get selected route
            const routeSelect = document.getElementById('select-mission-route');
            const selectedRouteId = routeSelect?.value || null;
            const selectedRoute = selectedRouteId ? cachedRoutes.find(r => r.id === selectedRouteId) : null;

            // Phase 1: Capture enrichment fields
            const missionOpts = {
                tipo_terreno: terrenoSelect?.value || null,
                objetivo: objetivoInput?.value?.trim() || null,
                dificultad: dificultadSelect?.value || null,
                coords_inicio: null,
                ruta_planificada_id: selectedRouteId
            };

            // Use route's first waypoint as coords_inicio if available
            if (selectedRoute?.waypoints?.length > 0) {
                const first = selectedRoute.waypoints[0];
                missionOpts.coords_inicio = { lat: first.lat, lng: first.lng };
            }

            // Fallback: try GPS coords for mission start point
            if (!missionOpts.coords_inicio) {
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 60000, timeout: 3000 });
                    });
                    missionOpts.coords_inicio = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                } catch (e) { /* GPS optional here, already captured zone */ }
            }

            try {
                confirmMissionBtn.textContent = 'Iniciando...';

                // Store route waypoints for AR Explorer to consume
                if (selectedRoute?.waypoints?.length) {
                    localStorage.setItem('kepler_mission_waypoints', JSON.stringify(selectedRoute.waypoints));
                    localStorage.setItem('kepler_mission_route_name', selectedRoute.nombre || '');
                } else {
                    localStorage.removeItem('kepler_mission_waypoints');
                    localStorage.removeItem('kepler_mission_route_name');
                }

                await dbService.startMission(title, zone, descripcionIA, missionOpts);
                window.kepler.navigate('/ar');
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
            window.kepler.navigate('/archives');
        });
    }

    // Taxonomy Button Logic
    const taxonomiaBtn = document.getElementById('btn-taxonomia');
    if (taxonomiaBtn) {
        taxonomiaBtn.addEventListener('click', () => {
            window.kepler.navigate('/taxonomia');
        });
    }

    return missionModal;
}
