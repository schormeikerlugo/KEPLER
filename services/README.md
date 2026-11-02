# services

## kepler-server

API REST + WebSocket en vivo en Rust (axum + sqlx), desplegada en cortex como `kepler-server` (puerto **8000**).

- Autenticación con el JWT de Supabase Auth (`Authorization: Bearer`).
- Cada petición abre una transacción con el rol `authenticated` y los claims del usuario: **RLS se aplica también al servidor**.
- Sin `SERVICE_ROLE_KEY`: el servidor no puede ver datos de otros usuarios aunque tenga un bug.

### Datos compartidos

| Dato | Visibilidad |
|---|---|
| Puntos de interés | **Compartidos por defecto** (`visibilidad`), el autor puede hacerlos privados |
| Objetos | Privados por defecto, el autor puede compartirlos |
| Personas hostiles | Alerta compartida con descripción y foto (`alertas_personas`), sin nombre ni embedding |
| Rutas, misiones, rastro GPS, notificaciones, chat, perfil | Siempre privados |

Solo el autor edita; los demás suben `confirmaciones` (`vigente` / `no_vigente`). Un reporte sin confirmar en 30 días queda *sin verificar* (pesa la mitad en el riesgo) y uno marcado como `no_vigente` después de su última confirmación queda *retirado* (no cuenta). Un POI de riesgo alto/crítico o una persona hostil nuevos se avisan en vivo (`ReporteCompartido`) a los demás exploradores conectados.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la base de datos y de cada Ollama (sin auth) |
| POST | `/v1/sesion` | `{usuario, contrasena}` → tokens (sin auth; reenvía a Auth como `<usuario>@kepler.local`) |
| POST | `/v1/sesion/renovar` · `/v1/sesion/cerrar` | Renovar con `refresh_token` / revocar la sesión |
| GET / PATCH | `/v1/yo` | Perfil propio |
| POST | `/v1/yo/avatar` | `{imagen}` JPEG base64 (≤ 2 MB) → Storage y `avatar_path` |
| POST | `/v1/sesion/contrasena` | `{actual, nueva}`: verifica la actual y cambia (mín. 8) |
| GET / POST / DELETE | `/v1/etiquetas` · `/v1/etiquetas/{id}` | Etiquetas personales (con cuántos objetos llevan cada una) |
| PUT | `/v1/objetos/{id}/etiquetas` | `{etiquetas: [...]}` reemplaza las del objeto (solo propias); los objetos de `/v1/archivos` traen `etiquetas` |
| GET | `/v1/catalogos` | Taxonomía y categorías de POI |
| GET / POST | `/v1/misiones` | Listar (`?estado=&limite=`) / crear (`"iniciar": true` = Quick Launch) |
| GET | `/v1/misiones/{id}` | Detalle |
| POST | `/v1/misiones/{id}/iniciar` · `/completar` · `/abortar` | Ciclo de vida (409 si la transición no vale o cambió en otro dispositivo). `en` opcional (también al crear): la hora del dispositivo para acciones guardadas sin conexión (hasta 30 días atrás) |
| GET / POST | `/v1/misiones/{id}/rastro` | Rastro GPS (lotes de hasta 1000 puntos, idempotente) |
| GET | `/v1/sync/cambios?desde=&embeddings=` | Cambios desde el cursor (incluye borrados lógicos) |
| POST | `/v1/sync/subir` | `{ "<tabla>": [filas] }` con resolución de conflictos |
| GET | `/v1/notificaciones?limite=&antes=&tipo=&solo_no_leidas=` | Bitácora (más reciente primero) + total de no leídas |
| POST | `/v1/notificaciones/leer` | `{ids: [...]}` o `{todas: true}` |
| GET | `/v1/archivos?tipo=objetos\|personas\|puntos_interes&mision=&categoria=&q=&limite=&antes=` | Hallazgos propios para revisar (sin embeddings, con `tiene_embedding`); editar/borrar va por `/v1/sync/subir` |
| GET | `/v1/archivos/{tipo}/{id}` | Un hallazgo propio (mismo formato que el listado) |
| GET | `/v1/imagenes/{ruta}` | Foto de Storage leída como el usuario (RLS de Storage); sin rate limit, caché inmutable |
| GET | `/v1/identidades/pendientes` | Personas sueltas con parecidos ≥ 0,6 (por debajo del Re-ID automático): comparador |
| POST | `/v1/personas/{id}/vincular` · `/desvincular` | `{con}`: pasa a la identidad (y nombre) de otra persona, con sus avistamientos |
| POST | `/v1/ia/chat` | `{chat_id?, mensaje, lat?, lng?}` → Cortex responde en streaming NDJSON (`estado`, `token`, `reiniciar`, `fin`, `error`) y guarda la conversación (título automático) |
| GET / DELETE | `/v1/ia/chats` · `/v1/ia/chats/{id}` | Conversaciones / una conversación / borrado lógico |
| GET | `/v1/ia/reporte?lat=&lng=&forzar=` | «Novedades de Cortex» en Markdown (tiempo y estado, hallazgos, sugerencia), caché 1 h |
| POST | `/v1/ia/documentar/{mision_id}` | Cortex redacta el reporte de la misión con sus datos y lo guarda en `descripcion_ia` |
| POST | `/v1/ia/analizar` | `{notificacion_id, lat?, lng?}` → Deep-Dive de una entrada de la bitácora (streaming) |
| GET | `/v1/dashboard?zona=` | Conteos, recientes, alertas, distancia de los últimos 7 días, objetos por categoría y más vistos, POIs por categoría (propios/compartidos) |
| GET | `/v1/explorador?lat=&lng=` | Desgaste del calzado, resistencia y clima actual |
| POST | `/v1/explorador/calzado` | Calzado nuevo (el desgaste vuelve a 0) |
| GET | `/v1/clima?lat=&lng=` | Clima (Open-Meteo) + categoría KEPLER + lugar (Nominatim) |
| GET | `/v1/aire?lat=&lng=` | Calidad del aire (Open-Meteo) |
| GET | `/v1/geo/ip` | Ubicación aproximada por IP (ipwho.is) cuando no hay GPS |
| POST | `/v1/rutas/analizar` | Hallazgos y riesgo a lo largo de un trazado (PostGIS) |
| GET | `/v1/alertas/cercanas?lat=&lng=&radio_m=` | Peligros alrededor del explorador |
| GET | `/v1/mapa/elementos` | GeoJSON con POIs (propios y compartidos), personas y objetos propios, alertas de personas hostiles de otros y rutas propias (LineString) |
| GET | `/v1/mapas` · `/v1/mapas/archivos/{región}.pmtiles` | Mapas offline (con `Range`) |
| POST | `/v1/capturas` | Lote (≤ 10) de capturas con foto JPEG en base64: Storage + CLIP + Re-ID + guardado |
| GET (WS) | `/v1/en-vivo` | WebSocket binario `kepler-proto` |

