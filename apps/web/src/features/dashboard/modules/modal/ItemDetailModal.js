/**
 * ItemDetailModal.js
 * Generic modal for viewing and editing details of Dashboard entities
 * Supports: objetos_exploracion, personas_encontradas, puntos_interes, rutas_exploracion
 */
import { supabase } from '../../../../js/auth.js';

class ItemDetailModal {
    constructor() {
        this.modal = document.getElementById('item-detail-modal');
        this.content = document.getElementById('item-detail-content');
        this.closeBtn = document.getElementById('btn-close-detail');
        this.saveBtn = document.getElementById('btn-save-detail');
        this.deleteBtn = document.getElementById('btn-delete-detail');
        this.form = document.getElementById('detail-form');
        this.imageEl = document.getElementById('detail-image');
        this.imagePlaceholder = document.querySelector('.detail-image-placeholder');
        this.chartWrapper = document.getElementById('detail-chart-wrapper');
        this.chartCanvas = document.getElementById('detailRadarChart');
        
        this.currentId = null;
        this.currentTable = null;
        this.selectedPills = new Set();

        this.bindEvents();
    }

    bindEvents() {
        if (!this.modal) return;
        
        this.closeBtn?.addEventListener('click', () => this.close());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        this.saveBtn?.addEventListener('click', () => this.saveChanges());
        this.deleteBtn?.addEventListener('click', () => this.deleteRecord());
    }

