/**
 * personas-card.js
 * Dashboard Personas Card
 * Displays encountered biometric entities
 * DB Schema: personas_encontradas
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';

/**
 * Initialize the personas card
 */
export async function initPersonasCard() {
    const tbody = document.getElementById('personas-tbody');
    if (!tbody) return;

    // Render skeleton
    tbody.innerHTML = Array(3).fill(0).map(() => `
        <tr>
            <td><div class="skeleton skeleton-avatar"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 60%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 40%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 50%"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 20px"></div></td>
        </tr>
    `).join('');

    const user = await auth.getUser();
    if (!user) return;

    const personas = await fetchPersonas(user.id);
    renderPersonasTable(tbody, personas);

    // Bind row clicks
    tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('.clickable-row');
        if (!tr) return;
        if (window.kepler?.openDetailModal) {
            window.kepler.openDetailModal(tr.dataset.id, 'personas_encontradas', 'Detalle de Persona');
        }
    });

    // Bind "View All" button
    const btnViewAll = document.querySelector('.card-personas .btn-view-all-modal');
    if (btnViewAll) {
        btnViewAll.onclick = () => {
            if (window.kepler?.openFullView) window.kepler.openFullView('personas_encontradas');
        };
    }
}

/**
 * Fetch personas_encontradas for the user
 */
export async function fetchPersonas(userId) {
    const { data, error } = await supabase
        .from('personas_encontradas')
        .select('id, nombre, contexto, image_url, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) { console.error('[Personas] Fetch error:', error); return []; }
    return data || [];
}

/**
 * Generate a placeholder avatar (colored circle with initial)
 */
function getAvatarHTML(persona) {
    if (persona.image_url) {
        return `<img src="${persona.image_url}" class="persona-avatar" alt="${persona.nombre}" />`;
    }
    const initial = (persona.nombre || '?')[0].toUpperCase();
    const colors = ['#ff6b6b', '#ffa94d', '#69db7c', '#74c0fc', '#b197fc'];
    const color = colors[initial.charCodeAt(0) % colors.length];
    return `<div class="persona-avatar" style="background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.75rem; color:#fff; font-weight:bold;">${initial}</div>`;
}

/**
 * Render personas data into the table body
 */
function renderPersonasTable(tbody, personas) {
    if (personas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#555; text-align:center; padding:20px;">No hay personas registradas</td></tr>';
        return;
    }

    tbody.innerHTML = personas.map(p => `
        <tr data-id="${p.id}" class="clickable-row">
            <td>${getAvatarHTML(p)}</td>
            <td>${p.nombre || 'Desconocido'}</td>
            <td style="color:#888">Biométrico</td>
            <td style="color:#888">${p.contexto || 'Desconocido'}</td>
            <td><span class="view-all-arrow">›</span></td>
        </tr>
    `).join('');
}
