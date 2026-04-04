# Dashboard — Módulos y Estructura

## Descripción
El dashboard es la vista principal de KEPLER. Muestra telemetría en vivo, misiones activas, objetos encontrados, personas detectadas, rutas planificadas, y un sidebar con perfil y estadísticas del explorador.

## Archivos

### HTML
- `apps/web/src/features/dashboard/dashboard.html`

### CSS
| Archivo | Contenido |
|---|---|
| `css/base.css` | Layout principal (grid 2 columnas: contenido + sidebar) |
| `css/dashboard-cards.css` | Estilos de cards, tablas, badges, telemetría, alertas |
| `css/sidebar.css` | Sidebar derecho: perfil, stats, gráfico semanal, noticias, hint GPS |
| `css/responsive.css` | Breakpoints para tablet/mobile |
| `css/index.css` | Importaciones centrales de CSS |
| `css/modal.css` | Modales: misión, history, ItemDetail (animaciones unificadas `modal-enter`/`modal-exit`) |
| `css/full-view-modal.css` | Modal Full View expandible (animaciones unificadas) |

### JavaScript — Módulos
| Archivo | Función |
|---|---|
| `index.js` | Orquestador principal, inicializa todos los módulos. Renderiza non-blocking (datos en background). |
| `modules/alerts.js` | Alertas y notificaciones del dashboard |
| `modules/missions-card.js` | Card de Misiones Recientes (tabla con badge de estado) |
| `modules/pois-card.js` | Card de Puntos de Interés (lista con conteo) |
| `modules/objects-card.js` | Card de Objetos + gráfico radar (canvas) |
| `modules/personas-card.js` | Card de Personas Encontradas (avatar + tabla) |
| `modules/rutas-card.js` | Card de Rutas Planificadas (distancia + seguridad) |
| `modules/sidebar.js` | Sidebar: tips, stats del explorador, gráfico semanal, noticias IA. Geolocalización con cadena GPS → cache → proxy backend. |
| `modules/mission/index.js` | Modal de Iniciar Misión con selector de rutas planificadas, auto-relleno de campos, y almacenamiento de waypoints para AR. |
| `modules/modal/ItemDetailModal.js` | Modal Universal Glassmorphism con animación de cierre. |
| `modules/modal/ModuleFullViewModal.js` | Modal Full View con animación de entrada/salida unificada. |
| `modules/system-status.js` | Panel de estado del sistema (Backend vía `/health`, GPS, Sync, IA). |

---

## 🚀 Componentes Avanzados (v0.7.0)

### 1. Universal Detail Modal (`ItemDetailModal.js`)
Un componente unificado orientado a objetos (Clase JS) que reemplaza las alertas nativas (alert/prompt). Capaz de inyectar dinámicamente:
- **Vista Dividida (Split-View):** Imagen/Avatar a la izquierda, campos informativos a la derecha.
- **Gráficos Radar Canvas:** Para estadísticas de misiones u objetos.
- **Etiquetas Smart (Pills):** Botones interactivos clasificados (IMPORTANTE, PELIGRO, etc.).
- **Enrutamiento Inteligente:** Capacidad de leer propiedades georeferenciadas y saltar a vistas específicas (Ej: Botón "Ver en Mapa").

### 2. Alertas Accionables Anidadas (`alerts.js`)
El sistema de notificaciones en el dashboard ya no es estático.
1. Filtra ítems no verificados o de alto riesgo.
2. Los **agrupa por categoría** (Ej: "3 POIs no Verificados").
3. Al hacer clic en el grupo, abre una lista secundaria (Sub-Modal).
4. Al hacer clic en el ítem individual, dispara el `ItemDetailModal` para tomar acción directa.

### 3. Integración MapLibre Geotrack 🗺️
Si una misión incluye un array `geotrack` guardado en Supabase, el Dashboard genera un botón dinámico en su modal de detalle. Al presionarlo:
1. Conmuta el layout del Dashboard y activa el contenedor del mapa 3D (`kepler.map.openMap()`)
2. Despacha un evento global `kepler:show_geotrack_on_map`.
3. El `MapController` intercepta el evento, convierte el array crudo en un `GeoJSON LineString` al vuelo, e inyecta la pista láser cyan directamente sobre el modelo topográfico.

### 4. Universal Full View Modal (`ModuleFullViewModal.js`)
Un componente diseñado para expandir la información de cualquier módulo del dashboard accionado a través de los botones "VER TODO".
- **Tabla Extensa Dinámica:** Muestra todos los registros de la base de datos de un módulo de forma tabulada (e.g. misiones, POIs).
- **Filtros en Tiempo Real:** Caja de búsqueda iterativa para encontrar rápidamente registros en todo el dataset.
- **Gráficos Resumen (Canvas):** Renderizado de distribución estadística en barra vertical en el panel lateral (estados, niveles de riesgo, etc.).
- **Navegación Profunda (Deep-Dive):** Cada elemento de la tabla es interactivo y linkea directamente con el `ItemDetailModal` para revisión individual.

