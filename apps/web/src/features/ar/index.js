import { AREngine } from '../../js/engines/AREngine.js';
import { GPSEngine } from '../../js/engines/GPSEngine.js';
import { MarkerSystem } from '../../js/components/MarkerSystem.js';
import { AIEngine } from '../../js/engines/AIEngine_YOLO.js'; 
import { dbService } from '../../js/services/DatabaseService.js';
import { ARAnimations } from '../../js/utils/ar-animations.js'; 
import * as THREE from 'three';
import './ar.css';
import template from './ar.html?raw';

// Controllers
import { ARUIController } from './controllers/ARUIController.js';
import { ARDataController } from './controllers/ARDataController.js';
import { ARSettingsController } from './controllers/ARSettingsController.js';
import { ARMarkerController } from './controllers/ARMarkerController.js';
import { ARSentinelController } from './controllers/ARSentinelController.js';

export class ARController {
    constructor(container) {
        this.container = container; 
        
        // Engines
        this.arEngine = new AREngine(container);
        this.gpsEngine = new GPSEngine();
        this.markerSystem = new MarkerSystem();
        this.aiEngine = new AIEngine();
        
        // Shared State
        this.state = {
            missions: [],
            markers: [], 
            lastLocation: null,
            isLoading: false,
            searchRadius: 1000, 
            renderedMarkerIds: new Set(),
            isEnergySaving: false
        };

        // Sub-Controllers (Pass 'this' as context to share state and engines)
        this.ui = new ARUIController(container);
        this.dataController = new ARDataController(this); 
        this.settings = new ARSettingsController(this);
        this.markers = new ARMarkerController(this);
        this.sentinel = new ARSentinelController(this);
        
        this.isRunning = false;
        
        // Timers
        this.cleanupTimer = null;
    }

    async init() {
        // 1. Build UI
        this.container.innerHTML = template;
        this.ui.init(); 
        this.settings.init(); 
        
        // Restore Mission State
        try {
            const lastMission = await dbService.getCurrentMission();
            if (lastMission) {
                this.state.currentMissionId = lastMission.id;
                this.settings.updateMissionUI(true, lastMission.code || "");
                this.ui.showToast(`Misión Resumida: ${lastMission.code || 'Activa'}`, 3000);
            }
        } catch (e) {
            console.warn("Mission Restore Failed:", e);
            // Continue init despite error
        }

        // 2. Check Permissions
        const needsPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
        
        if (needsPermission) {
            this.ui.showPermissionButton(() => this.startSystem());
        } else {
            this.startSystem();
        }
    }

    async startSystem() {
        ARAnimations.initializeGSAP();
        
        this.aiEngine.onStatusUpdate = (msg) => {
             this.ui.showToast(msg, 3000);
        };

        try {
            await this.arEngine.init();
            this.gpsEngine.start();
            
            // Restore Calibration via Settings Controller
            this.settings.restoreCalibration();
            
            if (this.arEngine.video) {
                 this.aiEngine.init(this.arEngine.video);
            }
        } catch (e) {
            console.error("System Init Failed:", e);
            if (!e.message.includes("cámara")) {
                 this.ui.showToast("Error de Sistema: " + e.message, 3000);
            } else {
                 this.ui.showToast("Sin Cámara (Modo Espectador)", 3000);
            }
        }

        this.bindEvents();
        this.ui.animateHUDEntry();
        this.isRunning = true;
        this.loop();
    }
    
    bindEvents() {
        // GPS Updates
        this.gpsEngine.onPositionUpdate = (pos) => {
            this.ui.updateGPS(pos); 
            this.state.lastLocation = pos; 
        };

        this.gpsEngine.onHeadingUpdate = (heading) => {
            this.arEngine.setHeading(heading);
            this.ui.updateHeading(heading);
        };

        // UI Events via Controller
        const targetLock = document.getElementById('target-lock');
        const targetLabel = document.getElementById('target-label');
        
        this.aiEngine.onDetectionUpdate = ({ predictions, target }) => {
            // Full Render via UI Controller
            this.ui.renderDetectionBoxes(predictions, this.arEngine.video);

            // Sentinel Logic
            if(this.sentinel) {
                 this.sentinel.processPredictions(predictions);
            }

            // Sentinel Auto-Save (when enabled)
            if(target && this.dataController) {
                this.dataController.handleAutoSave(target);
            }

            // Target Lock Logic (Keep simple visual logic here for now)
            if(target && targetLock) {
                targetLock.style.display = 'block';
                targetLabel.innerHTML = `${target.class.toUpperCase()} ${(target.score*100).toFixed(0)}%`;
                
                const color = target.score > 0.7 ? '#3FA8FF' : 'orange';
                targetLock.style.borderColor = color;
                targetLock.style.boxShadow = `0 0 10px ${color}`;
                targetLabel.style.color = color;
            } else if (targetLock) {
                targetLock.style.display = 'none';
            }
        };

        // Action Buttons
        const btnScan = document.getElementById('btn-scan');
        if (btnScan) {
            btnScan.addEventListener('click', () => {
                 const reticle = document.getElementById('reticle'); 
                 if(reticle) ARAnimations.createHolographicScanEffect(reticle, { duration: 1.5 });
                 this.arEngine.triggerScan(); 

                 this.state.isEnergySaving = false;
                 this.state.renderedMarkerIds.clear(); 
                 
                 this.performIntelligentScan();
            });
        }
        
        // TEACH & TICK Modals (Could be moved to UI Controller? Keeping here for now as "Main Actions")
        this.bindModalEvents();
        
        // Ensure ALL Close Buttons work (Global Fallback)
        this.bindGlobalCloseEvents();
    }

