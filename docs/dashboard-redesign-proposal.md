# 🎨 Propuesta de Reestructuración UI/UX del Dashboard (Enfoque Táctico y Datos)

Para elevar KEPLER al siguiente nivel visual y funcional, estamos pivotando la filosofía del Dashboard: alejándonos de ser un simple "visor de cámara AR" para convertirlo en un **Centro de Comando de Datos y Telemetría Táctica**. El objetivo es proporcionar al explorador información predictiva y en tiempo real para tomar decisiones estratégicas al trazar o cruzar rutas de exploración.

Mantenemos nuestra estética core: **Sci-Fi Glassmorphism**, fondos oscuros mate, desenfoques (blur), tipografía `Jura` técnica, y acentos en cyan (`#00ffcc`) y azul neón (`#3fa8ff`).

---

## 1. Reconceptualización de la Telemetría (Panel Interactivo Fijo)

Actualmente tenemos 8 puntos de telemetría en forma de lista vertical. Para evitar el scroll interno y mantener el diseño modular intacto (permitiendo agregar nuevos paneles sin romper la grilla), debemos **categorizar y compactar** estos datos en bloques de altura y posición fija.

**Propuesta de Categorización (Grid 2x2 / Mini-Widgets):**

1. 🫀 **Biometría Crítica**: `BPM` (Ritmo Cardíaco) y `O2` (Nivel de Oxígeno). 
   *Estilo: Barras de progreso ultra-delgadas o gráficos de línea minimalistas (sparklines) bordeando el contenedor.*
2. 🔋 **Estado Hardware**: `PWR` (Batería de Traje/Rover) y `RAD` (Radiación Local). 
   *Estilo: Trazos circulares minimalistas que cambian a rojo brillante en estado crítico.*
3. � **Métricas de Ruta**: `DISTANCIA` (Recorrida) y `TRIPULACIÓN` (Aliados activos). 
   *Estilo: Números grandes y prolijos con flechas vectoriales de tendencia.*
4. 🌍 **Contexto Ambiental**: `TEMPERATURA` externa y `OBJ CERCANOS` no confirmados.

*Visualmente, estos 4 bloques/categorías encajarían en una cuadrícula ultra-limpia dentro del panel izquierdo, ocupando siempre el mismo espacio físico en la pantalla, independientemente de qué otros módulos se abran al centro.*

---

## 2. Expansión de Absorción de Datos (Integraciones a Futuro)

Para que el explorador tome decisiones tangibles de ruta, necesitamos ingerir datos del entorno real mediante APIs, transformando los "datos vacíos" en variables operativas.

### 🌪️ Módulo A: Sistema de Condición Atmosférica (API Clima)
*   **Concepto:** Integración con OpenWeatherMap o APIs meteorológicas satelitales.
*   **Datos Claves:** Velocidad/Ráfagas de viento (vital para vuelo de pequeños drones), visibilidad atmosférica, alertas de tormenta extrema.
*   **UI / UX:** Un pequeño widget transversal que, si el clima es severo, parpadea en color naranja de alerta (HUD Alert overrides).

### ⛰️ Módulo B: Perfilador Topográfico y Esfuerzo Físico
*   **Concepto:** Uso de APIs de elevación topográfica (Open Topo Data / Mapbox Elevation).
*   **Dinámica:** Al trazar una ruta "Punto A al Punto B" en el centro de control, el módulo calcula el desnivel positivo.
*   **UI / UX:** Un gráfico de montaña (área solapada) que cruza el desnivel *vs.* tu batería restante, prediciendo visualmente si tienes la energía necesaria para escalar esa colina.

### � Módulo C: Radar Táctico de Proximidad Constelacional
*   **Concepto:** Evolucionar el recuadro aburrido de "POIs Cercanos" a una brújula concéntrica o sonar.
*   **Datos Claves:** Mostrar dónde están los clústers de objetos sin categorizar para que el explorador rote hacia esa dirección.

---

## 3. Hoja de Ruta de Desarrollo (Roadmap Táctico)

1.  **Fase de Estabilización Fija:** Refactorizar el panel izquierdo actual para agrupar las 8 telemetrías en un Grid 2x2 estricto (categorizado) eliminando por completo la necesidad de un scrollbar temporal.
2.  **Fase Espacial Central:** Usar el enorme contenedor central (50% de la pantalla) para inyectar el **HoloMap 3D (MapLibre)** permanentemente, con herramientas de pin y trazado rápido.
3.  **Fase de Expansión de Sensores:** Escoger la primera API externa (Ej. Clima) y añadir su respectivo módulo de lectura en el Dashboard.
4.  **Fase Simbiosis IA:** Conectar el modelo Mistral para que genere conclusiones autónomas leyendo los módulos anteriores (Ej: *"Detecto terreno empinado y tormenta próxima; aconsejo cancelar ruta actual"*).

---

## 🎨 Prompt de Visión (Generación AI Concept Art)

Pega el siguiente texto en **Midjourney** (v6) o **DALL-E 3** para pre-visualizar cómo luciría este concepto radicalmente guiado a los datos:

> **Prompt:** `A high-end UI/UX dashboard design for an advanced planetary exploration system. Sci-fi glassmorphism style, dark matte background with translucent blurred panels. Neon cyan, vibrant aqua, and soft glowing blue accent colors. Jura font or modern technical typography. Left panel contains extremely compact 2x2 grid widgets showing grouped telemetry: biometrics (O2, BPM with neon sparklines) and equipment status (Radiation, Battery). The center dominates with a massive, highly detailed 3D tactical topographic map showing an exploration route, alongside a cross-section elevation mountain graph predicting battery drain. The right panel features a clean, seamless AI assistant chat interface and a glowing circular sonar radar showing nearby signal anomalies. Minimalist, insanely data-dense, cinematic lighting, zero camera feeds, purely abstract data visualization and tactical UI mapping. --ar 16:9 --stylize 250 --v 6.0`