Errores: `{"error": "<codigo>", "mensaje": "..."}` con 401, 404, 409 o 422.

Los servicios externos (clima, aire, IP) responden `{"disponible": false, "motivo": "..."}` si fallan: nunca se inventan valores. Caché en memoria: 15 min clima/aire, 24 h lugares, 1 h IP.

### Bitácora

La escribe la base de datos (migración `0006`), así funciona igual en línea que por sincronización offline:

| Evento | Destino | Tipo |
|---|---|---|
| Misión iniciada / completada (km y min) / abortada | El explorador | info / success / warning |
| POI compartido nuevo de riesgo alto o crítico | Todos los demás | warning / critical |
| Persona hostil nueva (rasgos, sin nombre) | Todos los demás | critical |
| Captura que coincide por Re-ID (la escribe kepler-server) | El explorador | info |
| Identidad vinculada desde el comparador | El explorador | success |

### Cortex (`crates/kepler-ai`)

- Ollama solo en la LAN, en el orden de `KEPLER_OLLAMA_URLS` (PC con GPU → Mac mini); uno que falla queda apartado 30 s.
- Modelo **`qwen3.5:9b`** (`KEPLER_OLLAMA_MODELO`): `mistral:7b` devolvía las llamadas a herramientas como texto.
- Herramientas de solo lectura que corren como el usuario (RLS): `resumen_explorador`, `listar_misiones`, `detalle_mision`, `buscar_hallazgos`, `peligros_cercanos`, `clima`. Hasta 4 rondas antes de obligar a responder.
- En la PC (RTX 3060): ~6 s una pregunta con herramientas, ~5 s el reporte, ~11 s un Deep-Dive.

### Visión (`crates/kepler-vision`)

- **Detección en vivo**: una unidad de campo con `Hola.deteccion_servidor = true` recibe `Detecciones` (YOLO26s + ByteTrack, `origen = SERVIDOR`) por cada `Fotograma`; el centro de control también las recibe.
- **Capturas**: foto en `capturas/<user>/<entidad>/<id>.jpg` (subida con el JWT del usuario), embedding CLIP y Re-ID (≥ 0.78): persona → se vincula a la identidad; POI → duplicado (si es de otro explorador cuenta como confirmación); objeto → se informa el parecido. Se avisa por WebSocket con `CapturaProcesada`.
- Sin modelos el servidor arranca igual (`/health` → `vision.ok = false`): las capturas se guardan sin embedding.
- Rendimiento en cortex (Ryzen 7 3700X, 4 hilos): YOLO26s 78 ms con preprocesado (~13 FPS), CLIP 44 ms (34 ms/imagen en lote). Medir con `docker exec kepler-server kepler-bench /data/modelos`.

### Variables

| Variable | Descripción |
|---|---|
| `KEPLER_DATABASE_URL` | `postgres://authenticator:<pass>@db:5432/postgres` |
| `KEPLER_JWT_SECRET` | `JWT_SECRET` de Supabase |
| `KEPLER_OLLAMA_URLS` | Ollama en orden de preferencia, separados por coma |
| `KEPLER_OLLAMA_MODELO` | `qwen3.5:9b` |
| `KEPLER_CORS_ORIGENES` | Orígenes web permitidos (vacío = ninguno) |
| `KEPLER_RPS` / `KEPLER_RAFAGA` | Rate limit por IP (20/s, ráfaga 60) |
| `KEPLER_MAPAS_DIR` | Directorio de `.pmtiles` (`/data/mapas`) |
| `KEPLER_ZONA_HORARIA` | Zona por defecto del dashboard (`America/Caracas`) |
| `KEPLER_MODELOS_DIR` | Directorio de `modelos.json` y los `.onnx` (`/data/modelos`) |
| `KEPLER_VISION_HILOS` | Hilos por modelo (4) |
| `KEPLER_STORAGE_URL` / `KEPLER_ANON_KEY` | Storage vía gateway para guardar las fotos |
| `KEPLER_AUTH_URL` | Auth vía gateway para `/v1/sesion` (`http://api-gw:8000/auth/v1`) |
| `KEPLER_DIRECCION` | `0.0.0.0:8000` |

### Pruebas

```bash
cargo test -p kepler-server                                   # unitarios y de rutas
cargo test -p kepler-server --test e2e -- --ignored --nocapture # contra un stack real (ver tests/e2e.rs)
sh infra/scripts/e2e.sh                                       # lo mismo con cuentas temporales en cortex
```