    bindGlobalCloseEvents() {
        // 1. Description Modal Close
        const descClose = document.getElementById('btn-description-close');
        const descModal = document.getElementById('description-modal');
        if(descClose && descModal) {
            descClose.onclick = (e) => {
                e.stopPropagation();
                descModal.style.display = 'none';
            };
        }

        // 2. Mark Modal Close (Redundant safety)
        const markClose = document.getElementById('btn-mark-cancel');
        const markModal = document.getElementById('mark-modal');
        if(markClose && markModal) {
             markClose.onclick = (e) => {
                e.stopPropagation();
                markModal.style.display = 'none';
             };
        }

        // 3. Settings Close (Redundant safety)
        const setClose = document.getElementById('btn-close-settings');
        const setModal = document.getElementById('settings-panel');
        if(setClose && setModal) {
            setClose.onclick = (e) => {
                e.stopPropagation();
                setModal.style.display = 'none';
                document.querySelector('.ar-bottom-bar').style.display = 'flex';
            };
        }
        
        // 4. New modal close handlers (POI, Persona, Ruta)
        ['poi', 'persona', 'ruta'].forEach(type => {
            const closeBtn = document.getElementById(`btn-${type}-cancel`);
            const modal = document.getElementById(`${type}-modal`);
            if (closeBtn && modal) {
                closeBtn.onclick = (e) => { e.stopPropagation(); modal.style.display = 'none'; };
            }
        });
    }

    /**
     * Dynamically load POI categories into the select dropdown
     */
    async _loadPOICategoriesUI() {
        const select = document.getElementById('select-poi-categoria');
        if (!select) return;
        select.innerHTML = '<option value="">Cargando...</option>';
        const categories = await this.dataController.loadPOICategories();
        if (categories.length === 0) {
            select.innerHTML = '<option value="">Sin categorías</option>';
            return;
        }
        select.innerHTML = categories.map(c =>
            `<option value="${c.id}">${c.icono || '📍'} ${c.nombre}</option>`
        ).join('');
    }

