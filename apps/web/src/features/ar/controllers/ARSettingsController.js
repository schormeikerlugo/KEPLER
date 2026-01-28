import { api } from '../../../js/services/api.js';

export class ARSettingsController {
    constructor(context) {
        this.context = context; // Access to main ARController (arEngine, aiEngine, ui, state)
        this.dom = {};
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
    }

    cacheDOM() {
        this.dom = {
            btnSettings: document.getElementById('btn-settings'),
            btnCloseSettings: document.getElementById('btn-close-settings'),
            panelSettings: document.getElementById('settings-panel'),
            bottomBar: document.querySelector('.ar-bottom-bar'),
            
            // Mission
            btnStartMission: document.getElementById('btn-start-mission'),
            btnEndMission: document.getElementById('btn-end-mission'),
            inpMissionName: document.getElementById('inp-mission-name'),
            uiMissionStart: document.getElementById('mission-start-ui'),
            uiMissionActive: document.getElementById('mission-active-ui'),
            lblMissionStatus: document.getElementById('mission-status-badge'),

            // Calibration
            btnStartCal: document.getElementById('btn-start-calibration'),
            btnConfirmCal: document.getElementById('btn-confirm-calibration'),
            hudCalibration: document.getElementById('calibration-hud'),
            inpCalibration: document.getElementById('inp-calibration'),
            lblCalibration: document.getElementById('calibration-value'),
            
            // Radius
            inpRadius: document.getElementById('inp-radius'),
            lblRadius: document.getElementById('lbl-radius'),
            
            // Toggles
            btnGrid: document.getElementById('toggle-grid'),
            btnCam: document.getElementById('toggle-camera'),
            btnUI: document.getElementById('toggle-ui'),
            btnAI: document.getElementById('btn-ai-toggle'),
        };
    }

    bindEvents() {
        this.bindPanelEvents();
        this.bindMissionEvents();
        this.bindCalibrationEvents();
        this.bindRadiusEvents();
        this.bindToggleEvents();
    }

    bindMissionEvents() {
        // End Mission Only (Start is handled via Dashboard)
        this.dom.btnEndMission?.addEventListener('click', async () => {
             // ... logic remains same ...
             if(!confirm("¿Finalizar Misión actual?")) return;
            
             const mid = this.context.state.currentMissionId;
             if(mid) {
                 const res = await api.endMission(mid);
                 if (res.success) {
                     this.context.state.currentMissionId = null;
                     localStorage.removeItem('mars_current_mission_id');
                     localStorage.removeItem('mars_current_mission_code');
                     
                     this.context.ui.showToast("Misión Completada. Regresando...");
                     this.updateMissionUI(false);
                     setTimeout(() => window.location.href = '/', 1500);
                 } else {
                     this.context.ui.showToast("Error de conexión al finalizar.");
                 }
             } else {
                 this.context.ui.showToast("Error: No se detecta misión activa en memoria.");
                 if(confirm("Forzar salida (La misión seguirá activa en BD)?")) {
                      window.location.href = '/';
                 }
             }
        });
    }

    updateMissionUI(isActive, code="") {
        const startUI = document.getElementById('mission-start-ui'); 
        const activeUI = document.getElementById('mission-active-ui');
        // Re-fetch because cacheDOM might hold old nulls or we want fresh reference
        // Actually best to rely on cache if Elements exist, but startUI is removed from HTML now.
        
        if(isActive) {
            if(activeUI) activeUI.style.display = 'block';
            if(this.dom.lblMissionStatus) {
                this.dom.lblMissionStatus.textContent = "ACTIVA: " + code;
                this.dom.lblMissionStatus.style.background = "#00aaff";
            }
            this.context.sentinel.setEnabled(true);
        } else {
            if(activeUI) activeUI.style.display = 'none';
            if(this.dom.lblMissionStatus) {
                this.dom.lblMissionStatus.textContent = "INACTIVA";
                this.dom.lblMissionStatus.style.background = "#555";
            }
            this.context.sentinel.setEnabled(false);
        }
    }

