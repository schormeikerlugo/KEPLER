# Centro de Control (escritorio)

App nativa en Rust + [Slint](https://slint.dev) 1.18 (renderer OpenGL/femtovg). Ver la elección en `prototipos/README.md`.

Requisitos de compilación: `cmake` (y opcionalmente `ninja`) para MapLibre Native, que se compila desde C++ la primera vez (~10 min). Sin `sudo`: `uv tool install cmake ninja`.

```bash
CMAKE_GENERATOR=Ninja cargo run --release -p kepler-desktop                                  # binario: kepler-centro
KEPLER_SERVIDOR=http://otra-ip:8000 cargo run --release -p kepler-desktop
```

## Pantallas

| Pestaña | Qué hace |
|---|---|
| **Panel** | Telemetría (8 indicadores reales), avisos, misiones (detalle y **nueva misión**), POIs por categoría con drill-down, objetos con radar por categoría, personas, registros, rutas, consejo del día, explorador, distancia semanal y **Novedades de Cortex** |
| **En vivo** | Cada Unidad de Campo: vídeo con cajas de YOLO, FPS, latencia y telemetría del dispositivo; «ver en el mapa» |
| **Mapa** | Offline (PMTiles), capas de POIs, personas, objetos, alertas de otros, rutas y unidades; ficha al hacer clic; rastro de misión; **planificador de rutas** con análisis del corredor |
| **Archivos** | Hallazgos por misión y tipo, búsqueda, detalle editable con **etiquetas**, comparador de identidades, **taxonomía** |
| **Cortex** | Chat con la IA local (streaming, herramientas sobre tus datos), historial de conversaciones |
| **Bitácora** | Notificaciones con filtros y **Deep-Dive** de Cortex por entrada |

Además: campana y toasts, **perfil** (clic en el nombre o la foto: datos, foto, avatar de Cortex, calzado, contraseña), **estado del sistema** (clic en SERVIDOR) y «Acerca de».

## Estructura

| Ruta | Contenido |
|---|---|
| `build.rs` | Genera `ui/tema.slint` desde `design/tokens.json` (solo si cambia) y compila la UI (estilo `fluent-dark` para los widgets estándar) |
| `ui/tema.slint` | **Generado**: no editar a mano, cambiar `design/tokens.json` |
| `ui/componentes.slint` | Tarjeta, Logo con glow, Campo, CampoTexto, Opciones, Botón, Indicador, Barra, Pastilla |
| `ui/estado.slint` | Global `Estado` que rellena Rust y leen las pantallas |
| `ui/cabecera.slint` | Pestañas, estado del servidor y del enlace en vivo, campana, usuario |
| `ui/dashboard.slint` · `ui/tarjetas.slint` | Panel y sus tarjetas |
| `ui/vivo.slint` · `ui/mapa.slint` · `ui/archivos.slint` · `ui/cortex.slint` · `ui/notificaciones.slint` | Pestañas |
| `ui/misiones.slint` · `ui/perfil.slint` · `ui/acerca.slint` · `ui/login.slint` | Ventanas: misión, nueva misión, perfil, taxonomía, sistema, «Acerca de»; login |
| `src/api.rs` | Cliente de kepler-server: sesión por usuario, renovación del token, NDJSON en streaming, errores |
| `src/panel.rs` | Arranque, login, carga del dashboard (cada 60 s), enlace (cada 10 s), cierre por inactividad, navegación |
| `src/tarjetas.rs` | Tarjetas del panel: radar, POIs por categoría, personas, rutas, consejo del día |
| `src/en_vivo.rs` · `src/vivo.rs` | WebSocket `/v1/en-vivo` (protobuf) y la vista de las Unidades de Campo |
| `src/mapa.rs` · `src/vista_mapa.rs` | MapLibre Native en su hilo (render a imagen) y la pestaña del mapa con el planificador |
| `src/archivos.rs` · `src/imagenes.rs` | Archivos, detalle, etiquetas, comparador; fotos reducidas fuera del hilo de UI con caché |
| `src/cortex.rs` · `src/misiones.rs` | Chat, reporte, Deep-Dive y Markdown simplificado; detalle y ciclo de vida de misiones |
| `src/bitacora.rs` · `src/perfil.rs` | Notificaciones; perfil, taxonomía y estado del sistema |
| `src/modelos.rs` | Respuestas de la API |
| `examples/unidad_campo.rs` | Unidad de Campo simulada para probar sin iPhone |

## Comportamiento

- **Sesión solo en memoria**, como el `sessionStorage` de la v0.7: cerrar la app o 15 min sin actividad (ratón/teclado) vuelve al login y revoca el token. El token se renueva solo antes de caducar y ante un 401.
- **Sin GPS**: la ubicación se aproxima por IP (`/v1/geo/ip`) una vez por sesión, para clima, aire y el contexto de Cortex.
- **Nunca valores inventados**: un dato que falta se muestra `—` con punto gris.
- **En vivo**: cada evento (misión, peligro reportado por otro explorador, captura) recarga notificaciones, dashboard y mapa; lo nuevo sale como toast (los críticos se quedan hasta cerrarlos). El vídeo de las unidades solo se pide con su pestaña abierta.
- **Mapa offline**: la primera vez descarga el PMTiles de la región (`/v1/mapas`) a `~/.local/share/kepler/mapas`; luego no necesita red. Render ~22 ms por fotograma al arrastrar (≈45 fps).
- **Ediciones**: la fila completa con la versión siguiente por `/v1/sync/subir` (misma regla de conflictos que el iPhone); si otro dispositivo lo cambió antes, gana el servidor y se avisa.
- **Cortex** corre en la LAN (Ollama, `qwen3.5:9b`): ~6 s una pregunta con herramientas, ~5 s el reporte, ~7 s documentar una misión, ~11 s un Deep-Dive.
- **Hilos**: la UI nunca espera a la red; todo va en tokio y vuelve con `upgrade_in_event_loop` (los structs de Slint con imágenes no son `Send`: se construyen en el hilo de la UI).

Capturas en `design/reference/escritorio/`.

## Pendiente

- Empaquetado (Linux y macOS) con la licencia BSD-2 de MapLibre Native junto al binario.

## Probar sin iPhone

```bash
KEPLER_USUARIO=<usuario> KEPLER_CONTRASENA=<clave> \
  cargo run --release -p kepler-desktop --example unidad_campo -- models/onnx/prueba-bus.jpg 120
```

Despega una misión y envía GPS (1 Hz), estado (cada 2 s) y vídeo (5 fps, recortes de la foto) con detección en el servidor; al terminar completa la misión.
