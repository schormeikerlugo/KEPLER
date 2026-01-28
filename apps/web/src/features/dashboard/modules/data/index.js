/**
 * Dashboard Data Module
 * Handles loading and displaying dashboard statistics and lists
 */

import { api } from '../../../../js/services/api.js';

export async function loadDashboardData() {
    const stats = await api.getDashboardStats();

    // Update Counts
    const updateCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    if (stats.counts) {
        updateCount('pois-count', stats.counts.pois);
        updateCount('minerals-count', stats.counts.minerals);
        updateCount('missions-count', stats.counts.missions);
        updateCount('objects-count', stats.counts.objects);
    }

    // Populate Lists Helper
    const populateList = (listId, items, formatter) => {
        const container = document.getElementById(listId);
        if (!container) return;
        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<div class="empty-state">No data available</div>';
            return;
        }

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'data-item';
            el.innerHTML = formatter(item);
            container.appendChild(el);
        });
    };

    // Populate all lists
    if (stats.recent) {
        populateList('pois-list', stats.recent.pois, (item) => `
            <div class="item-icon">📍</div>
            <div class="item-info">
                <span class="item-name">${item.nombre || item.name || 'Sin Nombre'}</span>
                <span class="item-sub">${item.tipo || item.type || 'POI'}</span>
            </div>
        `);

        populateList('minerals-list', stats.recent.minerals, (item) => `
            <div class="item-icon">💎</div>
            <div class="item-info">
                <span class="item-name">${item.nombre || item.name || 'Sin Nombre'}</span>
                <span class="item-sub">${item.chemical_formula || 'Unknown'}</span>
            </div>
        `);

        populateList('missions-list', stats.recent.missions, (item) => `
             <div class="item-icon">🚀</div>
             <div class="item-info">
                 <span class="item-name">${item.titulo || item.title || 'Misión'}</span>
                 <span class="item-sub status-${item.estado || item.status || 'unknown'}">${(item.estado || item.status || 'unknown').toUpperCase()}</span>
             </div>
        `);

        populateList('objects-list', stats.recent.objects, (item) => `
             <div class="item-icon">📦</div>
             <div class="item-info">
                 <span class="item-name">${item.nombre || item.name || 'Objeto'}</span>
                 <span class="item-sub">${item.tipo || item.type || 'Desconocido'}</span>
             </div>
        `);
    }
}