    bindPanelEvents() {
        this.dom.btnSettings?.addEventListener('click', () => {
            if(this.dom.panelSettings) this.dom.panelSettings.style.display = 'flex';
            if(this.dom.bottomBar) this.dom.bottomBar.style.display = 'none';
        });

        this.dom.btnCloseSettings?.addEventListener('click', () => {
            if(this.dom.panelSettings) this.dom.panelSettings.style.display = 'none';
            if(this.dom.bottomBar) this.dom.bottomBar.style.display = 'flex';
        });

        // Abort Mission (In Settings)
        document.getElementById('btn-exit')?.addEventListener('click', () => {
            if(confirm('¿Abortar misión y volver al Dashboard?')) {
                window.location.href = '/dashboard/';
            }
        });
    }

    bindCalibrationEvents() {
        this.dom.btnStartCal?.addEventListener('click', () => {
            if(this.dom.panelSettings) this.dom.panelSettings.style.display = 'none';
            if(this.dom.hudCalibration) this.dom.hudCalibration.style.display = 'flex';
        });

        this.dom.btnConfirmCal?.addEventListener('click', () => {
            if(this.dom.hudCalibration) this.dom.hudCalibration.style.display = 'none';
            if(this.dom.bottomBar) this.dom.bottomBar.style.display = 'flex';
            
            const arEngine = this.context.arEngine;
            localStorage.setItem('mars_calibration_offset', arEngine.headingOffset);
            this.context.ui.showToast("Calibración Guardada");
        });

        this.dom.inpCalibration?.addEventListener('input', (e) => {
            const val = Number(e.target.value);
            this.context.arEngine.setHeadingOffset(val);
            if(this.dom.lblCalibration) this.dom.lblCalibration.textContent = `OFFSET: ${val > 0 ? '+' : ''}${val}°`;
        });
    }

    bindRadiusEvents() {
        if(this.dom.inpRadius) {
            this.dom.inpRadius.addEventListener('input', (e) => {
                const val = Number(e.target.value);
                this.context.state.searchRadius = val;
                if(this.dom.lblRadius) this.dom.lblRadius.textContent = `${val}m`;
            });
            
            this.dom.inpRadius.addEventListener('change', () => {
                this.context.performIntelligentScan();
            });
        }
    }

