/**
 * rutas-card.js
 * Dashboard Rutas Card
 * Displays planned routes with distance and security status
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
}

/**
 * Fetch rutas_planificadas for the user
 */
async function fetchRutas(userId) {
    const { data, error } = await supabase
        .from('rutas_planificadas')
        .select('id, nombre, punto_control_destino, distancia_total, estado_seguridad')
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
        'Seguro': { class: 'badge-seguro', icon: '✓' },
        'Riesgo medio': { class: 'badge-riesgo-medio', icon: '⚠' },
        'Riesgo Alto': { class: 'badge-riesgo-alto', icon: '▲' },
        'Desconocido': { class: 'badge-desconocido', icon: '●' }
    };
    return map[status] || map['Desconocido'];
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
        const badge = getSecurityBadge(r.estado_seguridad);
        return `
            <tr>
                <td>${r.punto_control_destino || r.nombre}</td>
                <td>${formatDistance(r.distancia_total)}</td>
                <td><span class="badge ${badge.class}">${badge.icon} ${r.estado_seguridad}</span></td>
                <td><span class="view-all-arrow">›</span></td>
            </tr>
        `;
    }).join('');
}
