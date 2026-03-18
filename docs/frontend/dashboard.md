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
| `css/sidebar.css` | Sidebar derecho: perfil, stats, gráfico semanal, noticias |
| `css/responsive.css` | Breakpoints para tablet/mobile |
| `css/index.css` | Importaciones centrales de CSS |

### JavaScript — Módulos
| Archivo | Función |
|---|---|
| `index.js` | Orquestador principal, inicializa todos los módulos |
| `modules/alerts.js` | Alertas y notificaciones del dashboard |
| `modules/missions-card.js` | Card de Misiones Recientes (tabla con badge de estado) |
| `modules/pois-card.js` | Card de Puntos de Interés (lista con conteo) |
| `modules/objects-card.js` | Card de Objetos + gráfico radar (canvas) |
| `modules/personas-card.js` | Card de Personas Encontradas (avatar + tabla) |
| `modules/rutas-card.js` | Card de Rutas Planificadas (distancia + seguridad) |
| `modules/sidebar.js` | Sidebar: tips, stats del explorador, gráfico semanal, noticias IA |
| `modules/modal/ItemDetailModal.js` | Modal Universal Glassmorphism para mostrar detalles ricos, stats de misiones, etiquetas interactuables y botón de renderizado GPS en Mapa |

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
