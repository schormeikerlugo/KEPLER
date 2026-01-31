# 📋 KEPLER Unified Changelog

> Changelog unificado que muestra los cambios en cada plataforma.  
> Etiquetas: `[WEB]` `[DESKTOP]` `[MOBILE]` `[SHARED]` `[BACKEND]`

---

## [Unreleased]

### Pendiente de Sync
- `[MOBILE]` Dashboard: Widget de clima
- `[MOBILE]` AR: Sentinel Mode
- `[MOBILE]` Taxonomía: Crear screen

---

## [0.5.0] - 2026-01-30

### Agregado
- `[SHARED]` Nueva estructura modular en `packages/shared`:
  - Tipos separados: `types/mission.ts`, `types/detection.ts`, `types/user.ts`, `types/telemetry.ts`
  - Constantes separadas: `constants/api.ts`, `constants/theme.ts`, `constants/app.ts`
  - Utilidades puras: `utils/validation.ts`, `utils/format.ts`, `utils/platform.ts`, `utils/mission.ts`
- `[SHARED]` Sub-path exports para tree-shaking (`@kepler/shared/constants`, etc.)

### Sincronizado
- `[WEB]` `[MOBILE]` Login con Supabase Auth
- `[WEB]` `[MOBILE]` Archives gallery
- `[WEB]` `[MOBILE]` Map con geolocalización
- `[WEB]` `[MOBILE]` Profile screen
- `[WEB]` `[MOBILE]` **Map Menu Controls** - Menú de herramientas sincronizado
- `[MOBILE]` **Dashboard Modular** - Refactor a arquitectura feature-based con componentes separados
- `[MOBILE]` **Shared Header** - Header unificado con menú drawer animado desde la derecha
- `[MOBILE]` **useSharedMenu hook** - Hook reutilizable para animaciones de menú y toast
- `[MOBILE]` **Archives Features** - Gestión completa de misiones (Ver, Finalizar, Eliminar) con conexión a API
- `[MOBILE]` **API Service** - Soporte para CRUD de misiones (`updateMission`, `deleteMission`)

### Modificado
- `[BACKEND]` Endpoint `/api/describe-zone` mejorado con Nominatim + Ollama

### Corregido
- `[WEB]` Fix memoria en YOLO worker (no terminar worker compartido)
- `[WEB]` Fix WebGL context cleanup en AREngine

---

## [0.4.0] - 2026-01-15

### Agregado
- `[WEB]` AR Camera con YOLO detection
- `[WEB]` Object tracking con Kalman filter
- `[MOBILE]` Dashboard screen inicial
- `[MOBILE]` AR Camera con expo-camera

### Corregido
- `[WEB]` Fix CPU temperature issues (limitar threads WASM)
- `[WEB]` Fix preloading agresivo en móviles

---

## [0.3.0] - 2026-01-01

### Agregado
- `[WEB]` Dashboard con telemetría
- `[WEB]` Mission system
- `[BACKEND]` API endpoints para missions y objects
- `[MOBILE]` Login screen básico

---

## Formato del Changelog

Cada entrada debe seguir:

```markdown
### [Tipo de cambio]
- `[PLATAFORMA]` Descripción breve del cambio
```

**Tipos de cambio:**
- `Agregado` - Nueva funcionalidad
- `Modificado` - Cambios en funcionalidad existente
- `Corregido` - Bug fixes
- `Eliminado` - Funcionalidad removida
- `Sincronizado` - Feature sincronizado entre plataformas
- `Seguridad` - Fixes de seguridad
