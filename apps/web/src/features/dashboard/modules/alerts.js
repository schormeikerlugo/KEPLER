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
 * Fetch top priority alerts for the user:
 * 1. POIs that need verification (categoria = 'anomalia' or missing description)
 * 2. High Threat Personas (contexto contains 'peligro' or 'hostil')
 */
async function fetchAlertCounts(userId) {
    const alerts = [];

    // SVG icon paths
    const iconPOIs = new URL('../../../assets/icons/POIs.svg', import.meta.url).href;
    const iconObjetos = new URL('../../../assets/icons/Objetos.svg', import.meta.url).href;

    // 1. POIs that might need verification
    try {
        const { data: poiData, error: poiErr } = await supabase
            .from('puntos_interes')
            .select('id, nombre, nivel_riesgo')
            .eq('user_id', userId)
            .or('descripcion.is.null,nivel_riesgo.in.(alto,critico,peligro)')
            .order('created_at', { ascending: false })
            .limit(2);

        if (poiErr) console.warn('[Alerts] POI fetch error:', poiErr.message);

        if (poiData && poiData.length > 0) {
            alerts.push({
                id: 'group_poi',
                table: 'puntos_interes',
                title: 'Detalle de POI',
                icon: `<img src="${iconPOIs}" alt="POIs" class="alert-svg-icon"/>`,
                text: `<strong>${poiData.length} POIs</strong> Faltan por Verificar`,
                borderColor: '#ffb400',
                items: poiData
            });
        }
    } catch (e) {
        console.error('[Alerts] Failed to fetch POIs:', e);
    }

    // 2. High Threat Personas
    try {
        const { data: personaData, error: personaErr } = await supabase
            .from('personas_encontradas')
            .select('id, nombre, contexto')
            .eq('user_id', userId)
            .or('contexto.ilike.%peligro%,contexto.ilike.%hostil%,contexto.ilike.%amenaza%')
            .order('created_at', { ascending: false })
            .limit(2);

        if (personaErr) console.warn('[Alerts] Persona fetch error:', personaErr.message);

        if (personaData && personaData.length > 0) {
            alerts.push({
                id: 'group_persona',
                table: 'personas_encontradas',
                title: 'Detalle de Persona',
                icon: `<img src="${iconObjetos}" alt="Persona" class="alert-svg-icon" style="filter: hue-rotate(150deg);"/>`,
                text: `<strong>${personaData.length} Personas</strong> Nivel Hostil`,
                borderColor: '#ff4444',
                items: personaData
            });
        }
    } catch (e) {
        console.error('[Alerts] Failed to fetch Personas:', e);
    }

    return alerts;
}

    // 3. Missions completed but lacking documentation
    try {
        const { data: missionData, error: missErr } = await supabase
            .from('misiones')
            .select('id, nombre:codigo, estado') // Alias codigo a nombre para el modal
            .eq('user_id', userId)
            .eq('estado', 'completada')
            .or('descripcion_ia.is.null,descripcion_ia.eq.')
            .order('created_at', { ascending: false });

        if (missErr) console.warn('[Alerts] Mission fetch error:', missErr.message);

        if (missionData && missionData.length > 0) {
            const iconMisiones = new URL('../../../assets/icons/Misiones.svg', import.meta.url).href;
            alerts.push({
                id: 'group_mision',
                table: 'misiones',
                title: 'Resumen de Misión',
                icon: `<img src="${iconMisiones}" alt="Misiones" class="alert-svg-icon"/>`,
                text: `<strong>${missionData.length} Misiones</strong> sin documentar`,
                borderColor: '#3FA8FF',
                items: missionData
            });
        }
    } catch (e) {
        console.error('[Alerts] Failed to fetch Missions:', e);
    }

    // 4. Objects the AI couldn't identify (very low confidence)
    try {
        const { data: objData, error: objErr } = await supabase
            .from('objetos_exploracion')
            .select('id, nombre, confianza')
            .eq('user_id', userId)
            .lt('confianza', 0.5)
            .order('created_at', { ascending: false })
            .limit(5);

        if (objErr) console.warn('[Alerts] Objects fetch error:', objErr.message);

        if (objData && objData.length > 0) {
            alerts.push({
                id: 'group_objetos',
                table: 'objetos_exploracion',
                title: 'Detalle de Objeto',
                icon: `<img src="${iconObjetos}" alt="Objetos" class="alert-svg-icon"/>`,
                text: `<strong>${objData.length} Objetos</strong> No Reconocidos`,
                borderColor: '#ff3c3c',
                items: objData
            });
        }
    } catch (e) {
        console.error('[Alerts] Failed to fetch Objects:', e);
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

    container.innerHTML = alerts.map((alert, index) => `
        <div class="alert-item actionable-alert" data-index="${index}" style="border-left-color: ${alert.borderColor}; cursor: pointer;">
            <div class="alert-item-left">
                <span class="alert-item-icon">${alert.icon}</span>
                <span class="alert-item-text">${alert.text}</span>
            </div>
            <span class="alert-item-arrow">›</span>
        </div>
    `).join('');

    // Bind click events to open the Sub-List Modal
    container.querySelectorAll('.actionable-alert').forEach(item => {
        item.addEventListener('click', () => {
            const alertObj = alerts[parseInt(item.dataset.index)];
            if (window.kepler && window.kepler.openAlertsListModal) {
                window.kepler.openAlertsListModal(alertObj.title, alertObj.items, alertObj.table);
            }
        });
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.05)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    });
}

