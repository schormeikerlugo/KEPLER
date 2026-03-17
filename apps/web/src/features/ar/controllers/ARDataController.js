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
            // Capture frame
            let snapshot = '';
            try { snapshot = this.ctx.arEngine.captureFrame() || ''; } catch (e) { }

            // Delegate to Smart Entity Router
            const result = await this.autoRouteDetection(prediction, snapshot);
            if (result) {
                this.ctx.ui.showToast(`✓ ${result.type}: ${result.name}`, 2000);
            } else {
                this.sentinelCooldowns.delete(objClass);
            }
        } catch (e) {
            console.error("handleAutoSave error:", e);
            this.sentinelCooldowns.delete(objClass);
            this.ctx.ui.showToast(`ERR: ${e.message?.substring(0, 30) || 'Unknown'}`, 4000);
        }
    }

    /**
     * Enhanced category mapping with route targets
     * Returns { category, routeTarget } where routeTarget is 'persona' | 'poi' | 'generic'
     */
    classifyDetection(className) {
        const lc = className.toLowerCase();

        // Person → Personas table
        if (lc === 'person') {
            return { category: 'person', routeTarget: 'persona' };
        }

        // Settlement/Infrastructure → POI table
        const poiClasses = new Set([
            'bench', 'fire_hydrant', 'stop_sign', 'traffic_light', 'parking_meter',
            'building', 'house', 'bridge', 'tent', 'fountain'
        ]);
        if (poiClasses.has(lc)) {
            return { category: lc, routeTarget: 'poi' };
        }

        // Everything else → Generic objects table
        const categories = {
            dog: 'animal', cat: 'animal', bird: 'animal', horse: 'animal', sheep: 'animal',
            cow: 'animal', elephant: 'animal', bear: 'animal', zebra: 'animal', giraffe: 'animal',
            car: 'vehicle', motorcycle: 'vehicle', airplane: 'vehicle', bus: 'vehicle',
            train: 'vehicle', truck: 'vehicle', boat: 'vehicle', bicycle: 'vehicle',
            chair: 'furniture', couch: 'furniture', bed: 'furniture', 'dining table': 'furniture',
            bottle: 'object', cup: 'object', bowl: 'object',
            laptop: 'tech', cell_phone: 'tech', tv: 'tech', keyboard: 'tech', mouse: 'tech',
            'potted plant': 'plant'
        };
        return { category: categories[lc] || 'object', routeTarget: 'generic' };
    }

    // Legacy alias for backward compat
    mapClassToCategory(className) {
        return this.classifyDetection(className).category;
    }

    /**
     * Smart Entity Router — Auto-routes detected objects to correct table
     * Includes AI Re-Identification: checks for existing matches before creating duplicates
     * Called by Sentinel and Auto-Save
     */
    async autoRouteDetection(prediction, snapshot) {
        const { category, routeTarget } = this.classifyDetection(prediction.class);
        const coords = await this._getGPSCoords();
        const timestamp = new Date().toISOString();

        // Get AI description (best effort)
        let description = `${prediction.class} detectado automáticamente.`;
        try {
            const docRes = await fetch('/api/enrich-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: prediction.class })
            }).then(r => r.json());
            if (docRes?.description) description = docRes.description;
        } catch (e) { /* enrichment failed, use default */ }

        // ── AI Re-Identification Pre-Check ──
        // For persona/poi, try to match against existing entities before creating duplicates
        if (snapshot && (routeTarget === 'persona' || routeTarget === 'poi')) {
            try {
                const matchRes = await api.matchVisual(snapshot, routeTarget === 'persona' ? 'persona' : 'poi');
                if (matchRes.matched && matchRes.entity) {
                    const sim = (matchRes.entity.similarity * 100).toFixed(0);
                    return {
                        type: routeTarget === 'persona' ? '👁️ RE-ID PERSONA' : '👁️ RE-ID POI',
                        name: `${matchRes.entity.nombre} (${sim}% match)`
                    };
                }
            } catch (e) {
                console.warn('[autoRoute] matchVisual failed, proceeding to create:', e.message);
            }
        }

        // ── Route to correct table (no match found) ──
        if (routeTarget === 'persona') {
            const data = await this.createPersona({
                nombre: `Persona ${timestamp.slice(11, 19)}`,
                alias: null,
                contexto: 'desconocido',
                notas: `Auto-captura Sentinel. Confianza: ${(prediction.score * 100).toFixed(0)}%. ${description}`
            });
            return data ? { type: '👤 PERSONA', name: data.nombre } : null;

        } else if (routeTarget === 'poi') {
            const poiCategoryMap = {
                bench: 'Mobiliario Urbano', fire_hydrant: 'Infraestructura',
                stop_sign: 'Señalización', traffic_light: 'Señalización',
                parking_meter: 'Infraestructura', building: 'Edificación',
                house: 'Edificación', bridge: 'Infraestructura',
                tent: 'Campamento', fountain: 'Recurso Hídrico'
            };
            const data = await this.createPOI({
                categoria_id: null,
                nombre: `${poiCategoryMap[prediction.class.toLowerCase()] || prediction.class} — ${timestamp.slice(11, 19)}`,
                zona: null,
                nivel_riesgo: 'bajo',
                estado: 'activo',
                descripcion: `Auto-captura Sentinel. ${description}`
            });
            return data ? { type: '🏔️ POI', name: data.nombre } : null;

        } else {
            // Generic object → objetos_exploracion (existing flow)
            const heading = this._getHeading();
            const location = coords || { lat: 0, lng: 0 };

            const res = await api.createObject({
                source: 'sentinel',
                object_class: category,
                name: prediction.class.toUpperCase(),
                confidence: prediction.score,
                timestamp,
                location,
                heading,
                image_base64: snapshot || '',
                bbox: prediction.bbox || null,
                metadata: {
                    description,
                    created_by: 'SENTINEL_AUTO',
                    ai_class: prediction.class,
                    ai_confidence: prediction.score.toFixed(2)
                },
                mission_id: this.ctx.state.currentMissionId || null
            });

            if (res.success) {
                this.ctx.state.missions.push({
                    id: res.data?.id || `auto-${Date.now()}`,
                    title: prediction.class.toUpperCase(),
                    type: category,
                    lat: location.lat, lng: location.lng,
                    altitude: 0, metadata: { description }
                });
                this.ctx.renderMarkers();
                return { type: '📦 OBJETO', name: prediction.class.toUpperCase() };
            }
            return null;
        }
    }

    /**
     * Get current heading (helper)
     */
    _getHeading() {
        try {
            return (this.ctx.gpsEngine?.filteredHeading || this.ctx.gpsEngine?.heading || 0)
                + (this.ctx.arEngine?.headingOffset || 0);
        } catch (e) { return 0; }
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

    // ════════════════════════════════════════════════
    //  Phase 2-4: New Entity Creation Methods
    // ════════════════════════════════════════════════

    /**
     * Get current GPS coordinates (helper)
     */
    async _getGPSCoords() {
        // Try AR engine location first
        if (this.ctx.state.lastLocation) {
            return { lat: this.ctx.state.lastLocation.lat, lng: this.ctx.state.lastLocation.lng };
        }
        // Fallback to browser geolocation
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 60000, timeout: 5000 });
            });
            return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch (e) {
            return null;
        }
    }

    /**
     * Create a Point of Interest (POI)
     */
    async createPOI({ categoria_id, nombre, zona, nivel_riesgo, estado, descripcion }) {
        this.ctx.ui.showToast("Registrando POI...", 0);
        try {
            const coords = await this._getGPSCoords();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Sin autenticación");

            const { data, error } = await supabase
                .from('puntos_interes')
                .insert({
                    user_id: user.id,
                    mission_id: this.ctx.state.currentMissionId || null,
                    categoria_id: categoria_id || null,
                    nombre: nombre,
                    zona: zona || null,
                    nivel_riesgo: nivel_riesgo || 'medio',
                    estado: estado || 'activo',
                    descripcion: descripcion || null,
                    lat: coords?.lat || null,
                    lng: coords?.lng || null
                })
                .select()
                .single();

            if (error) throw error;
            this.ctx.ui.showToast(`✅ POI "${nombre}" registrado`, 3000);
            return data;
        } catch (e) {
            console.error('[POI] Error:', e);
            this.ctx.ui.showToast(`❌ Error POI: ${e.message}`, 4000);
            return null;
        }
    }

    /**
     * Create a Person record
     */
    async createPersona({ nombre, alias, contexto, notas }) {
        this.ctx.ui.showToast("Registrando persona...", 0);
        try {
            const coords = await this._getGPSCoords();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Sin autenticación");

            const { data, error } = await supabase
                .from('personas_encontradas')
                .insert({
                    user_id: user.id,
                    mission_id: this.ctx.state.currentMissionId || null,
                    nombre: nombre,
                    alias: alias || null,
                    contexto: contexto || 'desconocido',
                    notas: notas || null,
                    lat: coords?.lat || null,
                    lng: coords?.lng || null
                })
                .select()
                .single();

            if (error) throw error;
            this.ctx.ui.showToast(`✅ Persona "${nombre}" registrada`, 3000);
            return data;
        } catch (e) {
            console.error('[Persona] Error:', e);
            this.ctx.ui.showToast(`❌ Error Persona: ${e.message}`, 4000);
            return null;
        }
    }

    /**
     * Create a Route record
     */
    async createRuta({ nombre, dificultad, seguridad, notas }) {
        this.ctx.ui.showToast("Registrando ruta...", 0);
        try {
            const coords = await this._getGPSCoords();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Sin autenticación");

            const { data, error } = await supabase
                .from('rutas_exploracion')
                .insert({
                    user_id: user.id,
                    mission_id: this.ctx.state.currentMissionId || null,
                    nombre: nombre,
                    dificultad: dificultad || 'moderada',
                    seguridad: seguridad || 'precaucion',
                    notas: notas || null,
                    lat_inicio: coords?.lat || null,
                    lng_inicio: coords?.lng || null
                })
                .select()
                .single();

            if (error) throw error;
            this.ctx.ui.showToast(`✅ Ruta "${nombre}" registrada`, 3000);
            return data;
        } catch (e) {
            console.error('[Ruta] Error:', e);
            this.ctx.ui.showToast(`❌ Error Ruta: ${e.message}`, 4000);
            return null;
        }
    }

    /**
     * Load POI categories from Supabase
     */
    async loadPOICategories() {
        try {
            const { data, error } = await supabase
                .from('poi_categorias')
                .select('id, nombre, color, icono')
                .order('nombre');
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[POI] Categories error:', e);
            return [];
        }
    }

    // ════════════════════════════════════════════════
    //  Geotracking — GPS Trail Recording
    // ════════════════════════════════════════════════

    /**
     * Start recording GPS trail (every 10 seconds)
     */
    startGeoTrack() {
        if (this._geoTrackInterval) return; // Already running
        this._geoTrail = [];
        this._geoTrackInterval = setInterval(() => {
            if (this.ctx.state.lastLocation) {
                this._geoTrail.push({
                    lat: this.ctx.state.lastLocation.lat,
                    lng: this.ctx.state.lastLocation.lng,
                    t: Date.now()
                });
            }
        }, 10000); // Every 10 seconds
        console.log('[GeoTrack] Started recording trail');
    }

    /**
     * Stop recording GPS trail
     */
    stopGeoTrack() {
        if (this._geoTrackInterval) {
            clearInterval(this._geoTrackInterval);
            this._geoTrackInterval = null;
        }
        console.log(`[GeoTrack] Stopped. ${this._geoTrail?.length || 0} points recorded.`);
        return this._geoTrail || [];
    }

    /**
     * Save geotrack trail to mission record
     */
    async saveMissionGeotrack(missionId) {
        const trail = this._geoTrail || [];
        if (trail.length === 0 || !missionId) return;
        try {
            await supabase
                .from('misiones')
                .update({ geotrack: trail })
                .eq('id', missionId);
            console.log(`[GeoTrack] Saved ${trail.length} points to mission ${missionId}`);
        } catch (e) {
            console.error('[GeoTrack] Save error:', e);
        }
    }

    // ════════════════════════════════════════════════
    //  Mission Summary — Stats on End
    // ════════════════════════════════════════════════

    /**
     * Get mission stats for summary modal
     */
    async getMissionSummary(missionId) {
        if (!missionId) return null;
        try {
            const [objetos, pois, personas, rutas] = await Promise.all([
                supabase.from('objetos_exploracion').select('id', { count: 'exact', head: true }).eq('mission_id', missionId),
                supabase.from('puntos_interes').select('id', { count: 'exact', head: true }).eq('mission_id', missionId),
                supabase.from('personas_encontradas').select('id', { count: 'exact', head: true }).eq('mission_id', missionId),
                supabase.from('rutas_exploracion').select('id', { count: 'exact', head: true }).eq('mission_id', missionId)
            ]);

            return {
                objetos: objetos.count || 0,
                pois: pois.count || 0,
                personas: personas.count || 0,
                rutas: rutas.count || 0,
                geoTrailPoints: this._geoTrail?.length || 0
            };
        } catch (e) {
            console.error('[Summary] Error:', e);
            return { objetos: 0, pois: 0, personas: 0, rutas: 0, geoTrailPoints: 0 };
        }
    }
}
