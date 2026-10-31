# AR Explorer — Arquitectura y Funcionalidades

## Descripcion
La vista AR es el módulo de campo principal de KEPLER. El explorador usa la cámara del dispositivo para detectar objetos, personas y puntos de interés en tiempo real via YOLOv26, con captura automática y re-identificación visual via CLIP.

## Archivos

### Estructura
```
apps/web/src/features/ar/
├── index.js                    # Controlador principal, bindings, loop
├── ar.html                     # Template UI (HUD, modales, controles)
├── ar.css                      # Estilos (Death Stranding inspired)
└── controllers/
    ├── ARUIController.js       # Rendering HUD, compass, GPS, toasts
    ├── ARDataController.js     # Persistencia, Quick Capture, entity routing
    ├── ARSettingsController.js # Panel settings, toggles, calibración
    ├── ARMarkerController.js   # Markers 3D (Three.js), labels 2D
    └── ARSentinelController.js # Auto-captura inteligente via CaptureQueue
```

### Engines (compartidos)
```
apps/web/src/js/engines/
├── AREngine.js          # Three.js scene, camera, video stream
├── GPSEngine.js         # Location + compass (magnetometer + gyro fusion)
└── AIEngine_YOLO.js     # WebSocket YOLO detection con FPS dinámico
```

---

## Pipeline de Detección

```
Cámara → Frame 640x640 (JPEG 0.6) → WebSocket → Backend YOLO + ByteTrack
    ↓
Predictions [{ class, score, bbox, track_id }]
    ↓
ObjectTracker (Kalman smoothing) → UI Detection Boxes → Sentinel Check
```

### Modos de FPS Dinámico (`AIEngine_YOLO.js`)
| Modo | Intervalo | Cuándo |
|---|---|---|
| **Exploración** | 333ms (~3 FPS) | Default, caminando |
| **Enfoque** | 100ms (~10 FPS) | Target lock detectado (score > 0.5) |
| **Reposo** | Pausado (0 FPS) | HUD oculto + Sentinel desactivado |

Auto-switch:
- Target detectado → focus
- Target perdido 2s → explore
- HUD oculto → rest (salvo Sentinel activo)

### ByteTrack (Backend `inference.py`)
- `model.track()` con `persist=True` asigna `track_id` persistente a cada objeto
- Mismo objeto moviéndose mantiene su ID entre frames
- Evita capturas duplicadas del mismo individuo

---

## HUD Auto-Hide

- Top bar, bottom bar y telemetría se ocultan automáticamente tras **10 segundos**
- Tap en pantalla los muestra de nuevo por 10s
- **Botón Quick Capture (⊕)** y **counter** siempre visibles
- Transición suave fade 0.4s

---

## 3 Modos de Captura

### 1. Quick Capture (⊕) — 1 toque, 0 campos
```
Tap ⊕ → Snapshot + GPS + heading + clase YOLO
    → Enqueue instantáneo a CaptureQueue (0ms)
    → Flash visual 150ms
    → Counter actualiza
    → Backend procesa en background (CLIP + Re-ID + insert)
```

### 2. Registro Detallado (TICK hub) — 2 toques + pre-fill
- Hub con opciones: 📍 Marcador | 🏔️ POI | 👤 Persona | 🛤️ Ruta | 🛡️ Sentinel
- Cada modal abre con campos **pre-rellenados**:
  - Marcador: título = clase YOLO, descripción = confianza
  - POI: nombre = clase YOLO, zona = misión zona
  - Persona: nombre = "Persona HH:MM"
  - Ruta: nombre = "Ruta [zona] HH:MM"

### 3. Sentinel (automático) — 0 toques
- Toggle 🛡️ en el hub o settings
- Captura **todas** las entidades del frame simultáneamente
- Cooldown por **individuo** (track_id), no por clase
- Recorta cada entidad del frame via bbox YOLO + 15% padding
- Máximo 5 entidades por frame
- Skip de crops < 500 bytes (vacíos/corruptos)

---

## CaptureQueue (`js/services/CaptureQueue.js`)

Cola de capturas persistente con procesamiento en background.

### Flujo
```
Sentinel/QuickCapture → enqueue(capture) → localStorage
    ↓ cada 800ms
CaptureQueue → POST /api/captures/batch (5 items)
    ↓ Backend
CLIP embedding → Re-ID check → DB insert
    ↓
Notificación: "📦 5 procesadas · 2 re-IDs"
```

### Características
- Persiste en `localStorage` (sobrevive cierre de app y fin de misión)
- Batch de 5 items cada 800ms
- Fallback a procesamiento individual si batch falla
- Notificaciones silenciosas (solo errores y re-IDs como popup)
- Counter en HUD muestra: procesadas + pendientes + errores

---

## Re-Identificación Visual (CLIP)

### Pipeline
```
Imagen capturada → CLIP ViT-B/32 (512-dim embedding, ~50ms GPU)
    → pgvector cosine similarity vs existentes
    → Si match > 78%: "RE-ID: Juan Martinez (85%)"
    → Si no match: crear nuevo registro
```

### Tablas soportadas
- `personas_encontradas` (entity_type: 'persona')
- `puntos_interes` (entity_type: 'poi')
- `objetos_exploracion` (entity_type: 'generic')

### Comparador Visual de Identidades
Herramienta en Archivos → Personas → "🔍 Comparador":
- Vista full-screen con personas sin ID en sidebar
- Comparación lado a lado con fotos grandes
- Vincular / Rechazar / Guardar como nueva
- Thumbnails de matches alternativos
- Al vincular: actualiza nombre, pasa a siguiente automáticamente

---

## Backend Endpoints AR

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/ws/detect` | WebSocket | Streaming YOLO + ByteTrack |
| `/api/captures/batch` | POST | Procesar batch de capturas (CLIP + Re-ID + insert) |
| `/api/captures/process` | POST | Procesar captura individual |
| `/api/objects/match-visual` | POST | Buscar matches via CLIP embedding |
| `/api/objects/create` | POST | Crear objeto (con embedding auto) |

---

## UI Bottom Bar (Compacta)

```
[🤖][🔍]      [ ⊕ ]      [📖][📋▼]
 AI   Scan   Captura     Teach  Hub
              (64px)          ├─ 📍 Marcador
                              ├─ 🏔️ POI
                              ├─ 👤 Persona
                              ├─ 🛤️ Ruta
                              └─ 🛡️ Sentinel
```

Botones compactos (48x48, solo iconos). Quick Capture centrado y prominente.

---

## Configuración (Settings Panel)

| Toggle | Función |
|---|---|
| AI Scanner | Activar/desactivar detección YOLO |
| Sentinel | Vigilancia + auto-captura unificados |
| Search Radius | Radio de búsqueda de POIs (slider) |
| Grid Overlay | Mostrar grid 3D |
| Camera | Activar/desactivar cámara |
| UI Toggle | Modo inmersivo (ocultar todo) |
| Calibration | Ajuste manual de heading |
