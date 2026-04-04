/**
 * ModuleFullViewModal.js
 * Comprehensive modal for viewing all records of a Dashboard module
 * Features: Large Table, Real-time Filters, Summary Charts
 */
import { supabase } from '../../../../js/auth.js';
import { auth } from '../../../../js/auth.js';

class ModuleFullViewModal {
    constructor() {
        this.config = {
            misiones: {
                title: 'GESTIÓN DE MISIONES',
                icon: '🚀',
                table: 'misiones',
                columns: ['ID', 'Título', 'Estado', 'Fecha Inicio', 'Zona'],
                fields: ['codigo', 'titulo', 'estado', 'inicio_at', 'zona_geografica'],
                orderBy: 'inicio_at'
            },
            puntos_interes: {
                title: 'PUNTOS DE INTERÉS (POIs)',
                icon: '📍',
                table: 'puntos_interes',
                columns: ['Nombre', 'Categoría', 'Riesgo', 'Estado', 'Zona'],
                fields: ['nombre', 'categoria_id', 'nivel_riesgo', 'estado', 'zona'],
                orderBy: 'created_at'
            },
            objetos_exploracion: {
                title: 'ARCHIVOS DE OBJETOS',
                icon: '📦',
                table: 'objetos_exploracion',
                columns: ['ID', 'Nombre', 'Tipo', 'Confianza', 'Fecha'],
                fields: ['id', 'nombre', 'tipo', 'confianza', 'created_at'],
                orderBy: 'created_at'
            },
            personas_encontradas: {
                title: 'REGISTRO BIOMÉTRICO (PERSONAS)',
                icon: '👥',
                table: 'personas_encontradas',
                columns: ['Nombre', 'Alias', 'Contexto', 'Fecha'],
                fields: ['nombre', 'alias', 'contexto', 'created_at'],
                orderBy: 'created_at'
            },
            rutas_exploracion: {
                title: 'LOGÍSTICA DE RUTAS',
                icon: '🗺️',
                table: 'rutas_exploracion',
                columns: ['Nombre', 'Distancia', 'Seguridad', 'Fecha'],
                fields: ['nombre', 'distancia_km', 'seguridad', 'created_at'],
                orderBy: 'created_at'
            }
        };

        this.currentModule = null;
        this.rawData = [];
        this.filteredData = [];
        this.isBound = false;
    }

    /**
     * Bind DOM elements after they are injected into the page
     */
    initElements() {
        this.overlay = document.getElementById('module-full-view-modal');
        this.closeBtn = document.getElementById('btn-close-full-view');
        this.titleEl = document.getElementById('full-view-title');
        this.iconEl = document.getElementById('full-view-icon');
        this.tbody = document.getElementById('full-view-tbody');
        this.thead = document.getElementById('full-view-thead');
        this.filterSearch = document.getElementById('filter-search');
        this.statsGrid = document.getElementById('full-view-stats');
        this.canvas = document.getElementById('fullViewChart');
        
        if (this.overlay) {
            this.bindEvents();
        }
    }

    bindEvents() {
        if (!this.overlay || this.isBound) return;
        
        this.closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        this.filterSearch.addEventListener('input', () => this.applyFilters());
        
        this.isBound = true;
    }

    async open(moduleType) {
        if (!this.config[moduleType]) return;
        
        this.currentModule = moduleType;
        const cfg = this.config[moduleType];
        
        // Setup UI
        if (this.titleEl) this.titleEl.textContent = cfg.title;
        if (this.iconEl) this.iconEl.textContent = cfg.icon;
        this.renderThead(cfg.columns);
        this.tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding:40px; color:#555;">Sincronizando datos...</td></tr>';
        
        this.overlay.classList.add('active');
        
        // Fetch Data
        try {
            const user = await auth.getUser();
            if (!user) throw new Error("Sesión no válida");

            const { data, error } = await supabase
                .from(cfg.table)
                .select('*')
                .eq('user_id', user.id)
                .order(cfg.orderBy || 'created_at', { ascending: false });

            if (error) throw error;
            
            this.rawData = data || [];
            this.filteredData = [...this.rawData];
            
            this.renderTable();
            this.renderStats();
            this.renderChart();
            
        } catch (error) {
            console.error('[FullView] Fetch error:', error);
            this.tbody.innerHTML = `<tr><td colspan="100%" style="text-align:center; padding:40px; color:#ff4444;">Error al cargar datos: ${error.message}</td></tr>`;
        }
    }

    close() {
        this.overlay.classList.add('closing');
        setTimeout(() => {
            this.overlay.classList.remove('active', 'closing');
            this.currentModule = null;
            this.rawData = [];
            this.filteredData = [];
        }, 250);
    }

    renderThead(columns) {
        this.thead.innerHTML = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
    }

