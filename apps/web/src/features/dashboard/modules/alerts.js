/**
 * alerts.js
 * Dashboard Alerts Section
 * Shows pending actions requiring user attention
 * 
 * Uses actual DB columns:
 *   misiones: estado, descripcion_ia
 *   objetos_exploracion: confianza
 */
import { supabase } from '../../../js/auth.js';
import { auth } from '../../../js/auth.js';

/**
 * Initialize the alerts section by fetching counts and rendering items
 */
export async function initAlerts() {
    const container = document.getElementById('alerts-list');
    if (!container) return;

    const user = await auth.getUser();
    if (!user) return;

    const alerts = await fetchAlertCounts(user.id);
    renderAlerts(container, alerts);
}

/**
 * Fetch counts for each alert type from Supabase
 */
async function fetchAlertCounts(userId) {
    const alerts = [];

    // SVG icon paths (copied to src/assets/icons/)
    const iconMisiones = new URL('../../../assets/icons/Misiones.svg', import.meta.url).href;
    const iconPOIs = new URL('../../../assets/icons/POIs.svg', import.meta.url).href;
    const iconObjetos = new URL('../../../assets/icons/Objetos.svg', import.meta.url).href;

    // 1. Missions completed but lacking documentation
    const undocMissions = await countUndocumentedMissions(userId);
    if (undocMissions > 0) {
        alerts.push({
            icon: `<img src="${iconMisiones}" alt="Misiones" class="alert-svg-icon"/>`,
            text: `<strong>${undocMissions} Misiones</strong> necesitan ser documentadas`,
            borderColor: '#3FA8FF'
        });
    }

    // 2. POIs requiring attention (medium confidence)
    const lowConfPOIs = await countLowConfidencePOIs(userId);
    if (lowConfPOIs > 0) {
        alerts.push({
            icon: `<img src="${iconPOIs}" alt="POIs" class="alert-svg-icon"/>`,
            text: `<strong>${lowConfPOIs} POIs</strong> Requieren de tu atención`,
            borderColor: '#ffb400'
        });
    }

    // 3. Objects the AI couldn't identify (very low confidence)
    const unidentified = await countUnidentifiedObjects(userId);
    if (unidentified > 0) {
        alerts.push({
            icon: `<img src="${iconObjetos}" alt="Objetos" class="alert-svg-icon"/>`,
            text: `<strong>${unidentified} Objetos</strong> Necesitan ser reconocidos, la IA no pudo identificarlos`,
            borderColor: '#ff3c3c'
        });
    }

    return alerts;
}

/**
 * Count missions with estado='completada' that have no descripcion_ia
 */
async function countUndocumentedMissions(userId) {
    const { count, error } = await supabase
        .from('misiones')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('estado', 'completada')
        .or('descripcion_ia.is.null,descripcion_ia.eq.');

    if (error) { console.error('[Alerts] Missions query error:', error); return 0; }
    return count || 0;
}

/**
 * Count objetos_exploracion with confianza between 0.5 and 0.8
 */
async function countLowConfidencePOIs(userId) {
    const { count, error } = await supabase
        .from('objetos_exploracion')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('confianza', 0.8)
        .gt('confianza', 0.5);

    if (error) { console.error('[Alerts] POIs query error:', error); return 0; }
    return count || 0;
}

/**
 * Count objetos_exploracion where confianza < 0.5
 */
async function countUnidentifiedObjects(userId) {
    const { count, error } = await supabase
        .from('objetos_exploracion')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('confianza', 0.5);

    if (error) { console.error('[Alerts] Objects query error:', error); return 0; }
    return count || 0;
}

/**
 * Render alert items into the DOM
 */
function renderAlerts(container, alerts) {
    if (alerts.length === 0) {
        container.innerHTML = '<p style="color:#555; font-size:0.85rem; padding:10px;">✅ No hay alertas pendientes</p>';
        const section = document.getElementById('alerts-section');
        if (section) section.style.display = 'none';
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="alert-item" style="border-left-color: ${alert.borderColor}">
            <div class="alert-item-left">
                <span class="alert-item-icon">${alert.icon}</span>
                <span class="alert-item-text">${alert.text}</span>
            </div>
            <span class="alert-item-arrow">›</span>
        </div>
    `).join('');
}
