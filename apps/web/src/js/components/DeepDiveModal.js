/**
 * DeepDiveModal - AI-powered notification analysis
 * On-demand deep-dive into any notification using Mistral via the chat endpoint.
 * Responses are cached in-memory for the session.
 */

import { api } from '../services/api.js';

class DeepDiveModal {
    constructor() {
        this.cache = new Map();
        this.overlay = null;
        this.modal = null;
        this.currentNotification = null;
        this.inject();
    }

    inject() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'deep-dive-overlay';
        this.overlay.innerHTML = `
            <div class="deep-dive-modal">
                <div class="deep-dive-header">
                    <div class="deep-dive-type">
                        <span class="deep-dive-icon"></span>
                        <span class="deep-dive-type-label"></span>
                    </div>
                    <div class="deep-dive-meta">
                        <span class="deep-dive-time"></span>
                    </div>
                    <button class="deep-dive-close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="deep-dive-message"></div>
                <div class="deep-dive-body">
                    <div class="deep-dive-skeleton">
                        <div class="skeleton-block"></div>
                        <div class="skeleton-block"></div>
                        <div class="skeleton-block"></div>
                    </div>
                </div>
                <div class="deep-dive-footer">
                    <button class="deep-dive-reanalyze">Regenerar Analisis</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        // Bind events
        this.overlay.querySelector('.deep-dive-close').onclick = () => this.close();
        this.overlay.querySelector('.deep-dive-reanalyze').onclick = () => this.reanalyze();
        this.overlay.onclick = (e) => {
            if (e.target === this.overlay) this.close();
        };
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('open')) this.close();
        });
    }

    /**
     * Open the deep-dive modal for a notification
     * @param {Object} notification - { id, message, type, timestamp, context }
     */
    async show(notification) {
        if (!notification) return;
        this.currentNotification = notification;

        // Populate header
        const typeLabels = { critical: 'ALERTA CRITICA', warning: 'ADVERTENCIA', success: 'EXITO', info: 'INFORMACION' };
        const typeIcons = { critical: '🚨', warning: '⚠️', success: '✅', info: 'ℹ️' };

        this.modal = this.overlay.querySelector('.deep-dive-modal');
        this.modal.dataset.type = notification.type;

        this.overlay.querySelector('.deep-dive-icon').textContent = typeIcons[notification.type] || '🔹';
        this.overlay.querySelector('.deep-dive-type-label').textContent = typeLabels[notification.type] || notification.type.toUpperCase();
        this.overlay.querySelector('.deep-dive-time').textContent = new Date(notification.timestamp).toLocaleString('es-ES');
        this.overlay.querySelector('.deep-dive-message').textContent = notification.message;

        const body = this.overlay.querySelector('.deep-dive-body');
        const footer = this.overlay.querySelector('.deep-dive-footer');

        // Show modal
        this.overlay.classList.add('open');

        // Check cache
        if (this.cache.has(notification.id)) {
            body.innerHTML = this.renderAnalysis(this.cache.get(notification.id));
            footer.style.display = 'flex';
            return;
        }

        // If notification has error logs, show them immediately (no AI needed)
        const ctx = notification.context || {};
        const hasErrorLogs = ctx.errorLogs?.length > 0;

        if (hasErrorLogs) {
            const logLines = ctx.errorLogs.map(line => {
                if (/error|failed|exception/i.test(line)) return `<span class="log-error">${line}</span>`;
                if (/warning|timeout/i.test(line)) return `<span class="log-warn">${line}</span>`;
                return `<span class="log-info">${line}</span>`;
            }).join('\n');

            body.innerHTML = `
                <div class="deep-dive-section cause">
                    <div class="deep-dive-section-title">Log del Backend</div>
                    <pre class="deep-dive-terminal">${logLines}</pre>
                </div>
                <div class="deep-dive-section info">
                    <div class="deep-dive-section-title">Datos del Batch</div>
                    <div class="deep-dive-section-body">
                        <strong>Procesadas:</strong> ${ctx.processed ?? 0}<br>
                        <strong>Errores:</strong> ${ctx.failed ?? 0}<br>
                        <strong>En cola:</strong> ${ctx.remaining ?? 0}<br>
                        <strong>Re-IDs:</strong> ${ctx.reIds ?? 0}
                    </div>
                </div>
                <div class="deep-dive-loading-text">Consultando a Mistral para diagnostico...</div>
            `;
            footer.style.display = 'flex';

            // Still ask AI for diagnosis in background
            try {
                const prompt = this.buildPrompt(notification);
                const result = await api.analyze(prompt.message, prompt.context);
                if (result?.response) {
                    this.cache.set(notification.id, result.response);
                    // Prepend the terminal log, then AI analysis
                    body.innerHTML = `
                        <div class="deep-dive-section cause">
                            <div class="deep-dive-section-title">Log del Backend</div>
                            <pre class="deep-dive-terminal">${logLines}</pre>
                        </div>
                        ${this.renderAnalysis(result.response)}
                    `;
                }
            } catch (_) { /* AI optional for error display */ }
            return;
        }

        // Normal flow: skeleton → AI analysis
        body.innerHTML = `
            <div class="deep-dive-skeleton">
                <div class="skeleton-block"></div>
                <div class="skeleton-block"></div>
                <div class="skeleton-block"></div>
            </div>
            <div class="deep-dive-loading-text">Consultando a Mistral...</div>
        `;
        footer.style.display = 'none';

        try {
            const prompt = this.buildPrompt(notification);
            const result = await api.analyze(prompt.message, prompt.context);

            if (result?.response && result?.success !== false) {
                this.cache.set(notification.id, result.response);
                body.innerHTML = this.renderAnalysis(result.response);
            } else {
                body.innerHTML = `<div class="deep-dive-error">No se pudo obtener respuesta de la IA. Verifica que Ollama esta activo.</div>`;
            }
        } catch (err) {
            console.error('[DeepDive] AI analysis failed:', err);
            body.innerHTML = `<div class="deep-dive-error">Error de conexion con el modulo de IA: ${err.message}</div>`;
        }

        footer.style.display = 'flex';
    }

    /**
     * Build a specialized prompt based on the notification source/event type.
     * Each notification nature gets a different analysis structure from Mistral.
     */
    /**
     * Detect notification category from message text (for notifications without context)
     */
    _detectCategory(message) {
        const msg = message.toLowerCase();
        if (/misi[oó]n completada|completada:/i.test(msg)) return 'mission_completed';
        if (/misi[oó]n detectada|nueva misi|código:/i.test(msg)) return 'mission_new';
        if (/misi[oó]n activada/i.test(msg)) return 'mission_activated';
        if (/misi[oó]n eliminada/i.test(msg)) return 'mission_deleted';
        if (/ruta.*guardada|ruta.*registrada/i.test(msg)) return 'route_saved';
        if (/ruta.*eliminada/i.test(msg)) return 'route_deleted';
        if (/ruta.*cargada|edici[oó]n/i.test(msg)) return 'route_loaded';
        if (/guardado localmente|pendiente.*sincronizaci/i.test(msg)) return 'object_queued';
        if (/registrado correctamente|objeto.*registrado/i.test(msg)) return 'object_created';
        if (/captura.*procesada|en cola/i.test(msg)) return 'capture_queue';
        if (/sincronizando|sincronizaci[oó]n/i.test(msg)) return 'sync_progress';
        if (/sin conexi[oó]n|offline|📴/i.test(msg)) return 'offline';
        if (/conexi[oó]n restaurada|online|📶/i.test(msg)) return 'online';
        if (/pendiente.*sincronizaci|objeto.*pendiente/i.test(msg)) return 'sync_pending';
        if (/error.*sincronizar|error.*sync/i.test(msg)) return 'sync_error';
        if (/sistemas operativos|backend.*✅|sistema/i.test(msg)) return 'health_ok';
        if (/no responden|backend.*❌|caido/i.test(msg)) return 'health_error';
        if (/guardados|cambios guardados/i.test(msg)) return 'record_saved';
        if (/eliminado|registro eliminado/i.test(msg)) return 'record_deleted';
        if (/error.*guardar|error.*eliminar/i.test(msg)) return 'record_error';
        return 'generic';
    }

    buildPrompt(notification) {
        const ctx = notification.context || {};
        const timeStr = new Date(notification.timestamp).toLocaleString('es-ES');
        const source = ctx.source || 'unknown';
        const event = ctx.event || '';
        const msg = notification.message;

        // Detect category: use context if available, otherwise parse message text
        let category;
        if (source === 'realtime' && event === 'COMPLETED') category = 'mission_completed';
        else if (source === 'realtime' && event === 'INSERT') category = 'mission_new';
        else if (source === 'realtime' && event === 'ACTIVATED') category = 'mission_activated';
        else if (source === 'realtime' && event === 'DELETE') category = 'mission_deleted';
        else if (source === 'routes' && ctx.action === 'create') category = 'route_saved';
        else if (source === 'routes' && ctx.action === 'delete') category = 'route_deleted';
        else if (source === 'routes' && ctx.action === 'load') category = 'route_loaded';
        else if (source === 'routes') category = 'route_error';
        else if (source === 'capture_queue') category = 'capture_queue';
        else if (source === 'sync' && ctx.action === 'create') category = 'object_created';
        else if (source === 'sync' && ctx.action === 'queued') category = 'object_queued';
        else if (source === 'sync' && ctx.action === 'sync_result') category = 'sync_result';
        else if (source === 'sync') category = 'sync_generic';
        else if (source === 'system_health') category = notification.type === 'success' ? 'health_ok' : 'health_error';
        else if (source === 'detail_modal') category = ctx.error ? 'record_error' : 'record_saved';
        else category = this._detectCategory(msg);

        const sys = `Eres KEPLER-AI, el sistema de inteligencia integrado en la plataforma de exploracion KEPLER. Respondes EN ESPAÑOL usando markdown. Adapta tu tono al tipo de evento: celebra logros, advierte riesgos, diagnostica errores con precision.`;

        const prompts = {
            // ═══ MISIONES ═══
            mission_completed: () => {
                const s = ctx.stats || {};
                const m = ctx.mission || {};
                return `La mision ${m.codigo || '(ver mensaje)'} ha finalizado. Genera un INFORME POST-MISION:

## Informe de Mision
Codigo: ${m.codigo || 'extraer del mensaje'}, Zona: ${m.zona || 'extraer del mensaje'}, Explorador: ${ctx.user || 'extraer del mensaje'}.
Resume la expedicion en 2-3 lineas.

## Metricas de Rendimiento
| Metrica | Valor |
|---------|-------|
| Duracion | ${s.duration || 'N/A'} |
| Objetos detectados | ${s.totalObjects ?? 'N/A'} |
| Capturas manuales | ${s.manualObjects ?? 'N/A'} |
| Puntos de asentamiento | ${s.checkpoints ?? 'N/A'} |

Evalua: fue productiva? El ratio deteccion/tiempo fue bueno?

## Plan para Siguiente Expedicion
Basandote en los resultados, sugiere: que equipamiento llevar, que zonas priorizar, y si conviene repetir la misma ruta o explorar adyacentes.

MENSAJE ORIGINAL: "${msg}"
HORA: ${timeStr}`;
            },

            mission_new: () => {
                const m = ctx.mission || {};
                return `Se detecto una nueva mision en el sistema. Genera un BRIEFING DE DESPLIEGUE:

## Alerta de Despliegue
Nueva mision ${m.codigo || '(ver mensaje)'} en zona "${m.zona || '(ver mensaje)'}". Explorador: ${ctx.user || '(ver mensaje)'}.

## Perfil de Zona
Basandote en "${m.zona || msg}", describe el tipo de terreno probable, condiciones climaticas tipicas, y fauna/flora esperada.

## Checklist Pre-Mision
Lista 4-5 items de verificacion antes de comenzar la exploracion (equipo, bateria, conexion, calibracion GPS, ruta planificada).

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            mission_activated: () => {
                const m = ctx.mission || {};
                return `Una mision ha sido activada. Genera un REPORTE DE ACTIVACION:

## Mision en Curso
${m.codigo || '(ver mensaje)'} ahora esta activa en zona "${m.zona || '(ver mensaje)'}".

## Estado Operativo
Confirma que los sistemas necesarios estan listos: deteccion visual (YOLOv26), GPS tracking, sincronizacion de datos, y telemetria.

## Protocolo de Campo
Recuerda al explorador: mantener el GPS activo, realizar capturas cada X metros, y reportar anomalias inmediatamente.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            mission_deleted: () => {
                const m = ctx.mission || {};
                return `Una mision fue eliminada del registro. Genera un REPORTE DE ELIMINACION:

## Registro Eliminado
Mision ${m.codigo || '(ver mensaje)'} eliminada por ${ctx.user || '(ver mensaje)'}.

## Datos Afectados
Detalla que datos podrian haberse perdido: objetos detectados, personas encontradas, rutas de exploracion, trail GPS, y telemetria asociada.

## Protocolo de Verificacion
- Verificar si los objetos de la mision siguen en la base de datos
- Comprobar si hay rutas huerfanas
- Revisar si la eliminacion fue intencional

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            // ═══ RUTAS ═══
            route_saved: () => {
                const r = ctx.route || {};
                return `Se registro una nueva ruta planificada. Genera un ANALISIS DE RUTA:

## Ruta Planificada
"${r.nombre || '(ver mensaje)'}" — ${r.waypoints ?? '?'} waypoints, ${r.distancia || '?'} km, terreno: ${r.tipo_terreno || '?'}, seguridad: ${r.seguridad || '?'}.

## Evaluacion Tactica
Analiza la ruta segun su terreno y distancia. Evalua dificultad, tiempo estimado de recorrido, y puntos criticos donde el explorador deberia tener precaucion.

## Equipamiento Sugerido
Lista el equipamiento recomendado para este tipo de terreno y distancia.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            route_deleted: () => {
                const r = ctx.route || {};
                return `Se elimino una ruta planificada. Genera un AVISO:

## Ruta Eliminada
"${r.nombre || '(ver mensaje)'}" fue removida del sistema.

## Misiones Vinculadas
Verifica si alguna mision tenia esta ruta asignada y que impacto tiene su eliminacion en expediciones futuras planificadas.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            route_loaded: () => {
                const r = ctx.route || {};
                return `Se cargo una ruta para edicion. Genera SUGERENCIAS:

## Ruta en Edicion
"${r.nombre || '(ver mensaje)'}" con ${r.waypoints ?? '?'} waypoints.

## Optimizaciones Posibles
Sugiere mejoras: agregar waypoints intermedios en zonas de riesgo, verificar que la distancia entre puntos sea uniforme, y asegurar cobertura GPS en todo el trayecto.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            route_error: () => {
                return `Hubo un error con una ruta. Genera un DIAGNOSTICO:

## Error en Ruta
Operacion: ${ctx.action || '?'}, Error: "${ctx.error || '(ver mensaje)'}".

## Causa y Solucion
Analiza la causa probable y lista pasos para resolverlo.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            // ═══ OBJETOS / SYNC ═══
            object_created: () => {
                const obj = ctx.object || {};
                return `Un objeto fue registrado en la base de datos. Genera una FICHA DE REGISTRO:

## Objeto Registrado
"${obj.nombre || '(ver mensaje)'}" — Tipo: ${obj.tipo || '(ver mensaje)'}. Sincronizado correctamente con el servidor.

## Clasificacion
Sugiere en que categoria taxonomica podria clasificarse este objeto y que etiquetas serian apropiadas.

## Proximos Pasos
Sugiere: revisar la clasificacion en el modulo de taxonomia, agregar notas de campo, y verificar si hay objetos similares en la base de datos.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            object_queued: () => {
                const obj = ctx.object || {};
                return `Un objeto quedo pendiente de sincronizacion. Genera un REPORTE DE COLA:

## Objeto Pendiente
"${obj.nombre || '(ver mensaje)'}" (${obj.tipo || '?'}) esta guardado localmente y espera sincronizacion.

## Estado de la Cola
${ctx.pendingCount ? `Hay ${ctx.pendingCount} objetos en cola total.` : 'Ver mensaje para detalles.'}
Conexion: ${ctx.isOnline !== undefined ? (ctx.isOnline ? 'Online (sync fallo)' : 'Offline') : 'Desconocida'}.

## Prioridad de Accion
${ctx.isOnline ? '⚠️ El sistema esta online pero el sync fallo. Verificar: conexion al backend, validez de los datos, espacio en la base de datos.' : '📴 Sin conexion. No cerrar la aplicacion. Los datos se sincronizaran automaticamente al restaurar conexion.'}

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            capture_queue: () => {
                const errorLogs = ctx.errorLogs?.length ? ctx.errorLogs.join('\n') : '';
                if (errorLogs || ctx.failed > 0) {
                    return `Hubo errores al procesar capturas. Genera un DIAGNOSTICO TECNICO:

## Estado del Procesamiento
- Procesadas exitosamente: ${ctx.processed ?? 0}
- Con error: ${ctx.failed ?? 0}
- Pendientes: ${ctx.remaining ?? 0}

## Log de Errores
\`\`\`
${errorLogs || 'Sin detalles de error disponibles'}
\`\`\`

## Diagnostico
Analiza cada error del log. Posibles causas:
- "DB not available": Supabase no esta corriendo o las credenciales son invalidas
- "Embedding error": El modelo CLIP no cargo (verificar GPU/CUDA)
- "HTTP 422": Datos invalidos en el request (campo faltante o tipo incorrecto)
- "HTTP 500": Error interno del backend (revisar logs de uvicorn)
- "network": El backend no esta accesible (verificar que el servidor esta corriendo)

## Como Resolverlo
Lista pasos concretos para cada error encontrado.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
                }

                return `Se procesaron capturas de la cola. Genera un REPORTE DE PROCESAMIENTO:

## Capturas Procesadas
Resume cuantas capturas se procesaron exitosamente del total en cola.

## Re-Identificaciones
Si alguna captura coincidio con un registro existente (Re-ID), detalla que entidades fueron reconocidas.

## Estado de la Cola
${ctx.remaining ? `Quedan ${ctx.remaining} capturas pendientes.` : 'Cola vacia. Todas las capturas procesadas.'}

DATOS:
- Procesadas: ${ctx.processed ?? '?'}
- Errores: ${ctx.failed ?? 0}
- Pendientes: ${ctx.remaining ?? 0}
- Hora: ${timeStr}
- Mensaje: "${msg}"`;
            },

            sync_result: () => {
                const failedItems = ctx.failedItems?.join(', ') || '';
                return `Ciclo de sincronizacion completado. Genera un REPORTE:

## Resultados
| Estado | Cantidad |
|--------|----------|
| Sincronizados | ${ctx.synced ?? '?'} |
| Fallidos | ${ctx.failed ?? '?'} |
| Pendientes | ${ctx.remaining ?? '?'} |

${failedItems ? `Objetos con error: ${failedItems}` : 'Sin errores.'}

## ${ctx.failed > 0 ? 'Diagnostico de Fallos' : 'Estado'}
${ctx.failed > 0 ? 'Analiza por que fallaron estos objetos y como reintentar.' : 'Todo sincronizado correctamente. Sistema saludable.'}

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            sync_generic: () => {
                const items = ctx.pendingItems?.join(', ') || '';
                return `Evento de sincronizacion detectado. Genera un ESTADO:

## Conectividad
${ctx.isOnline !== undefined ? (ctx.isOnline ? '🟢 Online' : '🔴 Offline') : 'Ver mensaje'}. Pendientes: ${ctx.pendingCount ?? '?'}.
${items ? `En cola: ${items}` : ''}

## Riesgo
Evalua el riesgo de perdida de datos segun la cantidad pendiente y el estado de conexion.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            // ═══ SISTEMA ═══
            health_ok: () => {
                const svc = ctx.services || {};
                return `Chequeo de salud del sistema. Genera un REPORTE DE ESTADO:

## Servicios Operativos
| Servicio | Estado |
|----------|--------|
| Backend FastAPI | ${svc.backend ? '🟢 Activo' : '(ver mensaje)'} |
| Base de Datos | ${svc.database ? '🟢 Activa' : '(ver mensaje)'} |
| Motor IA | ${svc.ai ? '🟢 Activo' : '(ver mensaje)'} |

## Rendimiento
Confirma que todos los servicios estan operativos y el sistema esta listo para explorar.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            health_error: () => {
                const svc = ctx.services || {};
                return `Servicios del sistema con problemas. Genera un DIAGNOSTICO:

## Servicios Afectados
| Servicio | Estado |
|----------|--------|
| Backend FastAPI | ${svc.backend === false ? '🔴 Caido' : svc.backend === true ? '🟢 OK' : '(ver mensaje)'} |
| Base de Datos | ${svc.database === false ? '🔴 Caida' : svc.database === true ? '🟢 OK' : '(ver mensaje)'} |
| Motor IA | ${svc.ai === false ? '🔴 Caido' : svc.ai === true ? '🟢 OK' : '(ver mensaje)'} |

## Diagnostico
Para cada servicio caido, explica la causa probable y el comando o accion para restaurarlo.

## Impacto Operativo
Explica que funcionalidades de KEPLER estan afectadas por cada servicio caido.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            // ═══ REGISTROS (detail modal) ═══
            record_saved: () => {
                return `Registro actualizado exitosamente. Genera una CONFIRMACION:

## Operacion Exitosa
${ctx.action === 'delete' ? 'Registro eliminado' : 'Cambios guardados'} en tabla "${ctx.table || '(ver mensaje)'}"${ctx.recordId ? `, ID: ${ctx.recordId}` : ''}.

## Verificacion
Confirma que los cambios se reflejan en el dashboard y sugiere verificaciones opcionales.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            record_deleted: () => {
                return `Registro eliminado del sistema. Genera un AVISO:

## Eliminacion Confirmada
Registro removido de "${ctx.table || '(ver mensaje)'}"${ctx.recordId ? `, ID: ${ctx.recordId}` : ''}.

## Datos Relacionados
Indica si la eliminacion podria afectar otros registros vinculados (misiones, rutas, estadisticas).

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            record_error: () => {
                return `Error al operar sobre un registro. Genera un DIAGNOSTICO:

## Error en Base de Datos
Operacion "${ctx.action || '?'}" fallo en tabla "${ctx.table || '?'}". Error: "${ctx.error || '(ver mensaje)'}".

## Causa Probable
Analiza: permisos RLS de Supabase, registro inexistente, campo invalido, o problema de conexion.

## Solucion
Lista pasos concretos para resolver el error y reintentar la operacion.

MENSAJE: "${msg}"
HORA: ${timeStr}`;
            },

            // ═══ FALLBACK ═══
            generic: () => {
                return `Analiza esta notificacion del sistema KEPLER:

## Evento
Describe que sucedio basandote en el mensaje.

## Contexto
Explica por que este evento es relevante para el explorador.

NOTIFICACION:
- Tipo: ${notification.type}
- Mensaje: "${msg}"
- Hora: ${timeStr}`;
            }
        };

        const builder = prompts[category] || prompts.generic;
        return { context: sys, message: builder() };
    }

    /**
     * Render the AI response into styled sections.
     * Detects section titles and assigns semantic CSS classes.
     */
    renderAnalysis(rawText) {
        const sections = rawText.split(/^##\s+/m).filter(Boolean);

        if (sections.length < 2) {
            return `<div class="deep-dive-section"><div class="deep-dive-section-body">${this.markdownToHtml(rawText)}</div></div>`;
        }

        return sections.map(section => {
            const lines = section.trim().split('\n');
            const title = lines[0].trim();
            const body = lines.slice(1).join('\n').trim();

            // Assign semantic class based on section content
            let sectionClass = 'info';
            if (/resumen|briefing|evento|registrad|ocurri|estado/i.test(title)) sectionClass = 'event';
            else if (/resultado|diagnostico|causa|analisis|impacto|implicacion|terreno|conectividad/i.test(title)) sectionClass = 'cause';
            else if (/recomend|accion|resolver|protocolo|recuper|siguiente|proxima/i.test(title)) sectionClass = 'action';

            return `
                <div class="deep-dive-section ${sectionClass}">
                    <div class="deep-dive-section-title">${title}</div>
                    <div class="deep-dive-section-body">${this.markdownToHtml(body)}</div>
                </div>
            `;
        }).join('');
    }

    markdownToHtml(text) {
        // Handle code blocks (terminal style)
        text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (match, code) => {
            const lines = code.trim().split('\n').map(line => {
                // Color errors red, warnings yellow
                if (/error|failed|exception|traceback/i.test(line)) {
                    return `<span class="log-error">${line}</span>`;
                } else if (/warning|warn|timeout|retry/i.test(line)) {
                    return `<span class="log-warn">${line}</span>`;
                }
                return `<span class="log-info">${line}</span>`;
            }).join('\n');
            return `<pre class="deep-dive-terminal">${lines}</pre>`;
        });

        // Handle markdown tables
        text = text.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, (match, header, body) => {
            const ths = header.split('|').map(h => h.trim()).filter(Boolean).map(h => `<th>${h}</th>`).join('');
            const rows = body.trim().split('\n').map(row => {
                const tds = row.split('|').map(c => c.trim()).filter(Boolean).map(c => `<td>${c}</td>`).join('');
                return `<tr>${tds}</tr>`;
            }).join('');
            return `<table class="deep-dive-table"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
        });

        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^- (.+)/gm, '<li>$1</li>')
            .replace(/(<li>[\s\S]*?<\/li>)/gm, (m) => m)
            .replace(/\n{2,}/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>').replace(/$/, '</p>')
            .replace(/<p><\/p>/g, '')
            .replace(/<p>(<table|<ul)/g, '$1')
            .replace(/(<\/table>|<\/ul>)<\/p>/g, '$1');
    }

    async reanalyze() {
        if (!this.currentNotification) return;
        this.cache.delete(this.currentNotification.id);
        await this.show(this.currentNotification);
    }

    close() {
        this.overlay.classList.add('closing');
        setTimeout(() => {
            this.overlay.classList.remove('open', 'closing');
        }, 250);
    }
}

export const deepDiveModal = new DeepDiveModal();
