import { dbService } from '../../../js/services/DatabaseService.js';
import { supabase } from '../../../js/auth.js';
import { api } from '../../../js/services/api.js';

export class ARDataController {
    constructor(context) {
        this.ctx = context; // Reference to Main Layout (access to engines, state, ui)
        
        // Sentinel Auto-Save Configuration
        this.enableSentinelAutoSave = false;
        this.sentinelCooldowns = new Map(); // Track saved objects to prevent duplicates
        this.autoSaveCooldownMs = 10000; // 10 seconds between same-class saves
        this.autoSaveMinConfidence = 0.65; // Min confidence to auto-save
    }

    /**
     * Enable/Disable Sentinel Auto-Save Mode
     */
    setAutoSaveEnabled(enabled) {
        this.enableSentinelAutoSave = enabled;
        console.log(`Sentinel Auto-Save: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Handle auto-save for detected objects (called from detection callback)
     */
    async handleAutoSave(prediction) {
        if (!this.enableSentinelAutoSave) return;
        if (!prediction || !prediction.class) return;
        if (prediction.score < this.autoSaveMinConfidence) return;
        if (!this.ctx.state.lastLocation) return;

        const objClass = prediction.class;
        const now = Date.now();

        // Check cooldown to prevent saving same object multiple times
        const lastSaveTime = this.sentinelCooldowns.get(objClass) || 0;
        if (now - lastSaveTime < this.autoSaveCooldownMs) {
            return; // Still in cooldown
        }

        // Mark as processing
        this.sentinelCooldowns.set(objClass, now);
        
        try {
            this.ctx.ui.showToast(`Guardando ${objClass}...`, 0);

            // 1. Capture full frame (cropDetection fails on mobile, use captureFrame instead)
            let capturedImage = '';
            try {
                capturedImage = this.ctx.arEngine.captureFrame() || '';
            } catch(e) {
                console.warn("Frame capture failed:", e);
            }
            
            // 2. Get AI description (best effort, non-blocking)
            let description = `${objClass} detectado automáticamente.`;
            let category = this.mapClassToCategory(objClass);
            
            try {
                const docRes = await fetch('/api/enrich-data', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ label: objClass })
                }).then(r => r.json());
                
                if (docRes && docRes.description) {
                    description = docRes.description;
                }
                if (docRes && docRes.category) {
                    category = docRes.category;
                }
            } catch(e) { 
                console.warn("Enrichment failed, using default description"); 
            }

            // 3. Calculate GPS position
            const distance = prediction.distance || 3; // meters
            const R = 6378137;
            
            // Safe heading extraction with fallback
            let heading = 0;
            try {
                heading = (this.ctx.gpsEngine?.filteredHeading || this.ctx.gpsEngine?.heading || 0) + (this.ctx.arEngine?.headingOffset || 0);
            } catch(e) {
                console.warn("Heading extraction failed, using 0");
            }
            const bearingRad = (heading * Math.PI) / 180;
            
            const { lat, lng } = this.ctx.state.lastLocation;
            const newLat = lat + (distance / R) * (180 / Math.PI) * Math.cos(bearingRad);
            const newLng = lng + (distance / R) * (180 / Math.PI) * Math.sin(bearingRad) / Math.cos(lat * Math.PI / 180);

            // 4. Save to database (with bbox for server-side cropping)
            const res = await api.createObject({
                source: 'sentinel',
                object_class: category,
                name: objClass.toUpperCase(),
                confidence: prediction.score,
                timestamp: new Date().toISOString(),
                location: { lat: newLat, lng: newLng },
                heading: heading,
                image_base64: capturedImage || '',
                bbox: prediction.bbox || null,  // Send bbox for server-side crop
                metadata: {
                    description: description,
                    created_by: 'SENTINEL_AUTO',
                    ai_class: objClass,
                    ai_confidence: prediction.score.toFixed(2)
                },
                mission_id: this.ctx.state.currentMissionId || null
            });

            console.log("Auto-save API response:", res); // DEBUG

            if (res.success) {
                this.ctx.ui.showToast(`✓ ${objClass} guardado`, 2000);
                
                // Add to local state for immediate display
                this.ctx.state.missions.push({
                    id: res.data?.id || `auto-${Date.now()}`,
                    title: objClass.toUpperCase(),
                    type: category,
                    lat: newLat,
                    lng: newLng,
                    altitude: 0,
                    metadata: { description }
                });
                this.ctx.renderMarkers();
            } else {
                console.error("Auto-save failed:", res.error);
                this.sentinelCooldowns.delete(objClass); // Allow retry
                // Show error code for mobile debugging
                this.ctx.ui.showToast(`ERR-API: ${res.error || 'Unknown'}`, 4000);
            }

        } catch (e) {
            console.error("handleAutoSave error:", e);
            this.sentinelCooldowns.delete(objClass); // Allow retry
            
            // Determine error code based on error type
            let errorCode = 'ERR-UNK';
            if (e.message?.includes('fetch')) errorCode = 'ERR-NET';
            else if (e.message?.includes('GPS') || e.message?.includes('location')) errorCode = 'ERR-GPS';
            else if (e.message?.includes('heading')) errorCode = 'ERR-HEAD';
            else if (e.message?.includes('crop')) errorCode = 'ERR-CROP';
            else errorCode = `ERR-JS: ${e.message?.substring(0, 30) || 'Unknown'}`;
            
            this.ctx.ui.showToast(errorCode, 4000);
        }
    }

    mapClassToCategory(className) {
        const categories = {
            person: 'person',
            dog: 'animal', cat: 'animal', bird: 'animal', horse: 'animal', sheep: 'animal', cow: 'animal', elephant: 'animal', bear: 'animal', zebra: 'animal', giraffe: 'animal',
            car: 'vehicle', motorcycle: 'vehicle', airplane: 'vehicle', bus: 'vehicle', train: 'vehicle', truck: 'vehicle', boat: 'vehicle', bicycle: 'vehicle',
            chair: 'furniture', couch: 'furniture', bed: 'furniture', 'dining table': 'furniture',
            bottle: 'object', cup: 'object', bowl: 'object', laptop: 'tech', cell_phone: 'tech', tv: 'tech', keyboard: 'tech', mouse: 'tech',
            'potted plant': 'plant'
        };
        return categories[className.toLowerCase()] || 'object';
    }

    async loadWorldData() {
        if(!this.ctx.state.lastLocation) return;
        this.ctx.state.isLoading = true;
        this.ctx.ui.showToast("Escaneando red quiral...", 0); 

        try {
            // Use Backend API (New Tables)
            const objects = await api.getNearbyObjects(
                this.ctx.state.lastLocation.lat, 
                this.ctx.state.lastLocation.lng, 
                this.ctx.state.searchRadius || 1000
            );
            console.log("AR SCAN RESULTS:", objects); // DEBUG
            
            if(!objects || objects.length === 0) {
                 this.ctx.ui.showToast("No se encontraron rastros", 2000);
            }
            
            this.ctx.state.missions = objects.map(obj => {
                let lat = 0, lng = 0;
                
                // Parse coordinates - Priority order:
                // 1. Direct lat/lng from new SQL function
                if(obj.lat && obj.lng) {
                    lat = obj.lat; 
                    lng = obj.lng;
                }
                // 2. GeoJSON format
                else if(obj.posicion && obj.posicion.coordinates) {
                   [lng, lat] = obj.posicion.coordinates;
                } 
                // 3. WKT format POINT(lng lat)
                else if(typeof obj.posicion === 'string' && obj.posicion.startsWith('POINT')) {
                    const match = obj.posicion.match(/POINT\(([-\d\.]+) ([-\d\.]+)\)/);
                    if(match) {
                        lng = parseFloat(match[1]);
                        lat = parseFloat(match[2]);
                    }
                } 

                const parsed = {
                    id: obj.id,
                    title: obj.title || obj.name || obj.nombre || 'Desconocido',
                    type: obj.type || obj.tipo || 'unknown',
                    lat: lat,
                    lng: lng,
                    altitude: obj.metadata?.altitude || 0,
                    metadata: obj.metadata || {}
                };
                return parsed;
            });
            
            this.ctx.renderMarkers();
            this.ctx.ui.showToast("Entorno Sincronizado", 2000);
            
            // Auto-Hide Timer
            if (this.ctx.cleanupTimer) clearTimeout(this.ctx.cleanupTimer);
            this.ctx.cleanupTimer = setTimeout(() => {
                if(this.ctx.state.markers.length > 0) {
                    this.ctx.state.isEnergySaving = true; // LOCK RENDER
                    this.ctx.arEngine.clearMarkers();
                    
                    const labelsContainer = document.getElementById('labels-container');
                    if(labelsContainer) labelsContainer.innerHTML = '';
                    
                    this.ctx.state.markers = []; // Clear current tracking
                    this.ctx.state.renderedMarkerIds.clear(); // Clear history to allow re-render
                    
                    this.ctx.ui.showToast("Vista Limpiada (Ahorro de Energía)", 3000);
                }
            }, 60000); // 1 Minute

        } catch(e) {
            console.error("LoadWorldData Error:", e);
            this.ctx.ui.showToast(`Error DB: ${e.message || e.code || 'Desconocido'}`, 4000);
        } finally {
            this.ctx.state.isLoading = false;
        }
    }

    // Helper for Manual Mark
    async createManualMarker(title, desc, snapshot) {
        if(!this.ctx.state.lastLocation) return this.ctx.ui.showToast("Esperando GPS...", 2000);
        
        this.ctx.ui.showToast("Guardando con Foto...", 0);
        this.ctx.state.isEnergySaving = false; 

        const d = 5; 
        const R = 6378137;
        const heading = (this.ctx.gpsEngine.filteredHeading || this.ctx.gpsEngine.heading) + this.ctx.arEngine.headingOffset;
        const bearingRad = (heading * Math.PI) / 180;

        const { lat, lng } = this.ctx.state.lastLocation;
        const newLat = lat + (d / R) * (180 / Math.PI) * Math.cos(bearingRad);
        const newLng = lng + (d / R) * (180 / Math.PI) * Math.sin(bearingRad) / Math.cos(lat * Math.PI / 180);

        try {
            // Use Unified API
            const res = await api.createObject({
                source: 'manual',
                object_class: 'marker',
                name: title,
                confidence: 1.0, 
                timestamp: new Date().toISOString(),
                location: { lat: newLat, lng: newLng },
                heading: heading,
                image_base64: snapshot || '', 
                metadata: { 
                    description: desc,
                    altitude: 0, 
                    created_by: 'AR_USER_MANUAL' 
                },
                mission_id: this.ctx.state.currentMissionId || null
            });

            if(!res.success) throw new Error(res.error || "Error de API");

            const newObj = res.data;

            this.ctx.state.missions.push({
                id: newObj ? newObj.id : 'temp-'+Date.now(),
                title: title,
                type: 'marker',
                lat: newLat,
                lng: newLng,
                description: desc, 
                altitude: 0
            });
            
            this.ctx.renderMarkers();
            this.ctx.ui.showToast("Marcador Guardado OK", 3000);
            
        } catch(e) {
            console.error(e);
            this.ctx.ui.showToast("Error al guardar: " + e.message, 3000);
        }
    }

    async handleTeachObject(label) {
        if(!this.ctx.state.lastLocation) {
            this.ctx.ui.showToast("Sin señal GPS (Necesaria para guardar)");
            return;
        }

        // Auto-start mission if none? Or just warn?
        // User asked for "linked to mission". If no mission is active, 'mission_id' will send null (generic log).
        // Optionally auto-start "Training Mission" but that might clutter.
        // I will just use the current mission ID (or null).

        const loading = document.getElementById('ai-loading'); 
        this.ctx.ui.showToast("Analizando con IA...", 0);

        try {
            // 1. Capture Image
            const capturedImage = this.ctx.arEngine.captureFrame(); 
            
            // 2. Get AI Description (Enrichment Only)
            // We skip generate-embedding here because createObject does it on backend now.
            let description = "Identificado manualmente.";
            let category = 'object';
            
            try {
                const docRes = await fetch('/api/enrich-data', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ label: label })
                }).then(r => r.json());
                
                if(docRes) {
                    description = docRes.description || description;
                    category = docRes.category || category;
                }
            } catch(e) { console.warn("Enrichment failed, continuing..."); }

            // 3. Calculate Position
             const d = 5; 
             const R = 6378137;
             const heading = (this.ctx.gpsEngine.filteredHeading || this.ctx.gpsEngine.heading) + this.ctx.arEngine.headingOffset;
             const bearingRad = (heading * Math.PI) / 180;
     
             const { lat, lng } = this.ctx.state.lastLocation;
             const newLat = lat + (d / R) * (180 / Math.PI) * Math.cos(bearingRad);
             const newLng = lng + (d / R) * (180 / Math.PI) * Math.sin(bearingRad) / Math.cos(lat * Math.PI / 180);

             // 4. Save using Unified API
             const res = await api.createObject({
                source: 'teach', // 'teach' mode
                object_class: category,
                name: label.toUpperCase(),
                confidence: 1.0, 
                timestamp: new Date().toISOString(),
                location: { lat: newLat, lng: newLng },
                heading: heading,
                image_base64: capturedImage || '', 
                metadata: { 
                    description: description,
                    created_by: 'TEACH_MODE',
                    mode: 'interactive'
                },
                mission_id: this.ctx.state.currentMissionId || null
            });

            if(!res.success) throw new Error(res.error || "API Error");
            const newObj = res.data;
            
            // 5. Update UI
            if(newObj) {
                this.ctx.state.missions.push({
                    id: newObj.id,
                    title: newObj.nombre || label,
                    type: newObj.tipo || category,
                    lat: newLat,
                    lng: newLng,
                    altitude: 0,
                    metadata: newObj.metadata
                });
                this.ctx.renderMarkers();
                
                // Show Description Modal
                const descModal = document.getElementById('description-modal');
                if(document.getElementById('description-content')) {
                     document.getElementById('description-content').textContent = description;
                }
                if(descModal) descModal.style.display = 'block';
                
                this.ctx.ui.showToast(`¡Aprendido! ${label}`, 3000);
            }

            return description;

        } catch (e) {
            console.error('handleTeachObject error:', e);
            this.ctx.ui.showToast("Error al aprender: " + e.message, 3000);
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    async searchVisualDatabase(imageBase64) {
         if (!imageBase64) return [];
         
         const response = await fetch('/api/search-similar', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ image_base64: imageBase64 })
         });
         
         const data = await response.json();
         return data.matches || [];
    }
}
