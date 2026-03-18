/**
 * pois-card.js
 * Dashboard POIs Card — Interactive drill-down
 * 
 * Views:
 *   1. Category list (with counts and color dots)
 *   2. Items in a category (click to expand)
 *   3. Item detail (full info panel)
 * 
 * DB: poi_categorias + puntos_interes
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';

const RISK_COLORS = {
    'bajo': '#00c878',
    'medio': '#ffa94d',
    'alto': '#ff6b6b',
    'critico': '#ff4444'
};

const RISK_LABELS = {
    'bajo': 'Bajo',
    'medio': 'Medio',
    'alto': 'Alto',
    'critico': 'Crítico'
};

let poisContainer = null;

/**
 * Initialize the POIs card
 */
export async function initPOIsCard() {
    poisContainer = document.getElementById('pois-list');
    if (!poisContainer) return;

    const user = await auth.getUser();
    if (!user) return;

    await renderCategoryView(user.id);
}

export async function fetchPOIs() {
    const user = await auth.getUser();
    if (user) await renderCategoryView(user.id);
}

// ─────────────────────────────────────────────
// VIEW 1: Category list with counts
// ─────────────────────────────────────────────
async function renderCategoryView(userId) {
    poisContainer.innerHTML = '<p style="color:#555; font-size:0.85rem; padding:10px;">Cargando POIs...</p>';

    // Fetch categories + counts
    const { data: categories, error: catErr } = await supabase
        .from('poi_categorias')
        .select('id, nombre, color, icono')
        .order('nombre');

    if (catErr) { console.error('[POIs] Categories error:', catErr); return; }

    const { data: pois, error: poiErr } = await supabase
        .from('puntos_interes')
        .select('categoria_id')
        .eq('user_id', userId);

    if (poiErr) { console.error('[POIs] Count error:', poiErr); }

    // Count per category
    const counts = {};
    (pois || []).forEach(p => {
        counts[p.categoria_id] = (counts[p.categoria_id] || 0) + 1;
    });

    if (!categories || categories.length === 0) {
        poisContainer.innerHTML = '<p style="color:#555; font-size:0.85rem; padding:10px;">No hay categorías de POI</p>';
        return;
    }

    poisContainer.innerHTML = categories.map(cat => {
        const count = counts[cat.id] || 0;
        return `
            <div class="poi-item poi-category-item" data-cat-id="${cat.id}" data-user-id="${userId}">
                <div class="poi-item-left">
                    <span class="poi-color-dot" style="background:${cat.color}"></span>
                    <span class="poi-count-badge">(${count.toString().padStart(2, '0')})</span>
                    <span class="poi-item-name">${cat.nombre}</span>
                </div>
                <span class="view-all-arrow">›</span>
            </div>
        `;
    }).join('');

    // Attach click handlers
    poisContainer.querySelectorAll('.poi-category-item').forEach(el => {
        el.addEventListener('click', () => {
            const catId = el.dataset.catId;
            const userId = el.dataset.userId;
            const catName = el.querySelector('.poi-item-name').textContent;
            const catColor = el.querySelector('.poi-color-dot').style.background;
            renderItemListView(userId, catId, catName, catColor);
        });
    });
}

