# 📚 KEPLER — Documentación

Índice central de la documentación del proyecto KEPLER (Mars-Sight AR).

---

## Backend (`docs/backend/`)

| Documento | Descripción |
|---|---|
| [api-endpoints.md](backend/api-endpoints.md) | Stack, endpoints FastAPI, servicios, Docker, despliegue |
| [explorer-stats.md](backend/explorer-stats.md) | Algoritmo de Resistencia Física y Desgaste del Calzado |
| [weather-service.md](backend/weather-service.md) | Integración con Open-Meteo API (clima real, categorías, cache) |

## Frontend (`docs/frontend/`)

| Documento | Descripción |
|---|---|
| [dashboard.md](frontend/dashboard.md) | Dashboard: SPA router, Quick Launch, modales unificados, notificaciones |
| [ar.md](frontend/ar.md) | AR Explorer: YOLO + ByteTrack, Quick Capture, Sentinel, CaptureQueue, Re-ID CLIP |
| [archives.md](frontend/archives.md) | Archivos: misiones, objetos, personas, comparador visual, responsive mobile |
| [notifications.md](frontend/notifications.md) | Notificaciones: Deep-Dive IA, 18 prompts, terminal de logs, CaptureQueue |
| [profile.md](frontend/profile.md) | Página de perfil, avatares, Mixed Content fix |
| [session-guard.md](frontend/session-guard.md) | Auto-logout por inactividad (15 min) y cierre de app |
| [auth-y-servicios.md](frontend/auth-y-servicios.md) | Auth, ProfileService, Header, geolocalización GPS/IP |
| [design-system.md](frontend/design-system.md) | Design System: tokens, modal system, cards, forms, buttons, utilities |

## Base de Datos y Servicios

| Documento | Descripción |
|---|---|
| [supabase.md](supabase.md) | Esquema completo de PostgreSQL, Auth, RLS, Storage |

## Sistemas y Arquitectura

| Documento | Descripción |
|---|---|
| [guia-inicio.md](guia-inicio.md) | Guía de inicio rápido del proyecto |
| [deploy.md](deploy.md) | Deploy portable, Docker profiles, setup en PC nueva |
| [realtime.md](realtime.md) | Sistema de notificaciones en tiempo real |
| [loading-system.md](loading-system.md) | Sistema de carga, Model Preloader, caché |
| [ia.md](ia.md) | Integración con IA (Ollama, LangChain, CLIP) |
| [desktop.md](desktop.md) | App de escritorio (Electron) |

## Propuestas y Roadmap

| Documento | Descripción |
|---|---|
| [roadmap.md](roadmap.md) | Roadmap general del proyecto |
| [dashboard-redesign-proposal.md](dashboard-redesign-proposal.md) | Propuesta de reestructuración UI/UX del dashboard |
| [yolov26-research.md](yolov26-research.md) | Investigación de YOLOv26 |

## Plataformas

| Documento | Descripción |
|---|---|
| [mobile/map.md](mobile/map.md) | Mapa en la app móvil |
| [web/map.md](web/map.md) | Mapa en la app web |
| [features/CHANGELOG_UNIFIED.md](features/CHANGELOG_UNIFIED.md) | Changelog unificado |
| [features/SYNC_MATRIX.md](features/SYNC_MATRIX.md) | Matriz de sincronización |

## Sesiones de Desarrollo (`docs/sessions/`)

| Documento | Descripción |
|---|---|
| [2026-04-04-session.md](sessions/2026-04-04-session.md) | SPA Router, AR Quick Capture, CaptureQueue, ByteTrack, Notificaciones IA, Comparador Visual, Mobile responsive |
