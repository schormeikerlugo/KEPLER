/**
 * rutas-card.js
 * Dashboard Rutas Card
 * Displays planned routes with distance and security status
 * DB Schema: rutas_exploracion
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';

/**
 * Initialize the rutas card
 */
export async function initRutasCard() {
    const tbody = document.getElementById('rutas-tbody');
    if (!tbody) return;

    const user = await auth.getUser();
    if (!user) return;

    const rutas = await fetchRutas(user.id);
    renderRutasTable(tbody, rutas);

    // Bind row clicks
    tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('.clickable-row');
        if (!tr) return;
        if (window.kepler?.openDetailModal) {
            window.kepler.openDetailModal(tr.dataset.id, 'rutas_exploracion', 'Detalle de Ruta');
        }
    });

    // Bind "View All" button
    const btnViewAll = document.querySelector('.card-rutas .btn-view-all-modal');
    if (btnViewAll) {
        btnViewAll.onclick = () => {
            if (window.kepler?.openFullView) window.kepler.openFullView('rutas_exploracion');
        };
    }
}

/**
 * Fetch rutas_exploracion for the user
 */
export async function fetchRutas(userId) {
    const { data, error } = await supabase
        .from('rutas_exploracion')
        .select('id, nombre, distancia_km, seguridad, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) { console.error('[Rutas] Fetch error:', error); return []; }
    return data || [];
}

/**
 * Map security status to badge class and icon
 */
function getSecurityBadge(status) {
    const map = {
        'seguro': { class: 'badge-seguro', icon: '✓', label: 'Seguro' },
        'precaucion': { class: 'badge-riesgo-medio', icon: '⚠', label: 'Precaución' },
        'peligro': { class: 'badge-riesgo-alto', icon: '▲', label: 'Peligro' }
    };
    return map[status?.toLowerCase()] || { class: 'badge-desconocido', icon: '●', label: status || 'Desconocido' };
}

/**
 * Format distance to readable format
 */
function formatDistance(km) {
    if (km === null || km === undefined) return '—';
    return `${Number(km).toFixed(1)} km`;
}

/**
 * Render rutas data into the table body
 */
function renderRutasTable(tbody, rutas) {
    if (rutas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#555; text-align:center; padding:20px;">No hay rutas planificadas</td></tr>';
        return;
    }

    tbody.innerHTML = rutas.map(r => {
        const badge = getSecurityBadge(r.seguridad);
        return `
            <tr data-id="${r.id}" class="clickable-row">
                <td>${r.nombre || 'Ruta'}</td>
                <td>${formatDistance(r.distancia_km)}</td>
                <td><span class="badge ${badge.class}">${badge.icon} ${badge.label}</span></td>
                <td><span class="view-all-arrow">›</span></td>
            </tr>
        `;
    }).join('');
}
