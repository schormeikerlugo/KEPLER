# Centro de Control (escritorio)

App nativa en Rust + [Slint](https://slint.dev) 1.18 (renderer OpenGL/femtovg). Ver la elección en `prototipos/README.md`.

```bash
cargo run --release -p kepler-desktop                                  # binario: kepler-centro
KEPLER_SERVIDOR=http://otra-ip:8000 cargo run --release -p kepler-desktop
```

## Estructura

| Ruta | Contenido |
|---|---|
| `build.rs` | Genera `ui/tema.slint` desde `design/tokens.json` (solo si cambia) y compila la UI |
| `ui/tema.slint` | **Generado**: no editar a mano, cambiar `design/tokens.json` |
| `ui/componentes.slint` | Tarjeta, Logo con glow, Campo, Botón, Indicador, Barra, Pastilla |
| `ui/estado.slint` | Global `Estado` que rellena Rust y leen las pantallas |
| `ui/login.slint` · `ui/dashboard.slint` | Pantallas |
| `src/api.rs` | Cliente de kepler-server: login por usuario (`/v1/sesion`), renovación del token, errores |
| `src/panel.rs` | Login, carga del dashboard (cada 60 s), enlace con el servidor (cada 10 s), cierre por inactividad |
| `src/modelos.rs` | Respuestas de la API |

## Comportamiento

- **Sesión solo en memoria**, como el `sessionStorage` de la v0.7: cerrar la app o 15 min sin actividad (ratón/teclado) vuelve al login y revoca el token.
- El token se renueva solo antes de caducar y ante un 401.
- **Sin GPS**: la ubicación se aproxima por IP (`/v1/geo/ip`) una vez por sesión, para clima y aire.
- **Telemetría** (8 indicadores reales): temperatura, humedad, viento, UV, presión, aire, PM2.5 y latencia con el servidor. Sin datos se muestra `—` con punto gris: nunca valores inventados.
- Dashboard: avisos (POIs de riesgo, personas hostiles, misiones sin documentar, objetos no reconocidos), últimas misiones, registros, estado del explorador y distancia semanal.

Capturas en `design/reference/escritorio/`.

## Pendiente

- Notificaciones, archivos, mapa (MapLibre Native por OpenGL), vista en vivo de la Unidad de Campo, chat.
- Pantalla «Acerca de» con la atribución de Slint (requisito de su licencia royalty-free antes de distribuir).
