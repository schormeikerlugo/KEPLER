/**
 * objects-card.js
 * Dashboard Objects Card
 * Displays objetos_exploracion table + radar chart
 * 
 * DB Schema (objetos_exploracion):
 *   id, user_id, nombre, tipo, confianza, imagen_url, categoria_id, categorias(nombre)
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';

// Color palette for object categories
const CATEGORY_COLORS = {
    'Mineral': '#ff6b6b',
    'Energía': '#ff6b6b',
    'Animales': '#ffa94d',
    'Plantas': '#69db7c',
    'Tecnología': '#74c0fc',
    'Artefacto': '#b197fc',
    'tech': '#74c0fc',
    'person': '#e599f7',
    'common': '#868e96',
    'marker': '#ffd43b',
    'Lugares': '#20c997',
    'default': '#868e96'
};

/**
 * Initialize the objects card (table + radar chart)
 */
export async function initObjectsCard() {
    const tbody = document.getElementById('objetos-tbody');
    const canvas = document.getElementById('objetos-radar-chart');
    if (!tbody) return;

    const user = await auth.getUser();
    if (!user) return;

    const objects = await fetchObjects(user.id);
    const aggregated = aggregateObjects(objects);

    renderObjectsTable(tbody, aggregated);

    // Bind row clicks
    tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('.clickable-row');
        if (!tr) return;
        const rawId = tr.dataset.id;
        if (window.kepler?.openDetailModal) {
            window.kepler.openDetailModal(rawId, 'objetos_exploracion', 'Detalle de Objeto');
        }
    });

    if (canvas) {
        drawRadarChart(canvas, aggregated);
    }
}

/**
 * Fetch objetos_exploracion — resilient to null categoria_id
 */
export async function fetchObjects(userId) {
    // Fetch objects without FK join (many objects lack categoria_id)
    const { data: objects, error } = await supabase
        .from('objetos_exploracion')
        .select('id, nombre, tipo, categoria_id')
        .eq('user_id', userId);

    if (error) { console.error('[Objects] Fetch error:', error); return []; }
    if (!objects || objects.length === 0) return [];

    // Fetch category names for objects that have a categoria_id
    const catIds = [...new Set(objects.filter(o => o.categoria_id).map(o => o.categoria_id))];
    let catMap = {};

    if (catIds.length > 0) {
        const { data: cats } = await supabase
            .from('categorias')
            .select('id, nombre')
            .in('id', catIds);

        if (cats) {
            cats.forEach(c => { catMap[c.id] = c.nombre; });
        }
    }

    // Merge category names into objects
    return objects.map(obj => ({
        ...obj,
        categoria_nombre: catMap[obj.categoria_id] || obj.tipo || 'Sin categoría'
    }));
}

/**
 * Aggregate objects by name/category for the table display
 */
function aggregateObjects(objects) {
    const map = {};

    objects.forEach(obj => {
        const key = obj.nombre?.toLowerCase() || 'desconocido';
        const catName = obj.categoria_nombre || obj.tipo || 'Sin categoría';

        if (!map[key]) {
            map[key] = {
                id: obj.id, // Original UUID for editing
                displayId: 'obj_' + obj.id.substring(0, 4).toUpperCase(),
                nombre: obj.nombre || 'Desconocido',
                categoria: catName,
                count: 0,
                color: getCategoryColor(catName)
            };
        }
        map[key].count++;
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
}

/**
 * Get a color for a category name
 */
function getCategoryColor(catName) {
    return CATEGORY_COLORS[catName] || CATEGORY_COLORS.default;
}

/**
 * Render the objects table
 */
function renderObjectsTable(tbody, items) {
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:#555; text-align:center; padding:20px;">No hay objetos registrados</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr data-id="${item.id}" class="clickable-row">
            <td><span class="obj-color-dot" style="background:${item.color}"></span></td>
            <td style="color:#666">${item.displayId}</td>
            <td>${item.nombre}</td>
            <td style="color:#888">${item.categoria}</td>
            <td>${item.count}</td>
            <td><span class="view-all-arrow">›</span></td>
        </tr>
    `).join('');
}

/**
 * Draw a simple radar/spider chart on canvas
 */
function drawRadarChart(canvas, items) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxRadius = Math.min(W, H) * 0.38;

    const categories = aggregateByCategoryForChart(items).slice(0, 6);
    if (categories.length < 2) return;

    const n = categories.length;
    const maxVal = Math.max(...categories.map(c => c.count), 1);
    const angleStep = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, W, H);
    drawGridRings(ctx, cx, cy, maxRadius, 3);
    drawAxisLines(ctx, cx, cy, maxRadius, n, angleStep);
    drawLabels(ctx, cx, cy, maxRadius, categories, angleStep);
    drawDataPolygon(ctx, cx, cy, maxRadius, categories, maxVal, n, angleStep);
}

/** Aggregate items by category name for chart data */
function aggregateByCategoryForChart(items) {
    const map = {};
    items.forEach(item => {
        if (!map[item.categoria]) {
            map[item.categoria] = { name: item.categoria, count: 0, color: item.color };
        }
        map[item.categoria].count += item.count;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
}

/** Draw concentric grid rings */
function drawGridRings(ctx, cx, cy, maxR, rings) {
    for (let i = 1; i <= rings; i++) {
        const r = (maxR / rings) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

/** Draw axis lines from center to each vertex */
function drawAxisLines(ctx, cx, cy, maxR, n, angleStep) {
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
    }
}

/** Draw category labels at each vertex */
function drawLabels(ctx, cx, cy, maxR, categories, angleStep) {
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    categories.forEach((cat, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        ctx.fillText(cat.name, cx + (maxR + 18) * Math.cos(angle), cy + (maxR + 18) * Math.sin(angle) + 3);
    });
}

/** Draw the data polygon with fill and stroke */
function drawDataPolygon(ctx, cx, cy, maxR, categories, maxVal, n, angleStep) {
    ctx.beginPath();
    categories.forEach((cat, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const r = maxR * (cat.count / maxVal);
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(63, 168, 255, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#3FA8FF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw data points
    categories.forEach((cat, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const r = maxR * (cat.count / maxVal);
        ctx.beginPath();
        ctx.arc(cx + r * Math.cos(angle), cy + r * Math.sin(angle), 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#3FA8FF';
        ctx.fill();
    });
}