---

## 🗺️ SPA Router (`main.js`)

KEPLER usa un router SPA nativo (sin librerías). Toda la navegación entre secciones ocurre sin recargas de página.

### Función global: `window.kepler.navigate(path)`
- Usa `history.pushState()` para cambiar URL sin reload
- Transición fade-out/fade-in de 150ms entre secciones
- Soporte para botones atrás/adelante del navegador (`popstate`)
- Intercepta clicks en `<a href>` internos automáticamente
- Rutas externas (login, logout) mantienen `window.location.href` para reiniciar auth

### Rutas SPA registradas
| Ruta | Módulo | Nota |
|---|---|---|
| `/` | Dashboard | Vista principal |
| `/ar` | AR Explorer | Cámara + detección |
| `/login` | Login | Autenticación |
| `/taxonomia` | Taxonomía | Clasificación de objetos |
| `/ia` | Inteligencia IA | Chat + análisis |
| `/profile` | Perfil | Configuración de usuario |
| `/archives` | Archivos | Explorador de misiones y registros |

---

## 🚀 Selector de Ruta en Misión (`mission/index.js`)

Al abrir el modal "Iniciar Misión", el sistema carga las rutas planificadas del backend (`api.getPlannedRoutes()`).

### Flujo
1. Modal abre → se puebla dropdown `#select-mission-route` con rutas guardadas
2. Al seleccionar ruta → preview con distancia, waypoints, terreno
3. Auto-rellena: tipo de terreno, zona (nombre de ruta), coords de inicio (primer waypoint)
4. Al confirmar: `ruta_planificada_id` se envía al backend, waypoints se guardan en `localStorage` para AR
5. AR Explorer lee `kepler_mission_waypoints` para guiar la exploración

---

## 🔔 Sistema de Notificaciones (`NotificationSystem.js`)

### Toasts
- Aparecen en esquina superior derecha con slide-in desde la derecha
- Tipos: `critical` (persistente), `warning` (7s), `success` (4s), `info` (5s)
- Audio feedback por tipo con volúmenes diferenciados
- Click en toast → abre Deep-Dive con análisis IA
- Hint visual "Click para analizar" en cada toast

### Bitácora (Panel de Log)
- Overlay full-height con backdrop blur al abrir
- Panel lateral de 400px deslizante desde la derecha
- **Summary chips**: Contadores clickeables por tipo (Total, Críticas, Advertencias, Éxitos, Info)
- Filtro por tipo via chips o dropdown select
- Timeline agrupada por fecha (Hoy, Ayer, fechas anteriores)
- Acciones: eliminar individual, eliminar por día, limpiar todo
- Click en cualquier item → abre Deep-Dive con análisis IA
- Cierre: click fuera, botón X, o tecla Escape
- Almacenamiento: `NotificationStore` con sync a Supabase + localStorage fallback

### Context Metadata
Cada notificación puede incluir un objeto `context` con metadata estructurada para enriquecer el análisis IA:
```js
window.kepler.notify.success('Mensaje', { source: 'realtime', event: 'COMPLETED', mission: {...}, stats: {...} });
```

Callers que pasan context:
| Fuente | Datos en context |
|---|---|
| `RealtimeService` | mission (codigo, zona, estado), stats, user, event type |
| `OfflineSyncService` | object (nombre, tipo), pendingCount, isOnline, action |
| `routes/index.js` | route (nombre, terreno, distancia, waypoints), action |
| `ItemDetailModal` | table, recordId, action, error |
| `system-status` | services (backend, database, ai) |
| `sync-indicator` | isOnline, pendingCount |

### Deep-Dive Modal (`DeepDiveModal.js`)
Modal con análisis IA on-demand generado por Mistral (`POST /api/chat/analyze`).

**Flujo:**
1. Click en notificación (toast o bitácora) → modal se abre con skeleton loading
2. Detección de categoría: por `context.source` si disponible, o por análisis del texto del mensaje
3. Prompt especializado enviado a Mistral via `/api/chat/analyze` (llamada directa a Ollama, sin LangChain)
4. Respuesta parseada en secciones markdown con tablas, listas y formato
5. Respuesta cacheada en memoria por sesión
6. Botón "Regenerar Análisis" para forzar nueva consulta

**18 prompts especializados con estructuras únicas por categoría:**