    bindToggleEvents() {
        // 1. Grid Toggle
        if(this.dom.btnGrid) {
            this.dom.btnGrid.addEventListener('click', () => {
                const isActive = this.dom.btnGrid.classList.contains('active');
                const overlays = document.querySelectorAll('.scanline-overlay, .scan-wave');
                
                if(isActive) {
                    this.dom.btnGrid.classList.remove('active');
                    this.dom.btnGrid.textContent = "OFF";
                    overlays.forEach(el => el.style.display = 'none');
                    this.context.arEngine.setGridVisible(false); // Hide 3D Grid
                } else {
                    this.dom.btnGrid.classList.add('active');
                    this.dom.btnGrid.textContent = "ON";
                    overlays.forEach(el => el.style.display = 'block');
                    this.context.arEngine.setGridVisible(true); // Show 3D Grid
                }
            });
        }

        // 2. Camera Toggle
        if(this.dom.btnCam) {
            this.dom.btnCam.addEventListener('click', () => {
                const isActive = this.dom.btnCam.classList.contains('active');
                if(isActive) {
                    this.dom.btnCam.classList.remove('active');
                    this.dom.btnCam.textContent = "OFF";
                    // Access video via engine
                    if(this.context.arEngine.video) this.context.arEngine.video.style.opacity = '0';
                } else {
                    this.dom.btnCam.classList.add('active');
                    this.dom.btnCam.textContent = "ON";
                    if(this.context.arEngine.video) this.context.arEngine.video.style.opacity = '1';
                }
            });
        }

        // 3. AI Scanner Toggle
        if(this.dom.btnAI) {
            this.dom.btnAI.addEventListener('click', () => {
                const isActive = this.dom.btnAI.classList.contains('active');
                
                if (isActive) {
                    // Turn OFF
                    this.dom.btnAI.classList.remove('active');
                    this.dom.btnAI.textContent = "OFF";
                    if(this.context.aiEngine.setPaused) this.context.aiEngine.setPaused(true);
                    
                    // CLEAR UI ARTIFACTS
                    const boxes = document.getElementById('detection-boxes-container');
                    if(boxes) {
                         const children = Array.from(boxes.children);
                         children.forEach(c => {
                             if(c.id !== 'target-lock') c.remove();
                         });
                         const targetLock = document.getElementById('target-lock');
                         if(targetLock) targetLock.style.display = 'none';
                    }
                    
                    this.context.ui.showToast("AI DESACTIVADO (Ahorro Energía)", 2000);
                } else {
                    // Turn ON
                    this.dom.btnAI.classList.add('active');
                    this.dom.btnAI.textContent = "ON";
                    if(this.context.aiEngine.setPaused) this.context.aiEngine.setPaused(false);
                    this.context.ui.showToast("AI ACTIVADO", 2000);
                }
            });
        }

        // 3.5 Sentinel Toggle
        this.dom.btnSentinel = document.getElementById('btn-sentinel-toggle');
        if(this.dom.btnSentinel) {
             this.dom.btnSentinel.addEventListener('click', () => {
                 const isActive = this.dom.btnSentinel.classList.contains('active');
                 
                 if(isActive) {
                     this.dom.btnSentinel.classList.remove('active');
                     this.dom.btnSentinel.textContent = "OFF";
                     this.context.sentinel.setEnabled(false);
                 } else {
                     this.dom.btnSentinel.classList.add('active');
                     this.dom.btnSentinel.textContent = "ACTIVADO";
                     this.context.sentinel.setEnabled(true);
                 }
             });
        }

        // 3.6 Auto-Save Toggle (NEW)
        this.dom.btnAutoSave = document.getElementById('btn-autosave-toggle');
        if(this.dom.btnAutoSave) {
            this.dom.btnAutoSave.addEventListener('click', () => {
                const isActive = this.dom.btnAutoSave.classList.contains('active');
                
                if(isActive) {
                    this.dom.btnAutoSave.classList.remove('active');
                    this.dom.btnAutoSave.textContent = "OFF";
                    if(this.context.dataController) {
                        this.context.dataController.setAutoSaveEnabled(false);
                    }
                    this.context.ui.showToast("Auto-Guardar DESACTIVADO", 2000);
                } else {
                    this.dom.btnAutoSave.classList.add('active');
                    this.dom.btnAutoSave.textContent = "ACTIVO";
                    if(this.context.dataController) {
                        this.context.dataController.setAutoSaveEnabled(true);
                    }
                    this.context.ui.showToast("Auto-Guardar ACTIVADO", 2000);
                }
            });
        }

        // 4. UI Toggle (Immersive Mode)
        if(this.dom.btnUI) {
            this.dom.btnUI.addEventListener('click', () => {
                const topBar = document.querySelector('.ar-top-bar');
                const telemetry = document.querySelector('.ar-telemetry-container');
                // Bottom bar is cached in this.dom.bottomBar
                
                const isActive = this.dom.btnUI.classList.contains('active');
                
                if(isActive) {
                    this.dom.btnUI.classList.remove('active');
                    this.dom.btnUI.textContent = "HIDDEN";
                    if(topBar) topBar.style.opacity = '0';
                    if(this.dom.bottomBar) this.dom.bottomBar.style.opacity = '0';
                    if(telemetry) telemetry.style.opacity = '0';
                    this.context.ui.showToast("UI Oculta - Abre Ajustes para restaurar");
                } else {
                    this.dom.btnUI.classList.add('active');
                    this.dom.btnUI.textContent = "ON";
                    if(topBar) topBar.style.opacity = '1';
                    if(this.dom.bottomBar) this.dom.bottomBar.style.opacity = '1';
                    if(telemetry) telemetry.style.opacity = '1';
                }
            });
        }
    }

    restoreCalibration() {
        const savedOffset = localStorage.getItem('mars_calibration_offset');
        if(savedOffset) {
             const offset = Number(savedOffset);
             this.context.arEngine.setHeadingOffset(offset);
             
             if(this.dom.inpCalibration) this.dom.inpCalibration.value = offset;
             if(this.dom.lblCalibration) this.dom.lblCalibration.textContent = `OFFSET: ${offset > 0 ? '+' : ''}${offset}°`;
        }
    }
}