// ─────────────────────────────────────────────
// VIEW 2: Items in a category
// ─────────────────────────────────────────────
async function renderItemListView(userId, catId, catName, catColor) {
    poisContainer.innerHTML = '<p style="color:#555; font-size:0.85rem; padding:10px;">Cargando...</p>';

    const { data: items, error } = await supabase
        .from('puntos_interes')
        .select('id, nombre, zona, nivel_riesgo')
        .eq('user_id', userId)
        .eq('categoria_id', catId)
        .order('nombre');

    if (error) { console.error('[POIs] Items error:', error); return; }

    // Back button + items
    let html = `
        <div class="poi-back-row" id="poi-back-btn">
            <span class="poi-back-arrow">‹</span>
            <span class="poi-back-label">${catName}</span>
        </div>
    `;

    if (!items || items.length === 0) {
        html += '<p style="color:#555; font-size:0.85rem; padding:10px;">No hay POIs en esta categoría</p>';
    } else {
        html += items.map(item => `
            <div class="poi-item poi-detail-trigger" data-poi-id="${item.id}" data-user-id="${userId}" data-cat-id="${catId}" data-cat-name="${catName}" data-cat-color="${catColor}">
                <div class="poi-item-left">
                    <span class="poi-color-dot" style="background:${RISK_COLORS[item.nivel_riesgo] || '#888'}"></span>
                    <span class="poi-item-name">${item.nombre}</span>
                </div>
                <span class="poi-zona-label">${item.zona || ''}</span>
                <span class="view-all-arrow">›</span>
            </div>
        `).join('');
    }

    poisContainer.innerHTML = html;

    // Back button handler
    document.getElementById('poi-back-btn')?.addEventListener('click', () => {
        renderCategoryView(userId);
    });

    // Detail click handlers
    poisContainer.querySelectorAll('.poi-detail-trigger').forEach(el => {
        el.addEventListener('click', () => {
            // Replaced inline renderDetailView with the global Deep-Dive Modal
            if (window.kepler?.openDetailModal) {
                window.kepler.openDetailModal(el.dataset.poiId, 'puntos_interes', 'Detalle de POI');
            } else {
                renderDetailView(el.dataset.poiId, el.dataset.userId, el.dataset.catId, el.dataset.catName, el.dataset.catColor);
            }
        });
    });
}

// ─────────────────────────────────────────────
// VIEW 3: Full detail of a single POI
// ─────────────────────────────────────────────
async function renderDetailView(poiId, userId, catId, catName, catColor) {
    poisContainer.innerHTML = '<p style="color:#555; font-size:0.85rem; padding:10px;">Cargando detalle...</p>';

    const { data: poi, error } = await supabase
        .from('puntos_interes')
        .select('*')
        .eq('id', poiId)
        .single();

    if (error || !poi) {
        console.error('[POIs] Detail error:', error);
        poisContainer.innerHTML = '<p style="color:#ff4444; font-size:0.85rem; padding:10px;">Error al cargar detalle</p>';
        return;
    }

    const riskColor = RISK_COLORS[poi.nivel_riesgo] || '#888';
    const riskLabel = RISK_LABELS[poi.nivel_riesgo] || poi.nivel_riesgo;

    poisContainer.innerHTML = `
        <div class="poi-back-row" id="poi-back-detail">
            <span class="poi-back-arrow">‹</span>
            <span class="poi-back-label">${catName}</span>
        </div>
        <div class="poi-detail-card">
            <h4 class="poi-detail-title">${poi.nombre}</h4>
            <p class="poi-detail-desc">${poi.descripcion || 'Sin descripción.'}</p>
            <div class="poi-detail-meta">
                <div class="poi-meta-item">
                    <span class="poi-meta-label">Zona</span>
                    <span class="poi-meta-value">${poi.zona || '—'}</span>
                </div>
                <div class="poi-meta-item">
                    <span class="poi-meta-label">Riesgo</span>
                    <span class="poi-meta-value" style="color:${riskColor}">● ${riskLabel}</span>
                </div>
                <div class="poi-meta-item">
                    <span class="poi-meta-label">Estado</span>
                    <span class="poi-meta-value">${poi.estado === 'activo' ? '🟢 Activo' : poi.estado === 'inactivo' ? '🟡 Inactivo' : '🔴 Destruido'}</span>
                </div>
                <div class="poi-meta-item">
                    <span class="poi-meta-label">Coords</span>
                    <span class="poi-meta-value">${poi.lat ? poi.lat.toFixed(4) + ', ' + poi.lng.toFixed(4) : '—'}</span>
                </div>
            </div>
        </div>
    `;

    // Back to item list
    document.getElementById('poi-back-detail')?.addEventListener('click', () => {
        renderItemListView(userId, catId, catName, catColor);
    });
}