| Categoría | Secciones |
|---|---|
| Misión completada | Informe, Tabla de Métricas, Plan Siguiente Expedición |
| Misión nueva | Alerta de Despliegue, Perfil de Zona, Checklist Pre-Misión |
| Misión activada | Misión en Curso, Estado Operativo, Protocolo de Campo |
| Misión eliminada | Registro Eliminado, Datos Afectados, Protocolo de Verificación |
| Ruta guardada | Ruta Planificada, Evaluación Táctica, Equipamiento Sugerido |
| Ruta eliminada | Ruta Eliminada, Misiones Vinculadas |
| Ruta cargada | Ruta en Edición, Optimizaciones Posibles |
| Objeto registrado | Ficha de Registro, Clasificación, Próximos Pasos |
| Objeto pendiente | Objeto Pendiente, Estado de Cola, Prioridad de Acción |
| Sync resultado | Tabla de Resultados, Diagnóstico de Fallos |
| Health OK | Tabla de Servicios, Rendimiento |
| Health error | Tabla de Servicios, Diagnóstico, Impacto Operativo |
| Record guardado/eliminado | Confirmación, Verificación/Datos Relacionados |
| Record error | Error en BD, Causa Probable, Solución |
| Genérico (sin context) | Evento, Contexto (mínimo) |

**Detección por texto (fallback sin context):**
Cuando una notificación no tiene `context` (ej: notificaciones antiguas), `_detectCategory()` analiza patrones del mensaje ("misión completada", "guardado localmente", "ruta guardada", etc.) para asignar el prompt correcto.

---

## 🎭 Sistema de Modales Unificado

Todos los modales comparten las mismas animaciones y backdrop:

| Modal | Clase CSS | Tamaño | Z-Index |
|---|---|---|---|
| Iniciar Misión | `.history-modal` | 460px | 2000 |
| Full View | `.full-view-modal-overlay` | 85% (max 1400px) | 2000 |
| Item Detail | `.detail-modal-overlay` | 900px | 2500 |
| Confirmación | `.sys-modal-overlay` | 400px | 20000 |

### Animaciones
- **Entrada**: `modal-enter` — `translateY(20px) scale(0.98)` → normal (0.3s ease-out)
- **Salida**: `modal-exit` — normal → `translateY(12px) scale(0.98)` (0.25s ease-in)
- **Backdrop**: `rgba(0, 0, 0, 0.85)` + `backdrop-filter: blur(8px)` (consistente en todos)

### Patrón de cierre (JS)
```js
element.classList.add('closing');
setTimeout(() => {
    element.style.display = 'none';
    element.classList.remove('closing');
}, 250);
```

---

## Header (Cabecera)

### Estructura
1. **Logo (`.dash-header-left`):** Logotipo de KEPLER. En móvil incluye `#system-status-mobile`.
2. **Espacio Central:** Flexible para expansiones futuras.
3. **Controles (`.dash-header-right`):**
   - **Command Menu:** Botón `[COMANDOS]` → desplegable con Mapa, Archivos, Taxonomía.
   - **System Status (Desktop):** monitoreo real-time (Backend, GPS, Sync, IA).
   - **Notificaciones:** Centro de alertas.
   - **Perfil:** Menú de sesión con logout y link al perfil.

### System Status (`system-status.js`)
- **Dual Rendering:** Desktop (derecha del header) y Móvil (junto al logo).
- **Monitoreo:** Backend ping, GPS, OfflineSyncService, ModelPreloader.
- **UX Móvil:** Dropdown ajustado para evitar scroll horizontal.

---

## Tablas con Scroll Oculto
Las tablas de datos (Misiones, Objetos, Personas, Rutas) están limitadas a **5 filas visibles**:
- `max-height: 220px` en `.card-table-wrapper` y `.objetos-table-wrapper`
- `overflow-y: auto` con `scrollbar-width: none` (Firefox) y `::-webkit-scrollbar { display: none }` (Chrome/Safari)
- `thead th` con `position: sticky; top: 0` para cabeceras fijas

---

## Sidebar — Estadísticas del Explorador
El sidebar muestra **2 barras de progreso** calculadas dinámicamente por el backend:
1. **👟 Desgaste del Calzado** — Acumulativo (más km = más desgaste)
2. **⚡ Resistencia Física** — Dinámica (baja con misiones, sube con descanso)

Además muestra un **indicador de clima** con emoji basado en datos reales del backend (Open-Meteo API).

### Colores dinámicos de las barras
| Rango | Color | Significado |
|---|---|---|
| > 60% | 🟢 Verde | Bueno |
| 30–60% | 🟡 Amarillo | Precaución |
| < 30% | 🔴 Rojo | Peligro |

> Para el desgaste, la lógica se invierte: 0% de desgaste = verde, 100% = rojo.

---

## Estilos y Diseño
- **Glassmorphism:** `rgba(10, 15, 25, 0.95)` + `backdrop-filter: blur(20px)`
- **Bordes:** `1px solid rgba(63, 168, 255, 0.3)`
- **Sombras:** Profundas para separar menus del contenido

## Responsive
- **Breakpoint:** 900px
- **Desktop:** Header completo, grid 2 columnas
- **Mobile:** Columna única, header simplificado, dropdowns táctiles
