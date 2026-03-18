/**
 * missions-card.js
 * Dashboard Missions Card
 * Displays the 5 most recent missions
 * 
 * DB Schema (misiones):
 *   id, user_id, codigo, titulo, estado, inicio_at, fin_at, zona_geografica, zona, clima_snapshot, descripcion_ia
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';

/**
 * Initialize the missions card
 */
export async function initMissionsCard() {
    const tbody = document.getElementById('misiones-tbody');
    if (!tbody) return;

    // Render skeleton
    tbody.innerHTML = Array(5).fill(0).map(() => `
        <tr>
            <td><div class="skeleton skeleton-text" style="width: 50%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 60%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 40%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 20px"></div></td>
        </tr>
    `).join('');

    const user = await auth.getUser();
    if (!user) return;

    const missions = await fetchRecentMissions(user.id);
    renderMissionsTable(tbody, missions);
}

// Export fetch function for external reactivity
export async function fetchMissions() {
    const tbody = document.getElementById('misiones-tbody');
    const user = await auth.getUser();
    if (user && tbody) {
        const missions = await fetchRecentMissions(user.id);
        renderMissionsTable(tbody, missions);
    }
}

/**
 * Fetch the 5 most recent missions ordered by inicio_at
 */
async function fetchRecentMissions(userId) {
    const { data, error } = await supabase
        .from('misiones')
        .select('id, codigo, titulo, estado, inicio_at')
        .eq('user_id', userId)
        .order('inicio_at', { ascending: false })
        .limit(15);

    if (error) { console.error('[Missions] Fetch error:', error); return []; }
    return data || [];
}

/**
 * Map estado string to the correct badge class
 */
function getEstadoBadge(estado) {
    const map = {
        'activa': { class: 'badge-activo', icon: '●' },
        'completada': { class: 'badge-completada', icon: '●' },
        'fallida': { class: 'badge-fallido', icon: '●' },
        'abortada': { class: 'badge-fallido', icon: '●' },
        'planificada': { class: 'badge-planificada', icon: '●' }
    };
    return map[estado] || { class: 'badge-desconocido', icon: '●' };
}

/**
 * Format date to a readable string
 */
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' - ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Render missions data into the table body
 */
function renderMissionsTable(tbody, missions) {
    if (missions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#555; text-align:center; padding:20px;">No hay misiones registradas</td></tr>';
        return;
    }

    tbody.innerHTML = missions.map(m => {
        const badge = getEstadoBadge(m.estado);
        const displayId = m.codigo || ('exp_' + m.id.substring(0, 4).toUpperCase());
        return `
            <tr class="mission-row dashboard-row" data-id="${m.id}" data-title="${m.titulo}" style="cursor: pointer; transition: background 0.2s;">
                <td style="color:#666">${displayId}</td>
                <td>${m.titulo || 'Sin nombre'}</td>
                <td><span class="badge ${badge.class}">${badge.icon} ${m.estado}</span></td>
                <td style="color:#888; font-size:0.8rem">${formatDate(m.inicio_at)}</td>
                <td><span class="view-all-arrow">›</span></td>
            </tr>
        `;
    }).join('');

    // Bind click events
    tbody.querySelectorAll('.mission-row').forEach(row => {
        row.addEventListener('click', () => {
            if (window.kepler?.openDetailModal) {
                window.kepler.openDetailModal(row.dataset.id, 'misiones', 'EDICIÓN TÁCTICA: MISIÓN');
            }
        });
        
        // Hover effect styling injected natively to avoid touching separate CSS files
        row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.05)');
        row.addEventListener('mouseleave', () => row.style.background = 'transparent');
    });
}
