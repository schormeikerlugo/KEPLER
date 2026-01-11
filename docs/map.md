# 🗺️ Mapa de Exploración (KEPLER)

## 🌌 Visión General

El **Mapa de Exploración** permite visualizar geográficamente todos los objetos detectados durante las misiones de exploración. Utiliza Leaflet.js con un estilo holográfico personalizado que coincide con la estética cyberpunk de KEPLER.

---

## 🛠️ Stack Tecnológico

- **Librería de Mapas:** [Leaflet.js](https://leafletjs.com/)
- **Tiles:** OpenStreetMap con filtros CSS personalizados
- **Estilos:** CSS custom con efecto holográfico (grayscale + hue-rotate)

---

## 🧩 Componentes

### Frontend
```
frontend/src/features/map/
├── MapController.js    # Controlador principal del mapa
├── map.css             # Estilos holográficos y responsive
└── (integrado en dashboard)
```

### Backend
- **Endpoint:** `GET /api/objects/map?scope=mine|all`
- **Endpoint:** `GET /api/objects/user/{user_id}/profile`

---

## 📱 Funcionalidades

### 1. Toggle de Objetos
- **👤 Míos:** Solo muestra objetos del usuario actual
- **🌍 Todos:** Muestra objetos de todos los usuarios

### 2. Panel de Objetos
- Lista scrolleable de objetos detectados
- Click en objeto → Vuela al marcador en el mapa
- Muestra icono, nombre, tipo y confianza

### 3. Marcadores Holográficos
- Círculos SVG con color según confianza:
  - `#00d4aa` (verde) → Confianza > 80%
  - `#3fa8ff` (cyan) → Confianza < 80%

### 4. Popups Informativos
- Nombre, tipo, confianza, fecha
- Imagen del objeto (si existe)
- Descripción
- Sección de propietario (en modo "Todos")

### 5. Modal de Perfil de Usuario
Al hacer click en el propietario de un objeto:
- Avatar y nombre de usuario
- Bio/descripción
- Estadísticas: Objetos, Misiones, Puntos
- Fecha de registro

---

## 🔌 API Endpoints

### Obtener Objetos del Mapa
```
GET /api/objects/map?scope=mine|all
Authorization: Bearer <token>

Response:
{
  "objects": [...],
  "scope": "mine" | "all"
}
```

### Obtener Perfil de Usuario
```
GET /api/objects/user/{user_id}/profile
Authorization: Bearer <token>

Response:
{
  "id": "uuid",
  "username": "string",
  "avatar_url": "string",
  "bio": "string",
  "stats": {
    "objects": 42,
    "missions": 15,
    "points": 1250
  },
  "created_at": "timestamp"
}
```

---

## 🎨 Estilos CSS

### Filtro Holográfico para Tiles
```css
.leaflet-tile-pane {
    filter: grayscale(100%) brightness(0.35) 
            sepia(100%) hue-rotate(180deg) 
            saturate(3) contrast(1.2);
}
```

### Responsive (Mobile)
- Panel de objetos: Ancho completo, altura limitada
- Marcadores: Tamaño aumentado para touch (36px)
- Modal de perfil: Scrolleable con max-height 90vh

---

## 🚀 Flujo de Usuario

1. **Acceso:** Dashboard → Botón "Mapa" o Menú móvil → 🗺️ Mapa
2. **Visualización inicial:** Objetos propios (scope=mine)
3. **Exploración comunitaria:** Toggle a "🌍 Todos"
4. **Interacción:** Click en objeto → Popup con detalles
5. **Perfiles:** Click en propietario → Modal con stats
