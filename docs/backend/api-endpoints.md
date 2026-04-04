# API Endpoints — Backend FastAPI

## Visión General
El Backend de KEPLER es un servicio construido en **Python** con **FastAPI**, diseñado para procesar tareas de IA y servir datos de exploración. Corre en Docker como `mars-sight-backend`.

## Stack Tecnológico
- **Lenguaje:** Python 3.10+
- **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (asíncrono, alto rendimiento)
- **Server:** Uvicorn (ASGI)
- **IA Core:** Sentence-Transformers (CLIP ViT-B-32), Ollama (Mistral 7B)
- **DB Client:** Supabase Python SDK
- **HTTP Client:** httpx (para Open-Meteo, etc.)

## Endpoints Registrados

| Prefijo | Módulo | Descripción |
|---|---|---|
| `/api/dashboard` | `dashboard.py` | Estadísticas agregadas del dashboard |
| `/api/chat` | `chat.py` | Chat con IA (mensajes) |
| `/api/chat` | `chat_stream.py` | Chat con IA (streaming SSE) |
| `/api` | `telemetry.py` | Datos de telemetría en tiempo real |
| `/api/missions` | `missions.py` | CRUD de misiones |
| `/api/objects` | `objects.py` | CRUD de objetos, mapa, búsqueda por similitud |
| `/api/routes` | `routes.py` | Logística y sugerencias de rutas con IA |
| `/api` | `ai.py` | Embedding visual (CLIP) y enriquecimiento (Mistral) |
| `/api/taxonomia` | `taxonomia.py` | Clasificación y taxonomía de objetos |
| `/api` | `inference.py` | Inferencia de modelos (YOLOv26, etc.) |
| `/api/explorer` | `explorer_stats.py` | Algoritmo de Resistencia y Desgaste |
| `/api/utils` | `utils.py` | Utilidades: proxy de tiles, avatar, PMTiles, geolocalización |
| `/health` | `main.py` | Health check del backend (sin auth) |

## Endpoints Detallados

### Telemetría (`/api/realtime-telemetry`)
- **GET** — Datos en tiempo real del estado del traje/rover.
- Ritmo cardíaco, Presión, Temperatura, O2, Radiación.

### Análisis Visual (`/api/generate-embedding`)
- **POST** — Recibe imagen (Base64), genera embedding CLIP (512 dims).

### Enriquecimiento (`/api/enrich-data`)
- **POST** — Recibe etiqueta/texto, consulta a Mistral 7B para descripción científica.

### Búsqueda por Similitud (`/api/search-similar`)
- **POST** — Genera embedding de imagen input, busca en pgvector objetos similares.

### Explorer Stats (`/api/explorer/stats`)
- **GET** — Calcula Desgaste del Calzado y Resistencia Física.
- Acepta `?lat=&lng=` para clima real vía Open-Meteo.
- Ver [explorer-stats.md](explorer-stats.md) para detalle del algoritmo.

### Geolocalización por IP (`/api/utils/geolocate`)
- **GET** — Proxy server-side a ipapi.co para geolocalización por IP.
- Evita problemas de CORS y rate-limit del cliente.
- Cache en memoria por IP del cliente (TTL: 1 hora).
- Retorna: `{ success, latitude, longitude, city, region, country, source: "ip" }`.
- Usado como fallback cuando GPS no está disponible y no hay coords en cache.

### Health Check (`/health`)
- **GET** — Verifica que el backend está operativo (sin autenticación).
- Retorna: `{ status: "healthy", services: ["database", "ai_model"] }`.
- Usado por `system-status.js` para el indicador de estado del sistema.

### Análisis IA Directo (`/api/chat/analyze`)
- **POST** — Llamada directa a Ollama/Mistral sin LangChain agent.
- Diseñado para análisis rápidos de notificaciones (evita límite de iteraciones del agente).
- Body: `{ message: string, context: string }`.
- Retorna: `{ response: string, success: boolean }`.
- Usado por `DeepDiveModal.js` para generar análisis on-demand al clickear notificaciones.

### Misiones (`/api/missions`)
- **POST** `/start` — Inicia misión. Acepta `ruta_planificada_id` opcional para vincular ruta planificada.
- **POST** `/end` — Finaliza misión activa con resumen.
- **GET** `/` — Lista misiones del usuario.
- **POST** `/describe-zone` — Genera descripción de zona via GPS + IA.

## Autenticación
- JWT de Supabase verificado en `app/api/deps.py`
- `get_current_user()` — Dependency injection
- `get_supabase_client()` — Cliente con Service Role Key

## Servicios (`app/services/`)
| Servicio | Descripción |
|---|---|
| `ai_service.py` | Integración con Ollama para chat/análisis |
| `weather_service.py` | Clima real vía Open-Meteo API |

## Docker
```yaml
backend:
  build:
  context: ./backend
  container_name: mars-sight-backend
  volumes:
    - ./backend:/app
```

## Notas de Despliegue
- Requiere servidor **Ollama** externo en puerto `11434` para funciones de texto.
- Se recomienda PyTorch CPU-only (~1.5 GB vs 7 GB con CUDA) si no hay GPU.
