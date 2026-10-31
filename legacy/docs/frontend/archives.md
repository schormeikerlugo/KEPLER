# Archivos — Explorador de Misiones y Registros

## Descripcion
Vista para explorar, editar y gestionar todos los datos capturados durante misiones: objetos, personas, rutas y telemetría.

## Archivos

```
apps/web/src/features/archives/
├── index.js                    # ArchivesController (orquestador)
├── archives-template.html      # Template SPA (sin <html>/<head>)
├── archives.html               # Standalone page (fallback)
├── archives.css                # Imports de estilos modulares
├── modules/
│   ├── missions.js             # Lista de misiones con selección
│   ├── objects-grid.js         # Grid de objetos detectados
│   ├── object-modal.js         # Modal de edición de objeto
│   ├── personas-grid.js        # Grid de personas + modal identidad
│   ├── rutas-grid.js           # Lista de rutas
│   ├── telemetry-panel.js      # Panel de telemetría por misión
│   ├── taxonomy-filters.js     # Filtros de categoría/etiqueta
│   └── identity-comparator.js  # Comparador visual de identidades
└── styles/
    ├── variables.css
    ├── layout.css
    ├── tabs.css
    ├── sidebar.css
    ├── grid.css                # Cards de objetos, personas, rutas
    ├── forms.css
    ├── modal.css
    ├── comparator.css          # Estilos del comparador visual
    └── responsive.css          # Mobile: flujo de pantallas
```

---

## Integración SPA

Archivos es una ruta SPA (`/archives`) renderizada via `render(container)`:
- Template inyectado en `#app`
- CSS importado dinámicamente
- ArchivesController se instancia automáticamente

---

## Flujo Mobile (3 pantallas)

```
Pantalla 1: MISIONES          Pantalla 2: CONTENIDO       Pantalla 3: DETALLE
┌───────────────┐             ┌───────────────┐            ┌───────────────┐
│ [Logo] [Back] │             │[← Misiones]   │            │ [×]           │
├───────────────┤             ├───────────────┤            │ [Imagen]      │
│ ▸ MISION-0404 │  tap →     │[Obj][Per][Rut] │  tap →    │ Nombre: ___   │
│ ▸ MISION-0403 │             │ ▸ Person #7   │            │ Context: ___  │
│ ▸ Sin Asignar │             │ ▸ DOG 14:31   │            │ [Guardar]     │
└───────────────┘             └───────────────┘            └───────────────┘
```

- Misiones no se auto-seleccionan en mobile
- Stats bar oculto en mobile
- Modales tipo bottom-sheet (border-radius top)

---

## Personas — Modal de Identidad

Click en persona card → modal con:
- **Imagen** de la persona
- **Campos editables**: Nombre, Alias, Contexto, Hostilidad, Rasgos Físicos, Notas
- **Coincidencias visuales**: búsqueda CLIP automática al abrir
- **Vincular**: click en match → une identidades
- **Guardar** / **Eliminar**

### Cards de Personas (Layout horizontal)
- Row: avatar 56px + nombre + alias + contexto + badge hostilidad
- Click → modal de identidad

---

## Comparador Visual de Identidades

Herramienta dedicada para vincular personas detectadas múltiples veces.

### Acceso
Tab Personas → Botón "🔍 Comparador"

### Layout
- **Sidebar** (220px): personas sin ID (nombre = "Persona..."), scrollable
- **Centro**: persona seleccionada con foto grande
- **Derecha**: mejor match CLIP con foto grande
- **Actions**: Vincular ✓ | No es ✕ | Siguiente →
- **Thumbnails**: matches alternativos clickeables
- **Sin matches**: campo para escribir nombre nuevo

### Flujo
1. Carga personas sin identidad confirmada
2. Selecciona primera → CLIP busca matches (threshold 0.50)
3. Fetch de imágenes de todos los matches
4. Muestra lado a lado con % de similitud
5. Vincular → actualiza nombre, pasa a siguiente
6. Rechazar → marca par, muestra siguiente match
7. Sin matches → input para nombre nuevo → "Guardar como nueva"
8. Al cerrar → refresca grid de personas

### Indicadores de similitud
- Verde (≥80%): alta confianza
- Amarillo (60-80%): media
- Rojo (<60%): baja

---

## Tabs

| Tab | Módulo | Contenido |
|---|---|---|
| Objetos | `objects-grid.js` | Grid con imágenes, filtros categoría/etiqueta |
| Personas | `personas-grid.js` | Lista horizontal + comparador |
| Rutas | `rutas-grid.js` | Cards con dificultad/seguridad |
| Telemetría | `telemetry-panel.js` | Datos de sensores por misión |
