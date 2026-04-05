# Sistema de Notificaciones — Arquitectura

## Descripcion
Sistema de notificaciones holográfico con análisis IA on-demand, persistencia cross-device, y feedback de audio.

## Archivos

| Archivo | Función |
|---|---|
| `js/components/NotificationSystem.js` | Toasts, Bitácora, sonidos, wiring a DeepDive |
| `js/components/DeepDiveModal.js` | Modal de análisis IA con prompts especializados |
| `js/services/NotificationStore.js` | Persistencia localStorage + Supabase sync |
| `css/notifications.css` | Estilos: toasts, bitácora, deep-dive, terminal logs |

---

## Toasts (Popup)

| Tipo | Duración | Sonido | Color |
|---|---|---|---|
| `critical` | Persistente | 0.8 vol | Rojo `#ff4444` |
| `warning` | 7000ms | 0.6 vol | Naranja `#ffbb33` |
| `success` | 4000ms | 0.5 vol | Verde `#00d4aa` |
| `info` | 5000ms | 0.3 vol | Cyan `#33b5e5` |

- Slide-in desde la derecha (500ms)
- Click en toast → dismiss + abre Deep-Dive Modal
- Hint "Click para analizar" visible en cada toast

---

## Bitacora (Panel de Log)

- **Overlay full-height** con backdrop blur al abrir
- Panel lateral 400px deslizante desde la derecha
- **Summary chips**: contadores clickeables por tipo (Total, Críticas, etc.)
- Timeline agrupada por fecha (Hoy, Ayer, anteriores)
- Click en item → abre Deep-Dive Modal
- Cierre: click fuera, botón X, tecla Escape

---

## Context Metadata

Cada notificación puede incluir `context` para enriquecer el análisis IA:

```js
window.kepler.notify.success('Mensaje', {
    source: 'realtime',
    event: 'COMPLETED',
    mission: { codigo, zona },
    stats: { totalObjects, duration }
});
```

### Callers con context

| Fuente | Datos |
|---|---|
| `RealtimeService` | mission, stats, user, event type |
| `CaptureQueue` | processed, failed, remaining, errorLogs[] |
| `OfflineSyncService` | object (nombre, tipo), pendingCount, isOnline |
| `routes/index.js` | route (nombre, terreno, distancia, waypoints) |
| `ItemDetailModal` | table, recordId, action, error |
| `system-status` | services (backend, database, ai) |

---

## Deep-Dive Modal (`DeepDiveModal.js`)

Modal de análisis IA on-demand via Mistral (`POST /api/chat/analyze`).

### Flujo
1. Click en notificación → modal abre
2. Si hay `errorLogs[]` → muestra log estilo terminal **inmediatamente**
3. Detección de categoría: por `context.source` o por texto del mensaje
4. Prompt especializado enviado a Mistral
5. Respuesta parseada en secciones markdown con tablas
6. Cache en memoria por sesión
7. Botón "Regenerar Análisis"

### 18 Prompts Especializados

| Categoría | Secciones únicas |
|---|---|
| **Misión completada** | Informe, Tabla Métricas, Plan Siguiente |
| **Misión nueva** | Alerta Despliegue, Perfil Zona, Checklist |
| **Misión activada** | En Curso, Estado Operativo, Protocolo |
| **Misión eliminada** | Eliminación, Datos Afectados, Verificación |
| **Ruta guardada** | Planificada, Evaluación Táctica, Equipamiento |
| **Ruta eliminada** | Eliminada, Misiones Vinculadas |
| **Objeto registrado** | Ficha, Clasificación, Próximos Pasos |
| **Objeto pendiente** | En Cola, Estado Cola, Prioridad |
| **Capture queue** | Procesamiento, Re-IDs, Errores (terminal) |
| **Sync resultado** | Tabla Resultados, Diagnóstico |
| **Health OK/Error** | Tabla Servicios, Diagnóstico, Impacto |
| **Record save/delete** | Confirmación, Verificación |
| **Genérico** | Evento, Contexto |

### Terminal de Logs

Cuando hay `errorLogs[]` en el context, se muestra inmediatamente como terminal:

- Background: `#1a1b26` (Tokyo Night)
- Errores: `#f7768e` (rojo) bold
- Warnings: `#e0af68` (amarillo)
- Info: `#9ece6a` (verde)
- Font: JetBrains Mono / Fira Code

El diagnóstico IA se agrega debajo del log cuando Mistral responde.

---

## CaptureQueue Notifications

Notificaciones silenciosas en AR — solo errores y re-IDs como popup:

| Evento | Tipo | Toast |
|---|---|---|
| Batch exitoso | — | Silencioso (solo counter) |
| Re-identificación | `info` | Sí |
| Batch con errores | `warning` | Sí (con errorLogs) |
| Queue startup | — | Silencioso |

---

## Persistencia

- **localStorage**: `kepler_notification_history` (cache rápido)
- **Supabase**: `user_notifications` table (cross-device sync)
- **Retención**: 30 días automático
- **Context**: solo en localStorage (no sincronizado a Supabase)
