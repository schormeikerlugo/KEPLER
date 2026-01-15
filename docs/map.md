# 🗺️ Mapa de Exploración (KEPLER)

## 🌌 Visión General

El **Mapa de Exploración** visualiza geográficamente los objetos detectados. Ha sido migrado a **MapLibre GL JS** para ofrecer renderizado por GPU de alto rendimiento, manteniendo la estética cyberpunk holográfica característica de KEPLER.

---

## 🛠️ Stack Tecnológico

- **Motor de Renderizado:** [MapLibre GL JS](https://maplibre.org/) (WebGL)
- **Tiles:** Proxy propio `/api/utils/tiles` (soporta OSM, ESRI, OpenTopoMap)
- **Tema:** Estilo CSS "Odradek" (inversión de color + saturación neón)
- **Animaciones:** CSS puro acelerado por hardware para pulsos y transiciones.

---

## 🧩 Componentes Principales

```
frontend/src/features/map/
├── MapController.js       # Controlador de MapLibre (Estilos, Capas, Marcadores)
├── modules/
│   ├── MapLocation.js     # Geolocalización GPS
│   ├── MapControls.js     # Botones flotantes y menú móvil
│   ├── MapSearch.js       # Búsqueda en tiempo real
│   └── MapFilters.js      # Panel de filtros (Tipo, Confianza)
└── map.css                # Estilos del contenedor, popups y efectos holográficos
```

---

## 📱 Funcionalidades Nuevas

### 1. Modos de Visualización (Capas)
Selector flotante (`🌙`) para cambiar el estilo del mapa en tiempo real:
- **� Dark (Odradek):** Estilo por defecto. Inversión holográfica azul/cian inspirada en *Death Stranding*.
- **🗺️ Street:** Mapa de calles estándar (OSM).
- **🛰️ Satellite:** Imágenes satelitales de alta resolución (ESRI).
- **⛰️ Terrain:** Mapa topográfico (OpenTopoMap).

### 2. Animaciones de Objetos ("Pulsos Vivos")
Los marcadores emiten una onda de pulso cuyo color depende del tipo de objeto, con un desfase aleatorio para dar sensación orgánica:
- **Tecnología:** 🟦 Cian (`#00f7ff`)
- **Flora:** 🟩 Verde Neón (`#39ff14`)
- **Estructuras:** ❇️ Menta (`#00ffaa`)
- **Marcadores:** 🟥 Rojo (`#ff0055`)
- **Cráteres:** 🟧 Naranja (`#ffaa00`)
- **Artefactos:** 🟪 Púrpura (`#bd00ff`)

### 3. Popups Enriquecidos
Al hacer clic en un objeto, el popup renderizado en el DOM muestra:
- **Imagen:** Miniatura automática (ajustada con `object-fit: contain`).
- **Datos:** Nombre, Tipo, Descripción, Barra de Confianza.
- **Propietario:** Enlace interactivo (`@Usuario`) que abre el modal de perfil.

### 4. Búsqueda y Filtrado
- **Barra de Búsqueda:** Filtra por nombre o tipo en tiempo real.
- **Panel Lateral:** Slider de confianza mínima y checkboxes por tipo de objeto.

---

## 🔌 Backend Proxy

Para evitar problemas de CORS y COEP (Cross-Origin Embedder Policy), los tiles se sirven a través de un proxy local:
`GET /api/utils/tiles/{z}/{x}/{y}.png?source=[osm|esri|opentopo]`

Esto permite cambiar la fuente de datos (source) dinámicamente sin violar políticas de seguridad del navegador.

---

## 🎨 Guía de Estilos (CSS)

### Efecto Odradek (Modo Dark)
Se aplica un filtro al canvas del mapa para transformar los tiles estándar en un holograma:
```css
.map-mode-odradek .maplibregl-canvas {
    filter: invert(100%) sepia(100%) 
            saturate(400%) hue-rotate(190deg) 
            brightness(90%) contrast(130%);
}
```

### Marcadores Dinámicos
Se usan variables CSS inyectadas por JS para el color del pulso:
```css
.marker-pulse {
    border: 1px solid var(--marker-color);
    box-shadow: 0 0 10px var(--marker-color);
    animation: pulse-ring 3s infinite;
}
```

---

## 🚀 Sistema de Vector Tiles (PMTiles)

### Arquitectura
KEPLER soporta dos modos de renderizado:
1. **Raster Mode**: Tiles PNG tradicionales (por defecto si no hay PMTiles).
2. **Vector Mode**: Geometría vectorial via PMTiles (WebGL, edificios 3D).

### Descargar Regiones
```bash
# Desde el directorio backend/
./scripts/download_pmtiles.sh venezuela

# Regiones disponibles:
# venezuela, colombia, brazil, peru, chile, argentina, ecuador, bolivia
```

### Cambiar a Modo Vector
1. El sistema detecta automáticamente los archivos PMTiles en `data/pmtiles/`.
2. Si hay regiones disponibles, usa el modo Vector por defecto.
3. Manualmente: Menú de capas → "⚡ Vector (3D)".

### Estilo Odradek Vector
El archivo `frontend/src/features/map/styles/odradek-vector.json` define:
- Fondo oscuro (#0a0f14).
- Autopistas con efecto neón cyan y resplandor.
- Edificios extruidos en 3D con contornos luminosos.
- Etiquetas de ciudades estilo holográfico.