    bindModalEvents() {
        // TEACH Logic
        const btnTeach = document.getElementById('btn-teach');
        const teachModal = document.getElementById('teach-modal');
        if(btnTeach) {
            btnTeach.addEventListener('click', () => {
                teachModal.style.display = 'flex';
                document.getElementById('inp-teach-label').value = '';
            });
            document.getElementById('btn-teach-cancel')?.addEventListener('click', () => teachModal.style.display = 'none');
            
            const confirmBtn = document.getElementById('btn-teach-confirm');
            confirmBtn.onclick = async () => {
                const label = document.getElementById('inp-teach-label').value;
                if(!label) return this.ui.showToast("Escribe un nombre");
                teachModal.style.display = 'none';
                
                const desc = await this.dataController.handleTeachObject(label);
                
                if(desc) {
                     const descModal = document.getElementById('description-modal');
                     document.getElementById('description-content').textContent = desc;
                     if(descModal) descModal.style.display = 'block';
                }
            };
        }

        // TICK → Quick Action Hub
        const btnTick = document.getElementById('btn-tick');
        const actionHub = document.getElementById('action-hub');
        const markModal = document.getElementById('mark-modal');
        const poiModal = document.getElementById('poi-modal');
        const personaModal = document.getElementById('persona-modal');
        const rutaModal = document.getElementById('ruta-modal');

        if (btnTick && actionHub) {
            // Toggle hub on TICK click
            btnTick.addEventListener('click', () => {
                const isOpen = actionHub.style.display === 'flex';
                actionHub.style.display = isOpen ? 'none' : 'flex';
            });

            // Close hub when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.action-hub-wrapper')) {
                    actionHub.style.display = 'none';
                }
            });

            // Hub option handlers
            actionHub.querySelectorAll('.hub-option').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    actionHub.style.display = 'none';
                    const action = btn.dataset.action;
                    if (action === 'marker') {
                        this.pendingSnapshot = this.arEngine.captureFrame();
                        markModal.style.display = 'flex';
                        document.getElementById('inp-mark-title').value = '';
                    } else if (action === 'poi') {
                        poiModal.style.display = 'flex';
                        this._loadPOICategoriesUI();
                    } else if (action === 'persona') {
                        personaModal.style.display = 'flex';
                    } else if (action === 'ruta') {
                        rutaModal.style.display = 'flex';
                    }
                });
            });
        }

        // Mark Modal confirm (existing logic)
        document.getElementById('btn-mark-cancel')?.addEventListener('click', () => markModal.style.display = 'none');
        document.getElementById('btn-mark-confirm')?.addEventListener('click', async () => {
            const title = document.getElementById('inp-mark-title').value || 'Marcador Manual';
            const desc = document.getElementById('inp-mark-desc').value;
            markModal.style.display = 'none';
            await this.dataController.createManualMarker(title, desc, this.pendingSnapshot);
            this.pendingSnapshot = null;
        });

        // POI Modal
        document.getElementById('btn-poi-cancel')?.addEventListener('click', () => poiModal.style.display = 'none');
        document.getElementById('btn-poi-confirm')?.addEventListener('click', async () => {
            const nombre = document.getElementById('inp-poi-nombre').value;
            if (!nombre) return this.ui.showToast("Escribe un nombre para el POI");
            poiModal.style.display = 'none';
            await this.dataController.createPOI({
                categoria_id: document.getElementById('select-poi-categoria').value || null,
                nombre,
                zona: document.getElementById('inp-poi-zona').value || null,
                nivel_riesgo: document.getElementById('select-poi-riesgo').value,
                estado: document.getElementById('select-poi-estado').value,
                descripcion: document.getElementById('inp-poi-descripcion').value || null
            });
        });

        // Persona Modal
        document.getElementById('btn-persona-cancel')?.addEventListener('click', () => personaModal.style.display = 'none');
        document.getElementById('btn-persona-confirm')?.addEventListener('click', async () => {
            const nombre = document.getElementById('inp-persona-nombre').value;
            if (!nombre) return this.ui.showToast("Escribe un nombre o identificador");
            personaModal.style.display = 'none';
            await this.dataController.createPersona({
                nombre,
                alias: document.getElementById('inp-persona-alias').value || null,
                contexto: document.getElementById('select-persona-contexto').value,
                notas: document.getElementById('inp-persona-notas').value || null
            });
        });

        // Ruta Modal
        document.getElementById('btn-ruta-cancel')?.addEventListener('click', () => rutaModal.style.display = 'none');
        document.getElementById('btn-ruta-confirm')?.addEventListener('click', async () => {
            const nombre = document.getElementById('inp-ruta-nombre').value;
            if (!nombre) return this.ui.showToast("Escribe un nombre para la ruta");
            rutaModal.style.display = 'none';
            await this.dataController.createRuta({
                nombre,
                dificultad: document.getElementById('select-ruta-dificultad').value,
                seguridad: document.getElementById('select-ruta-seguridad').value,
                notas: document.getElementById('inp-ruta-notas').value || null
            });
        });
    }

    async performIntelligentScan() {
        if(!this.state.lastLocation) return this.ui.showToast("Esperando GPS...");
        
        this.ui.showToast("Analizando terreno...", 0);
        // Parallel Logic
        await this.dataController.loadWorldData();
    }

    renderMarkers() {
        // Delegated
        this.markers.renderMarkers(this.state.missions);
    }
    
    // updateMarkerPositions no longer needed as method on 'this', loop calls controller directly

    loop() {
        if(!this.isRunning) return;
        requestAnimationFrame(() => this.loop());

        // Update Markers (Perspective checks)
        this.markers.updateMarkerPositions();
    }

    dispose() {
        this.isRunning = false;
        this.arEngine.dispose();
        this.gpsEngine.stop();
        this.aiEngine.stop();
        this.container.innerHTML = '';
        if(this.cleanupTimer) clearTimeout(this.cleanupTimer);
    }
}

// Entry Point for Router
export function render(container) {
    const controller = new ARController(container);
    controller.init();
    return controller;
}
