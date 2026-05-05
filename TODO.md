# KEPLER - Tareas Pendientes

> Ir marcando cada tarea completada con [x] antes de pasar a la siguiente.
> Ultima actualizacion: 2026-04-18

---

## v0.8 - Prioridad Alta (Corto Plazo)

### Mobile App (Rebuild desde cero)
- [ ] Definir arquitectura mobile (React Native + Expo)
- [ ] Setup proyecto con Expo Router (file-based routing)
- [ ] Configurar Supabase client para RN
- [ ] Implementar auth flow (login/register) con animaciones nativas
- [ ] Session guard con AppState listener (background/foreground)
- [ ] Dashboard con tarjetas modulares (mismo layout que web)
- [ ] Sidebar stats explorador (boot wear, resistencia, clima)
- [ ] Notificaciones push nativas (expo-notifications)
- [ ] Integrar cámara nativa (react-native-vision-camera)
- [ ] YOLO detección con frame processor (TFLite/ONNX on-device)
- [ ] ByteTrack tracking nativo
- [ ] Sentinel Mode con auto-captura
- [ ] CaptureQueue con SQLite/MMKV (mejor que localStorage)
- [ ] GPS tracking nativo (expo-location background)
- [ ] Heading/brújula con sensores nativos (accelerometer + magnetometer)
- [ ] Mapa con react-native-maplibre-gl
- [ ] Archivos: tabs Misiones/Objetos/Personas/Rutas
- [ ] Identity Comparator
- [ ] Chat IA con streaming SSE
- [ ] Perfil + avatar
- [ ] Taxonomía completa
- [ ] Rutas planner con waypoints en mapa
- [ ] Offline-first: WatermelonDB + sync con Supabase
- [ ] Deep linking entre pantallas

### Data Export
- [ ] Endpoint backend: GET /api/export/csv?mission_id=X
- [ ] Endpoint backend: GET /api/export/geojson?mission_id=X
- [ ] UI web: botón exportar en archivos (misiones, objetos)
- [ ] UI mobile: share sheet nativo para exportar

### Rate Limiting API
- [ ] Implementar rate limiting en FastAPI (slowapi o custom)
- [ ] Definir quotas por usuario (requests/min)
- [ ] Respuestas 429 con Retry-After header
- [ ] Documentar limites en API docs

### Completar Web Pendientes
- [ ] Full-screen modals: filtros avanzados en todas las tarjetas
- [ ] Edición de rutas: actualizar rutas existentes (no solo crear)
- [ ] Chat: procesamiento de imágenes adjuntas en backend

---

## v0.9 - Prioridad Media (Mediano Plazo)

### Timeline View
- [ ] Componente timeline horizontal/vertical
- [ ] Visualizar secuencia de misiones en el tiempo
- [ ] Click en punto de timeline -> detalle de misión
- [ ] Filtrar por rango de fechas

### Heat Map
- [ ] Overlay de densidad de detecciones en MapLibre
- [ ] Gradiente de color por concentración
- [ ] Toggle on/off en control de capas
- [ ] Filtrar por tipo de objeto

### Team Mode
- [ ] Modelo de datos: equipos, miembros, roles
- [ ] Misiones compartidas (multi-usuario)
- [ ] Realtime sync de posiciones entre miembros
- [ ] Chat grupal durante misión
- [ ] Compartir hallazgos entre exploradores

### Chat con Imágenes
- [ ] Upload de imagen en chat UI
- [ ] Backend: procesar imagen con CLIP
- [ ] Mistral: analizar imagen + generar descripción
- [ ] Respuesta contextual sobre el objeto en la imagen

---

## v1.0 - Prioridad Baja (Largo Plazo)

### 3D Terrain
- [ ] Integrar elevación DEM en MapLibre
- [ ] Renderizado 3D interactivo del terreno
- [ ] Visualizar rutas sobre terreno 3D
- [ ] Exageración de elevación configurable

### Voice Commands
- [ ] Speech-to-text nativo (expo-speech)
- [ ] Comandos: "iniciar misión", "capturar", "fin misión"
- [ ] Feedback por voz (text-to-speech)
- [ ] Modo manos libres completo para AR

### Custom YOLO Models
- [ ] UI para upload de modelos .onnx/.tflite
- [ ] Validación de formato y clases
- [ ] Hot-swap de modelo en AR sin reiniciar
- [ ] Gestión de modelos en perfil

### WebSocket YOLO Streaming
- [ ] Endpoint: /api/ws/detect (server-side YOLO)
- [ ] Stream de frames via WebSocket
- [ ] Detección server-side para devices sin GPU
- [ ] Fallback cuando device no soporta on-device

### Advanced Analytics
- [ ] Dashboard de tendencias (objetos por día/semana)
- [ ] Predicción de zonas de interés (clustering)
- [ ] Reportes automáticos por misión
- [ ] Comparación entre misiones

### Offline Maps
- [ ] Descargar regiones PMTiles al dispositivo
- [ ] Selector de región en settings
- [ ] Gestión de almacenamiento (tamaño, eliminar)
- [ ] Sync de tiles al reconectar

---

## Incógnitas (Requieren Decisión)

- [ ] **Desktop Electron**: Definir si se mantiene o se descarta
- [ ] **Offline Sync**: Diseñar estrategia de resolución de conflictos
- [ ] **Image Storage**: Confirmar Supabase Storage + definir retención
- [ ] **Multi-Región**: Decidir regiones PMTiles + plan de i18n
- [ ] **Costos**: Documentar costos de infraestructura (Supabase, Ollama, hosting)
- [ ] **Backup**: Implementar estrategia de respaldo automático

---

## Notas

- **Convención de commits**: `feat:`, `fix:`, `docs:`, `refactor:`
- **Branch strategy**: `main` (producción), `develop` (desarrollo), `feature/*` (features)
- **Testing**: Priorizar tests en API endpoints y lógica de CaptureQueue
- **Documentación Notion**: https://www.notion.so/KEPLER-Documentaci-n-del-Proyecto-33d29fe70224811abf21d5d71a5fde61
