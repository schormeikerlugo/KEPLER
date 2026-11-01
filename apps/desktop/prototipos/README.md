# Prototipos del Centro de Control (paso 6)

La misma pantalla en dos frameworks de UI en Rust para elegir con datos: header con logo y glow, 8 indicadores de telemetría en vivo (10 Hz), gráfico de pulso desplazándose a 60 Hz, tarjeta del explorador con barras animadas. Colores y medidas de `design/tokens.json`; datos simulados idénticos (`sim.rs`).

Capturas en `design/reference/prototipos/` (junto a la PWA de referencia).

```bash
cd slint && cargo run --release    # o: cd iced && cargo run --release
```

## Medidas (2026-10-31, Ryzen 7 5700X + RTX 3060, Hyprland, ventana 1440×900)

| | Slint 1.18.1 | Iced 0.14.0 |
|---|---|---|
| CPU con el gráfico a 60 Hz | 5,7 % de un núcleo | **3,5 %** |
| RAM | **279 MB** | 337 MB |
| Binario release | 17,7 MB | **14,1 MB** |
| Compilación desde cero (release) | 1 min 42 s | **55 s** |
| Recompilar tras cambiar la UI (release) | ~18 s | ~19 s |
| Líneas de código | 252 `.slint` + 58 Rust | 311 Rust |

## Fidelidad con la PWA

| Detalle | Slint | Iced |
|---|---|---|
| Colores, radios, sombras/glow de cajas, degradados | ✅ | ✅ |
| Fuente Jura variable | ✅ directa | ⚠️ solo con instancias estáticas (`design/fonts/Jura-*.ttf`) |
| Espaciado entre letras (logo, etiquetas) | ✅ `letter-spacing` | ❌ no existe (logo con espacios, etiquetas apretadas) |
| Sombra/glow de texto | ❌ (halo detrás) | ❌ (halo detrás) |
| Desenfoque de fondo (vidrio del login) | ❌ | ❌ |
| Animaciones/transiciones | ✅ `animate` declarativo | ⚠️ manuales en `update` |

## Otros factores

| | Slint | Iced |
|---|---|---|
| Mapa MapLibre Native (OpenGL/Vulkan) | ✅ el renderer OpenGL permite dibujar por debajo/encima de la UI en el mismo contexto (`set_rendering_notifier`) | ⚠️ wgpu: habría que renderizar a textura y copiarla (interop complejo) |
| Iterar el diseño | Vista previa en vivo (`slint-viewer`, LSP) sin recompilar | Recompilar |
| Arquitectura | UI declarativa + lógica Rust (propiedades, modelos, callbacks) | Todo en Rust, estilo Elm (mensajes), encaja con eventos del WebSocket |
| API | 1.x estable, empresa detrás (SixtyFPS) | 0.x, cambios incompatibles entre versiones |
| Licencia | Royalty-free para escritorio con atribución (o GPLv3) | MIT |

## Recomendación: Slint

Fidelidad visual mayor (letter-spacing y fuente variable son parte del estilo KEPLER), integración natural del mapa MapLibre por OpenGL, API estable y vista previa en vivo para afinar el diseño. La diferencia de CPU (2 puntos de un núcleo) es irrelevante para un panel de control.