    renderTable() {
        if (this.filteredData.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding:40px; color:#555;">No se encontraron registros</td></tr>';
            return;
        }

        const cfg = this.config[this.currentModule];
        this.tbody.innerHTML = this.filteredData.map(row => `
            <tr data-id="${row.id}">
                ${cfg.fields.map(field => {
                    let val = row[field] === null || row[field] === undefined ? '—' : row[field];
                    
                    // Formatting helpers
                    if (field === 'codigo' && !row[field]) val = 'EXP-' + String(row.id).substring(0, 4).toUpperCase();
                    if (field === 'inicio_at' || field === 'created_at') val = this.formatDate(val);
                    if (field === 'distancia_km') val = Number(val).toFixed(1) + ' km';
                    if (field === 'confianza') val = (Number(val) * 100).toFixed(0) + '%';
                    
                    // Special HTML for badges
                    if (field === 'estado' || field === 'seguridad' || field === 'nivel_riesgo') {
                        return `<td><span class="badge ${this.getBadgeClass(val)}">${val}</span></td>`;
                    }

                    return `<td>${val}</td>`;
                }).join('')}
            </tr>
        `).join('');

        // Bind clicks to open detail modal
        this.tbody.querySelectorAll('tr').forEach(tr => {
            tr.onclick = () => {
                if (window.kepler?.openDetailModal) {
                    window.kepler.openDetailModal(tr.dataset.id, cfg.table, cfg.title);
                }
            };
        });
    }

    applyFilters() {
        const query = (this.filterSearch.value || "").toLowerCase();
        this.filteredData = this.rawData.filter(row => {
            return Object.values(row).some(val => 
                String(val).toLowerCase().includes(query)
            );
        });
        this.renderTable();
    }

    renderStats() {
        const stats = this.calculateStats();
        this.statsGrid.innerHTML = Object.entries(stats).map(([label, value]) => `
            <div class="stat-item">
                <span class="stat-label">${label}</span>
                <span class="stat-value">${value}</span>
            </div>
        `).join('');
    }

    calculateStats() {
        const total = this.rawData.length;
        if (this.currentModule === 'misiones') {
            const completadas = this.rawData.filter(r => String(r.estado).toLowerCase() === 'completada').length;
            return { 'Total': total, 'Completadas': completadas, 'Efectividad': total ? ((completadas/total)*100).toFixed(0) + '%' : '0%' };
        }
        if (this.currentModule === 'rutas_exploracion') {
            const totalKm = this.rawData.reduce((acc, r) => acc + (Number(r.distancia_km) || 0), 0);
            return { 'Total': total, 'KM Totales': totalKm.toFixed(1), 'Media KM': total ? (totalKm/total).toFixed(1) : 0 };
        }
        return { 'Total': total, 'Recientes (24h)': this.rawData.filter(r => new Date(r.created_at || r.inicio_at) > new Date(Date.now() - 86400000)).length };
    }

    renderChart() {
        if (!this.canvas) return;
        const ctx = this.canvas.getContext('2d');
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);
        
        // Simple bar chart of categorical distribution
        const distribution = this.getDistributionData();
        const keys = Object.keys(distribution);
        const vals = Object.values(distribution);
        if (keys.length === 0) return;
        
        const max = Math.max(...vals, 1);
        
        const padding = 40;
        const barW = (W - padding * 2) / keys.length - 10;
        
        keys.forEach((key, i) => {
            const h = (vals[i] / max) * (H - padding * 2);
            const x = padding + i * (barW + 10);
            const y = H - padding - h;
            
            // Bar
            ctx.fillStyle = 'rgba(63, 168, 255, 0.4)';
            ctx.fillRect(x, y, barW, h);
            ctx.strokeStyle = '#3FA8FF';
            ctx.strokeRect(x, y, barW, h);
            
            // Label
            ctx.fillStyle = '#888';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(String(key).substring(0, 6), x + barW/2, H - padding + 15);
            ctx.fillStyle = '#fff';
            ctx.fillText(vals[i], x + barW/2, y - 5);
        });
    }

    getDistributionData() {
        if (!this.currentModule) return {};
        const res = {};
        const fieldMap = {
            misiones: 'estado',
            puntos_interes: 'nivel_riesgo',
            objetos_exploracion: 'tipo',
            personas_encontradas: 'contexto',
            rutas_exploracion: 'seguridad'
        };
        const field = fieldMap[this.currentModule];
        this.rawData.forEach(r => {
            const val = r[field] || 'Otro';
            res[val] = (res[val] || 0) + 1;
        });
        return res;
    }

    getBadgeClass(val) {
        val = String(val).toLowerCase();
        if (val.includes('completada') || val.includes('seguro') || val.includes('bajo')) return 'badge-activo';
        if (val.includes('activa') || val.includes('medio') || val.includes('precaucion')) return 'badge-completada';
        if (val.includes('fallida') || val.includes('peligro') || val.includes('alto') || val.includes('critico')) return 'badge-fallido';
        return 'badge-desconocido';
    }

    formatDate(dateStr) {
        if (!dateStr || dateStr === '—') return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    }
}

export const moduleFullViewModal = new ModuleFullViewModal();

export function initModuleFullViewModal() {
    moduleFullViewModal.initElements();
    window.kepler = window.kepler || {};
    window.kepler.openFullView = (moduleType) => {
        moduleFullViewModal.open(moduleType);
    };
    return moduleFullViewModal;
}