/**
 * Creates and opens an intermediary List Modal to select specific actionable items 
 * belonging to a grouping (Phase 9)
 */
window.kepler = window.kepler || {};
window.kepler.openAlertsListModal = function(title, items, table) {
    let modal = document.getElementById('alerts-list-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'alerts-list-modal';
        modal.className = 'detail-modal-overlay active';
        document.body.appendChild(modal);
    } else {
        modal.classList.add('active');
    }

    modal.innerHTML = `
        <div class="detail-modal-content mission-modal" style="max-width: 450px; padding: 25px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(63, 168, 255, 0.2); padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin:0; font-family: var(--font-jura); font-size: 1.2rem; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); letter-spacing: 1px;">SELECCIONAR REGISTRO: ${title.toUpperCase()}</h2>
                <button id="close-alerts-list" style="background:transparent; border:none; color:#3FA8FF; font-size:1.8rem; cursor:pointer;" title="Cerrar">&times;</button>
            </div>
            <div class="alerts-sublist" style="display: flex; flex-direction: column; gap: 12px; max-height: 400px; overflow-y: auto; padding-right: 5px;">
                ${items.map(item => `
                    <div class="actionable-subitem" data-id="${item.id}" data-table="${table}" data-title="${title}" style="padding: 15px; border: 1px solid rgba(63, 168, 255, 0.2); border-radius: 8px; background: rgba(0,0,0,0.6); cursor:pointer; color: #fff; transition: background 0.2s, box-shadow 0.2s; box-shadow: 0 0 5px rgba(63, 168, 255, 0.05) inset; display:flex; justify-content:space-between; align-items:center;">
                        <strong style="font-family: var(--font-jura); font-size: 1.1rem;">${item.nombre || 'Desconocido'}</strong>
                        <span style="color:#3FA8FF; font-size:1.2rem;">›</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.getElementById('close-alerts-list').onclick = () => {
        modal.classList.remove('active');
    };

    modal.querySelectorAll('.actionable-subitem').forEach(el => {
        el.addEventListener('mouseenter', () => {
            el.style.background = 'rgba(63, 168, 255, 0.1)';
            el.style.boxShadow = '0 0 10px rgba(63, 168, 255, 0.2) inset';
        });
        el.addEventListener('mouseleave', () => {
            el.style.background = 'rgba(0,0,0,0.6)';
            el.style.boxShadow = '0 0 5px rgba(63, 168, 255, 0.05) inset';
        });
        el.addEventListener('click', () => {
            modal.classList.remove('active');
            if (window.kepler.openDetailModal) {
                window.kepler.openDetailModal(el.dataset.id, el.dataset.table, el.dataset.title);
            }
        });
    });
}
