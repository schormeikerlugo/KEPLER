# services

## kepler-server

API REST + WebSocket en vivo en Rust (axum + sqlx), desplegada en cortex como `kepler-server` (puerto **8000**).

- Autenticación con el JWT de Supabase Auth (`Authorization: Bearer`).
- Cada petición abre una transacción con el rol `authenticated` y los claims del usuario: **RLS se aplica también al servidor**.
- Sin `SERVICE_ROLE_KEY`: el servidor no puede ver datos de otros usuarios aunque tenga un bug.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la base de datos y de cada Ollama (sin auth) |
| GET / PATCH | `/v1/yo` | Perfil propio |
| GET | `/v1/catalogos` | Taxonomía y categorías de POI |
| GET / POST | `/v1/misiones` | Listar (`?estado=&limite=`) / crear (`"iniciar": true` = Quick Launch) |
| GET | `/v1/misiones/{id}` | Detalle |
| POST | `/v1/misiones/{id}/iniciar` · `/completar` · `/abortar` | Ciclo de vida (409 si la transición no vale o cambió en otro dispositivo) |
| GET / POST | `/v1/misiones/{id}/rastro` | Rastro GPS (lotes de hasta 1000 puntos, idempotente) |
| GET | `/v1/sync/cambios?desde=&embeddings=` | Cambios desde el cursor (incluye borrados lógicos) |
| POST | `/v1/sync/subir` | `{ "<tabla>": [filas] }` con resolución de conflictos |
| GET | `/v1/dashboard?zona=` | Conteos, recientes, alertas y distancia de los últimos 7 días |
| GET | `/v1/explorador?lat=&lng=` | Desgaste del calzado, resistencia y clima actual |
| POST | `/v1/explorador/calzado` | Calzado nuevo (el desgaste vuelve a 0) |
| GET | `/v1/clima?lat=&lng=` | Clima (Open-Meteo) + categoría KEPLER + lugar (Nominatim) |
| GET | `/v1/aire?lat=&lng=` | Calidad del aire (Open-Meteo) |
| GET | `/v1/geo/ip` | Ubicación aproximada por IP (ipwho.is) cuando no hay GPS |
| POST | `/v1/rutas/analizar` | Hallazgos y riesgo a lo largo de un trazado (PostGIS) |
| GET | `/v1/alertas/cercanas?lat=&lng=&radio_m=` | Peligros alrededor del explorador |
| GET | `/v1/mapas` · `/v1/mapas/archivos/{región}.pmtiles` | Mapas offline (con `Range`) |
| GET (WS) | `/v1/en-vivo` | WebSocket binario `kepler-proto` |

Errores: `{"error": "<codigo>", "mensaje": "..."}` con 401, 404, 409 o 422.

Los servicios externos (clima, aire, IP) responden `{"disponible": false, "motivo": "..."}` si fallan: nunca se inventan valores. Caché en memoria: 15 min clima/aire, 24 h lugares, 1 h IP.

### Variables

| Variable | Descripción |
|---|---|
| `KEPLER_DATABASE_URL` | `postgres://authenticator:<pass>@db:5432/postgres` |
| `KEPLER_JWT_SECRET` | `JWT_SECRET` de Supabase |
| `KEPLER_OLLAMA_URLS` | Ollama en orden de preferencia, separados por coma |
| `KEPLER_OLLAMA_MODELO` | `mistral:7b` |
| `KEPLER_CORS_ORIGENES` | Orígenes web permitidos (vacío = ninguno) |
| `KEPLER_RPS` / `KEPLER_RAFAGA` | Rate limit por IP (20/s, ráfaga 60) |
| `KEPLER_MAPAS_DIR` | Directorio de `.pmtiles` (`/data/mapas`) |
| `KEPLER_ZONA_HORARIA` | Zona por defecto del dashboard (`America/Caracas`) |
| `KEPLER_DIRECCION` | `0.0.0.0:8000` |

### Pruebas

```bash
cargo test -p kepler-server                                   # unitarios y de rutas
cargo test -p kepler-server --test e2e -- --ignored --nocapture # contra un stack real (ver tests/e2e.rs)
```
