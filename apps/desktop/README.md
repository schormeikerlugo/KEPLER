# Centro de Control (escritorio)

App nativa en Rust + [Slint](https://slint.dev) 1.18 (renderer OpenGL/femtovg). Ver la elección en `prototipos/README.md`.

Requisitos de compilación: `cmake` (y opcionalmente `ninja`) para MapLibre Native, que se compila desde C++ la primera vez (~10 min). Sin `sudo`: `uv tool install cmake ninja`.

```bash
CMAKE_GENERATOR=Ninja cargo run --release -p kepler-desktop                                  # binario: kepler-centro
KEPLER_SERVIDOR=http://otra-ip:8000 cargo run --release -p kepler-desktop
```

## Estructura

| Ruta | Contenido |
|---|---|
| `build.rs` | Genera `ui/tema.slint` desde `design/tokens.json` (solo si cambia) y compila la UI |
| `ui/tema.slint` | **Generado**: no editar a mano, cambiar `design/tokens.json` |
| `ui/componentes.slint` | Tarjeta, Logo con glow, Campo, Botón, Indicador, Barra, Pastilla |
| `ui/estado.slint` | Global `Estado` que rellena Rust y leen las pantallas |
| `ui/cabecera.slint` | Cabecera: pestañas Panel/Bitácora, estado del servidor y del enlace en vivo, campana, usuario |
| `ui/login.slint` · `ui/dashboard.slint` · `ui/notificaciones.slint` · `ui/archivos.slint` · `ui/acerca.slint` | Pantallas, panel de la campana, toasts, bitácora y «Acerca de» |
| `src/api.rs` | Cliente de kepler-server: login por usuario (`/v1/sesion`), renovación del token, errores |
| `src/panel.rs` | Login, carga del dashboard (cada 60 s), enlace con el servidor (cada 10 s), cierre por inactividad |
| `src/en_vivo.rs` | WebSocket `/v1/en-vivo` (protobuf) como Centro de Control: ping cada 20 s, reconexión con espera creciente |
| `src/bitacora.rs` | Campana (20 últimas), toasts de lo nuevo, bitácora paginada con filtros, marcar leídas |
| `src/archivos.rs` | Archivos: misiones, rejilla paginada, detalle editable (sube la fila completa con la versión siguiente por `/v1/sync/subir`), comparador de identidades |
| `src/imagenes.rs` | Fotos vía `/v1/imagenes`: decodificadas y reducidas fuera del hilo de la UI, caché en memoria por sesión |
| `src/mapa.rs` | MapLibre Native en su hilo (no es `Send`): estilo Odradek con PMTiles y glifos locales, capas propias en GeoJSON, cámara Web Mercator |
| `src/vista_mapa.rs` | Pantalla del mapa: descarga del PMTiles, arrastre, zoom bajo el cursor, capas, clic en un punto, rastro de misión |
| `src/vivo.rs` | Vista en vivo: unidades de campo (GPS, estado, fotogramas, detecciones), vídeo decodificado fuera del hilo de UI descartando fotogramas si va atrasado, capa de unidades en el mapa |
| `examples/unidad_campo.rs` | Unidad de Campo simulada para probar sin iPhone |
| `src/modelos.rs` | Respuestas de la API |

## Comportamiento

- **Sesión solo en memoria**, como el `sessionStorage` de la v0.7: cerrar la app o 15 min sin actividad (ratón/teclado) vuelve al login y revoca el token.
- El token se renueva solo antes de caducar y ante un 401.
- **Sin GPS**: la ubicación se aproxima por IP (`/v1/geo/ip`) una vez por sesión, para clima y aire.
- **Telemetría** (8 indicadores reales): temperatura, humedad, viento, UV, presión, aire, PM2.5 y latencia con el servidor. Sin datos se muestra `—` con punto gris: nunca valores inventados.
- **En vivo**: cada evento (misión, peligro reportado por otro explorador, captura procesada) recarga notificaciones y dashboard; lo nuevo sale como toast (los críticos se quedan hasta cerrarlos).
- **Mapa** (offline): la primera vez descarga el PMTiles de la región (`/v1/mapas`) a `~/.local/share/kepler/mapas`; luego no necesita red. Estilo Odradek de la v0.7, glifos Noto Sans incluidos en el binario. Capas: POIs (por riesgo), personas (por hostilidad), objetos, alertas de otros exploradores; clic → ficha con foto; rastro GPS de una misión con encuadre automático. Render ~22 ms por fotograma al arrastrar (≈45 fps).
- **En vivo**: cada Unidad de Campo conectada (se detecta por sus mensajes; 10 s sin hablar = sin señal). Vídeo con las cajas de YOLO (del iPhone o del servidor, con pista y distancia LiDAR si la hay), FPS y latencia; batería, pulso, red, temperatura, cola de capturas, velocidad, altitud, rumbo y precisión; «ver en el mapa» centra en su posición y dibuja su recorrido. El vídeo solo se pide al servidor con esta pestaña abierta.
- **Archivos**: misiones a la izquierda (todas, sin misión, cada misión), pestañas Objetos/Personas/POIs, búsqueda, fotos en miniatura (6 en paralelo). Detalle editable: nombre, categoría y subcategoría, hostilidad, riesgo, estado, rasgos, notas, visibilidad; eliminar pide confirmación. Si otro dispositivo lo cambió antes, gana el servidor y se avisa.
- **Comparador de identidades**: personas sueltas con parecidos del 60 al 78 % (por debajo del Re-ID automático), foto contra foto, «no es la misma», «vincular identidad».
- **Bitácora**: filtros por tipo y «solo sin leer», paginación de 50 en 50.
- Dashboard: avisos (POIs de riesgo, personas hostiles, misiones sin documentar, objetos no reconocidos), últimas misiones, registros, estado del explorador y distancia semanal.

Capturas en `design/reference/escritorio/`.

## Pendiente

- Etiquetas de objetos; chat (paso 8).
- Licencia BSD-2 de MapLibre Native junto al binario al empaquetar.
- Deep-Dive (análisis IA de una entrada de la bitácora), con kepler-ai.

## Probar sin iPhone

```bash
KEPLER_USUARIO=<usuario> KEPLER_CONTRASENA=<clave> \
  cargo run --release -p kepler-desktop --example unidad_campo -- models/onnx/prueba-bus.jpg 120
```

Despega una misión y envía GPS (1 Hz), estado (cada 2 s) y vídeo (5 fps, recortes de la foto) con detección en el servidor; al terminar completa la misión.