    /**
     * Open the modal and load data for a specific item
     * @param {string} id - UUID of the item
     * @param {string} tableName - Supabase table to query
     * @param {string} titleOverride - Optional custom title
     */
    async open(id, tableName, titleOverride = null) {
        this.currentId = id;
        this.currentTable = tableName;
        this.selectedPills.clear();
        
        // Setup initial UI state
        let modalTitle = document.getElementById('detail-modal-title');
        if (modalTitle) modalTitle.textContent = titleOverride || 'EDITAR REGISTRO';
        
        this.imageEl.style.display = 'none';
        if(this.imagePlaceholder) this.imagePlaceholder.style.display = 'block';
        if(this.chartWrapper) this.chartWrapper.style.display = 'none';

        this.form.innerHTML = '<div class="detail-loading">Cargando datos...</div>';
        this.saveBtn.style.display = 'none';
        this.deleteBtn.style.display = 'none';
        
        // Show modal immediately
        this.modal.style.display = 'flex';

        // Fetch Data
        try {
            const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) throw new Error('No data found');

            this.renderForm(data, tableName);
            
            // Handle Image
            if (data.image_url) {
                this.imageEl.src = data.image_url;
                this.imageEl.style.display = 'block';
                if(this.imagePlaceholder) this.imagePlaceholder.style.display = 'none';
            }

            // Draw Radar Chart (Simulated strategic data for any entity)
            if (this.chartWrapper && this.chartCanvas) {
                this.chartWrapper.style.display = 'block';
                this.drawEntityRadarChart(data, tableName);
            }

            this.saveBtn.style.display = 'block';
            this.deleteBtn.style.display = 'block';

        } catch (error) {
            console.error('[ItemDetailModal] Fetch error:', error);
            this.form.innerHTML = `<div class="detail-error">Error al cargar datos: ${error.message}</div>`;
        }
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.add('closing');
        setTimeout(() => {
            this.modal.style.display = 'none';
            this.modal.classList.remove('closing');
            this.currentId = null;
            this.currentTable = null;
        }, 250);
    }

    /**
     * Render the form dynamically based on the table schema and data
     */
    renderForm(data, tableName) {
        let fieldsHtml = '';

        // ID field is always readonly
        fieldsHtml += this.buildField('id', 'ID', data.id, 'text', true);

        // Customize fields based on table type
        if (tableName === 'objetos_exploracion') {
            fieldsHtml += this.buildField('nombre', 'Nombre', data.nombre);
            fieldsHtml += this.buildField('tipo', 'Tipo Original', data.tipo, 'text', true);
            fieldsHtml += this.buildField('descripcion_ia', 'Análisis IA', data.descripcion_ia || '', 'textarea');
        } 
        else if (tableName === 'personas_encontradas') {
            fieldsHtml += this.buildField('nombre', 'Nombre Misión', data.nombre);
            fieldsHtml += this.buildField('alias', 'Identidad Re-ID (Alias)', data.alias);
            fieldsHtml += this.buildField('contexto', 'Contexto / Zona', data.contexto);
            fieldsHtml += this.buildField('notas', 'Notas Biométricas', data.notas || '', 'textarea');
        }
        else if (tableName === 'puntos_interes') {
            fieldsHtml += this.buildField('nombre', 'Nombre POI', data.nombre);
            fieldsHtml += this.buildField('categoria', 'Categoría', data.categoria);
            fieldsHtml += this.buildField('descripcion', 'Descripción', data.descripcion || '', 'textarea');
        }
        else if (tableName === 'rutas_exploracion') {
            fieldsHtml += this.buildField('nombre', 'Nombre Ruta', data.nombre);
            fieldsHtml += this.buildField('distancia_km', 'Distancia (km)', data.distancia_km, 'number', true);
            fieldsHtml += `
                <div class="detail-field">
                    <label class="detail-label">Nivel de Seguridad</label>
                    <select id="field-seguridad" class="detail-input select" data-field="seguridad">
                        <option value="seguro" ${data.seguridad === 'seguro' ? 'selected' : ''}>Seguro</option>
                        <option value="precaucion" ${data.seguridad === 'precaucion' ? 'selected' : ''}>Precaución</option>
                        <option value="peligro" ${data.seguridad === 'peligro' ? 'selected' : ''}>Peligro</option>
                    </select>
                </div>
            `;
            fieldsHtml += this.buildField('notas', 'Notas de Ruta', data.notas || '', 'textarea');
            fieldsHtml += this.buildField('notas', 'Notas de Ruta', data.notas || '', 'textarea');
        }
        else if (tableName === 'misiones') {
            fieldsHtml += this.buildField('codigo', 'Código Misión', data.codigo, 'text', true);
            fieldsHtml += this.buildField('titulo', 'Nombre', data.titulo);
            fieldsHtml += `
                <div class="detail-field">
                    <label class="detail-label">Estado de Misión</label>
                    <select id="field-estado" class="detail-input select" data-field="estado">
                        <option value="activa" ${data.estado === 'activa' ? 'selected' : ''}>Activa</option>
                        <option value="completada" ${data.estado === 'completada' ? 'selected' : ''}>Completada</option>
                        <option value="fallida" ${data.estado === 'fallida' ? 'selected' : ''}>Fallida/Abortada</option>
                        <option value="planificada" ${data.estado === 'planificada' ? 'selected' : ''}>Planificada</option>
                    </select>
                </div>
            `;
            fieldsHtml += this.buildField('zona_geografica', 'Zona Registrada', data.zona_geografica);
            fieldsHtml += this.buildField('descripcion_ia', 'Resumen IA', data.descripcion_ia || '', 'textarea');
        }

        // Always add the interactive Tags (Pills) UI at the end
        fieldsHtml += this.buildPillsUI();

        this.form.innerHTML = fieldsHtml;
        this.bindPillsEvents();

        // ── Map Integration Feature (Phase 8) ──
        this.injectMapButtonIfGeotrack(data.geotrack);
    }

    injectMapButtonIfGeotrack(geotrack) {
        // Remove existing map button if any
        const existingBtn = document.getElementById('btn-view-map-detail');
        if (existingBtn) existingBtn.remove();

        const hasFeatures = geotrack && geotrack.features && geotrack.features.length > 0;
        const hasPoints = Array.isArray(geotrack) && geotrack.length > 0;

        if (hasFeatures || hasPoints) {
            const footer = document.querySelector('.detail-footer-inner');
            if (footer) {
                const mapBtn = document.createElement('button');
                mapBtn.id = 'btn-view-map-detail';
                mapBtn.className = 'btn-detail btn-primary';
                mapBtn.style.borderColor = '#00c878';
                mapBtn.style.color = '#00c878';
                mapBtn.innerHTML = '🗺️ VER EN MAPA';
                mapBtn.onclick = async () => {
                    this.close();
                    
                    // Switch to map tab via the global navigator API
                    if (window.kepler && window.kepler.map && typeof window.kepler.map.openMap === 'function') {
                        await window.kepler.map.openMap();
                    } else {
                        // Fallback click triggers
                        const mobileMapBtn = document.getElementById('mobile-btn-map');
                        if (mobileMapBtn) mobileMapBtn.click();
                        const desktopMapBtn = document.getElementById('nav-btn-map');
                        if (desktopMapBtn) desktopMapBtn.click();
                    }
                    
                    // Small delay to ensure MapLibre DOM is fully mounted before injecting GeoJSON sources
                    setTimeout(() => {
                        // Dispatch global event for MapController to catch
                        window.dispatchEvent(new CustomEvent('kepler:show_geotrack_on_map', {
                            detail: { geotrack: geotrack }
                        }));
                    }, 400);
                };
                footer.insertBefore(mapBtn, footer.firstChild);
            }
        }
    }

    buildPillsUI() {
        // Predefined tags to exactly match the screenshot requested
        const tags = ['IMPORTANTE', 'FRECUENTE', 'FAVORITO', 'PELIGRO', 'TEMPORAL', 'VERIFICADO'];
        let pillsHtml = tags.map(tag => `<button type="button" class="ui-pill" data-tag="${tag}">${tag}</button>`).join('');
        
        return `
            <div class="detail-field" style="margin-top: 10px;">
                <label class="detail-label">ETIQUETAS</label>
                <div class="pills-container">
                    ${pillsHtml}
                </div>
            </div>
        `;
    }

    bindPillsEvents() {
        const pills = this.form.querySelectorAll('.ui-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                const btn = e.target;
                const tag = btn.dataset.tag;
                if (btn.classList.contains('active')) {
                    btn.classList.remove('active');
                    this.selectedPills.delete(tag);
                } else {
                    btn.classList.add('active');
                    this.selectedPills.add(tag);
                }
            });
        });
    }

    buildField(key, label, value, type = 'text', readonly = false) {
        const valStr = value === null || value === undefined ? '' : String(value).replace(/"/g, '&quot;');
        
        if (type === 'textarea') {
            return `
                <div class="detail-field">
                    <label class="detail-label">${label}</label>
                    <textarea id="field-${key}" class="detail-input textarea" data-field="${key}" ${readonly ? 'readonly' : ''} rows="3">${valStr}</textarea>
                </div>
            `;
        }

        return `
            <div class="detail-field">
                <label class="detail-label">${label}</label>
                <input type="${type}" id="field-${key}" class="detail-input" data-field="${key}" value="${valStr}" ${readonly ? 'readonly class="detail-input locked"' : ''}>
            </div>
        `;
    }

    /**
     * Draws a radar chart on the canvas visualizing strategic data
     */
    drawEntityRadarChart(data, tableName) {
        const canvas = this.chartCanvas;
        // Fix internal resolution for clarity
        const rect = this.chartWrapper.getBoundingClientRect();
        canvas.width = rect.width || 300;
        canvas.height = rect.height || 300;

        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const maxRadius = Math.min(W, H) * 0.35;

        // Simulate some strategic stats based on the entity type
        let stats = [];
        if (tableName === 'personas_encontradas') {
            stats = [
                { label: 'Amenaza', val: Math.random() * 100, color: '#ff4444' },
                { label: 'Fiabilidad', val: 50 + Math.random() * 40, color: '#00c878' },
                { label: 'Relevancia', val: 30 + Math.random() * 60, color: '#3FA8FF' },
                { label: 'Actividad', val: Math.random() * 100, color: '#ffa94d' },
                { label: 'Vínculos', val: Math.random() * 80, color: '#b366ff' }
            ];
        } else if (tableName === 'rutas_exploracion') {
            const danger = data.seguridad === 'peligro' ? 90 : data.seguridad === 'precaucion' ? 50 : 10;
            stats = [
                { label: 'Riesgo', val: danger, color: '#ff6b6b' },
                { label: 'Terreno', val: 40 + Math.random() * 50, color: '#ffa94d' },
                { label: 'Visibilidad', val: 20 + Math.random() * 70, color: '#3FA8FF' },
                { label: 'Cobertura', val: Math.random() * 100, color: '#00c878' },
                { label: 'Longitud', val: Math.min((data.distancia_km || 5) * 10, 100), color: '#b366ff' }
            ];
        } else {
            // POIs and Objects
            stats = [
                { label: 'Estratégico', val: 40 + Math.random() * 60, color: '#3FA8FF' },
                { label: 'Durabilidad', val: Math.random() * 100, color: '#00c878' },
                { label: 'Anomalía', val: Math.random() * 80, color: '#ff4444' },
                { label: 'Radio Inf.', val: 20 + Math.random() * 60, color: '#ffa94d' },
                { label: 'Recursos', val: Math.random() * 100, color: '#b366ff' }
            ];
        }

        const n = stats.length;
        const angleStep = (2 * Math.PI) / n;

        ctx.clearRect(0, 0, W, H);

        // Grid Rings
        const rings = 4;
        for (let i = 1; i <= rings; i++) {
            const r = (maxRadius / rings) * i;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Axis Lines & Labels
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + maxRadius * Math.cos(angle), cy + maxRadius * Math.sin(angle));
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.stroke();

            // Label
            ctx.fillStyle = stats[i].color;
            ctx.fillText(stats[i].label, cx + (maxRadius + 20) * Math.cos(angle), cy + (maxRadius + 20) * Math.sin(angle));
        }

        // Data Polygon (Base Fill)
        ctx.beginPath();
        stats.forEach((stat, i) => {
            const angle = -Math.PI / 2 + i * angleStep;
            const r = maxRadius * (stat.val / 100);
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(63, 168, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 168, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Data Points
        stats.forEach((stat, i) => {
            const angle = -Math.PI / 2 + i * angleStep;
            const r = maxRadius * (stat.val / 100);
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = stat.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    async saveChanges() {
        if (!this.currentId || !this.currentTable) return;

        // Gather data from inputs
        const updates = {};
        const inputs = this.form.querySelectorAll('[data-field]');
        
        inputs.forEach(input => {
            if (!input.readOnly) {
                updates[input.dataset.field] = input.value;
            }
        });
        
        // (Optional Feature) We could save this.selectedPills to a JSON column here.

        const btnText = this.saveBtn.textContent;
        this.saveBtn.textContent = 'Guardando...';
        this.saveBtn.disabled = true;

        try {
            const { error } = await supabase
                .from(this.currentTable)
                .update(updates)
                .eq('id', this.currentId);

            if (error) throw error;

            if (window.kepler?.notify) {
                window.kepler.notify.success('Cambios guardados correctamente');
            }

            // Dispatch global event so cards can re-fetch data
            window.dispatchEvent(new CustomEvent('kepler:data_updated', {
                detail: { table: this.currentTable }
            }));

            this.close();

        } catch (error) {
            console.error('[ItemDetailModal] Update error:', error);
            if (window.kepler?.notify) {
                window.kepler.notify.error('Error al guardar: ' + error.message);
            }
        } finally {
            this.saveBtn.textContent = btnText;
            this.saveBtn.disabled = false;
        }
    }

    async deleteRecord() {
        if (!this.currentId || !this.currentTable) return;
        
        if (!confirm('¿Seguro que deseas ELIMINAR este registro? Esta acción es irreversible.')) {
            return;
        }

        const btnText = this.deleteBtn.textContent;
        this.deleteBtn.textContent = 'Eliminando...';
        this.deleteBtn.disabled = true;

        try {
            const { error } = await supabase
                .from(this.currentTable)
                .delete()
                .eq('id', this.currentId);

            if (error) throw error;

            if (window.kepler?.notify) {
                window.kepler.notify.success('Registro eliminado');
            }

            // Sync Dashboard
            window.dispatchEvent(new CustomEvent('kepler:data_updated', {
                detail: { table: this.currentTable }
            }));

            this.close();

        } catch (error) {
            console.error('[ItemDetailModal] Delete error:', error);
            if (window.kepler?.notify) {
                window.kepler.notify.error('Error al eliminar: ' + error.message);
            }
        } finally {
            this.deleteBtn.textContent = btnText;
            this.deleteBtn.disabled = false;
        }
    }
}

export const itemDetailModal = new ItemDetailModal();

/**
 * Helper to initialize the modal singleton
 */
export function initItemDetailModal() {
    // Already constructed globally, just ensure events are bound if DOM was late
    itemDetailModal.modal = document.getElementById('item-detail-modal');
    itemDetailModal.content = document.getElementById('item-detail-content');
    itemDetailModal.closeBtn = document.getElementById('btn-close-detail');
    itemDetailModal.saveBtn = document.getElementById('btn-save-detail');
    itemDetailModal.deleteBtn = document.getElementById('btn-delete-detail');
    itemDetailModal.form = document.getElementById('detail-form');
    itemDetailModal.imageEl = document.getElementById('detail-image');
    itemDetailModal.bindEvents();
    
    // Attach to global window for easy calling from onClick handlers in HTML strings
    window.kepler = window.kepler || {};
    window.kepler.openDetailModal = (id, tableName, title) => {
        itemDetailModal.open(id, tableName, title);
    };
    
    return itemDetailModal;
}
