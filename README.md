<div align="center">

# 🔭 K E P L E R

### Sistema de Reconocimiento Visual Estelar con IA

<p align="center">
  <img src="https://img.shields.io/badge/Fase-Entrenamiento_Terrestre-cyan?style=for-the-badge&logo=target&logoColor=black" alt="Fase">
  <img src="https://img.shields.io/badge/Estado-Activo-green?style=for-the-badge&logo=statuspage&logoColor=black" alt="Estado">
  <img src="https://img.shields.io/badge/Versión-0.7.0_Beta-blue?style=for-the-badge&logo=semver&logoColor=white" alt="Versión">
</p>

```
██╗  ██╗███████╗██████╗ ██╗     ███████╗██████╗ 
██║ ██╔╝██╔════╝██╔══██╗██║     ██╔════╝██╔══██╗
█████╔╝ █████╗  ██████╔╝██║     █████╗  ██████╔╝
██╔═██╗ ██╔══╝  ██╔═══╝ ██║     ██╔══╝  ██╔══██╗
██║  ██╗███████╗██║     ███████╗███████╗██║  ██║
╚═╝  ╚═╝╚══════╝╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝
```
</div>

---

## 🌌 Acerca del Proyecto

**KEPLER** es una plataforma operativa real asistida por Inteligencia Artificial, diseñada para enfrentarse a los desafíos de la exploración de campo. Inspirada en los sistemas de telemetría y HUDs espaciales, su propósito va mucho más allá de lo estético: fue concebida como una herramienta funcional para la búsqueda de recursos y el análisis geológico.

El ecosistema KEPLER está siendo desarrollado y probado actualmente en la Tierra, sirviendo como banco de pruebas para condiciones extremas, con la mira puesta en su futura aplicabilidad en la **exploración planetaria y misiones extraterrestres**. El proyecto se consolida en un ecosistema de software dedicado compuesto por:
- Un **Centro de Control (Desktop)** ultra-ligero que se conecta a un backend local de Python para procesar visión artificial (YOLOv26) a extrema velocidad.
- Una **Unidad de Campo Móvil** nativa (React Native) para verdadera exploración en terreno usando las cámaras y sensores del hardware del celular.

Con componentes construidos desde cero en HTML/CSS integrados mediante Vite, el diseño de KEPLER es radicalmente modular. Integra widgets de mapas satelitales tácticos 3D, chat conversacional nativo con LLMs (Llama 3/Mistral) para asistencia científica, biometría viva y un sistema avanzado de bases de datos distribuidas (Supabase) para asegurar que ningún hallazgo se pierda, incluso sin conexión a internet.

---

## �🌍 El Problema

La exploración de entornos desconocidos —ya sea un terreno geológico remoto, un paisaje extraterrestre simulado o una zona de difícil acceso— enfrenta un obstáculo fundamental: **la brecha entre la percepción humana y la inteligencia analítica disponible en campo.**

Hoy, un explorador en terreno se encuentra con estas limitaciones:

- **Datos crudos sin contexto.** Una roca, un mineral, una formación: el ojo humano observa, pero sin un laboratorio no puede identificar, clasificar ni comparar en tiempo real.
- **Conectividad intermitente o nula.** En zonas remotas, enviar datos a la nube para análisis significa esperar minutos u horas, o simplemente no tener respuesta.
- **Herramientas fragmentadas.** GPS en una app, cámara en otra, notas en papel, análisis después en la oficina. No existe un sistema unificado que conecte la visión, la ubicación, la telemetría y la inteligencia artificial en un solo flujo de trabajo.
- **Pérdida de conocimiento.** Sin un registro estructurado e inmediato, los hallazgos se pierden, se descontextualizan o nunca se correlacionan con observaciones anteriores.

El resultado: **un explorador con tecnología del siglo XXI pero flujos de trabajo del siglo XX.**

---

## 🚀 La Solución: KEPLER

**KEPLER** es una plataforma integral de exploración asistida por Inteligencia Artificial que actúa como el **sistema operativo de campo** para exploradores de próxima generación.

Cierra la brecha entre la recolección de datos crudos y la **inteligencia accionable en tiempo real**, fusionando cuatro capacidades críticas en una sola interfaz:

### 🔬 1. Visión que Comprende
No es solo una cámara. KEPLER ejecuta modelos de detección de objetos (YOLOv11) **directamente en el dispositivo** del explorador — sin necesidad de internet. Apunta tu cámara a una roca y en milisegundos sabrás qué tipo de mineral es, su relevancia geológica y si ya lo has catalogado antes.

### 🧠 2. Un Cerebro que Razona
El módulo **Cortex AI** (LLM local con Mistral 7B) no solo detecta, sino que *entiende*. Puedes preguntarle: _"¿Qué relación tiene este mineral con los que encontré en la misión anterior?"_ y recibirás un análisis contextual completo con datos de tu historial de exploración.

### 🗺️ 3. Mapeo que Conecta
Cada hallazgo se geolocaliza automáticamente en un **mapa táctico 3D**. Visualiza patrones de distribución, compara zonas exploradas, y genera descripciones de terreno asistidas por IA combinando GPS + imágenes satelitales + modelos de lenguaje.

### 🔄 4. Sincronización que No Falla
Opera desde el **Centro de Control** (Web/Desktop) para planificar misiones, o desde la **Unidad de Campo** (Mobile AR) para ejecutarlas. Todo se sincroniza en tiempo real cuando hay conexión, y sigue funcionando offline cuando no la hay.

> 🎯 **Misión:** *"Iluminar lo desconocido"* — Transformar lo inexplorado en conocimiento estructurado mediante la fusión de visión artificial y exploración humana.

---

## ⚙️ Arquitectura Híbrida (Edge + Cloud)

KEPLER no depende de la nube para funcionar. Su arquitectura está diseñada para **operar en el borde** (edge computing) con sincronización inteligente:

```
┌────────────────────────────────────────────────────────┐
│                    CENTRO DE CONTROL                   │
│        Web (Vite + JS) · Desktop (Electron)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │Dashboard │ │ Archives │ │ HoloMap  │ │ AI Chat   │ │
│  │Telemetría│ │ Búsqueda │ │ 3D Tác.  │ │ Streaming │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
└──────────────────────┬─────────────────────────────────┘
                       │ WebSocket / REST
              ┌────────┴────────┐
              │   SUPABASE DB   │
              │  PostgreSQL +   │
              │  Vector Search  │
              │  + Realtime     │
              └────────┬────────┘
                       │
┌──────────────────────┴─────────────────────────────────┐
│                   UNIDAD DE CAMPO                      │
│              Mobile (React Native / Expo)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ AR Cam   │ │ GPS +    │ │ Offline  │ │ YOLO      │ │
│  │ Scanner  │ │ Mapping  │ │ Cache    │ │ On-Device │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
└────────────────────────────────────────────────────────┘
              ┌────────────────────┐
              │   BACKEND IA       │
              │  FastAPI + Python  │
              │  Mistral 7B (LLM)  │
              │  CLIP (Embeddings) │
              │  Ollama Runtime    │
              └────────────────────┘
```

---

---

## 📸 Galería del Sistema

<div align="center">
  <img src="capture/1.png" width="100%" alt="Vista Principal del Centro de Control">
  <p><em>Vista Principal del Centro de Control</em></p>
  
  <br>

  <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 2%; margin-top: 20px;">
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/2.png" width="100%" alt="Captura 2">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/3.png" width="100%" alt="Captura 3">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/5.png" width="100%" alt="Captura 5">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/6.png" width="100%" alt="Captura 6">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/7.png" width="100%" alt="Captura 7">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/8.png" width="100%" alt="Captura 8">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/9.png" width="100%" alt="Captura 9">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/10.png" width="100%" alt="Captura 10">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/11.png" width="100%" alt="Captura 11">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/13.png" width="100%" alt="Captura 13">
    </div>
    <div style="width: 49%; margin-bottom: 15px;">
      <img src="capture/14.png" width="100%" alt="Captura 14">
    </div>
  </div>
</div>

---

## 🛠️ Capacidades del Sistema

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| 🔭 **Visual Core** | ✅ Activo | Detección de objetos en tiempo real (YOLOv11 Nano en browser). |
| 🧠 **Cortex AI** | ✅ Activo | Análisis semántico profundo (CLIP + Mistral 7B). |
| 🆔 **AI Re-ID** | 🆕 v0.7 | Re-identificación visual de personas y POIs usando CLIP + pgvector. |
| 💬 **AI Chat** | ✅ Activo | Chat streaming con intents inteligentes, tablas comparativas y títulos contextuales. |
| 🗺️ **HoloMap** | ✅ Activo | Mapa táctico 3D (MapLibre) con filtros Odradek y tracking GPS. |
| 📊 **Dashboard** | 🆕 v2 | Cards modulares, stats del explorador, POIs con drill-down, clima real, radar chart. |
| 📂 **Archives** | ✅ Activo | Base de datos vectorial de hallazgos. |
| 🤖 **Sentinel** | 🆕 v0.7 | Pipeline de auto-captura con ruteo inteligente de entidades detectadas. |
| 🔔 **Realtime** | ✅ Activo | Alertas en tiempo real vía WebSocket (Supabase Realtime). |
| 👤 **Perfil** | ✅ Activo | Gestión de usuario y personalización de avatar del asistente IA. |
| 🛡️ **Session Guard** | 🆕 Nuevo | Auto-logout por inactividad (15 min) y cierre de pestaña (sessionStorage). |
| 🌤️ **Weather** | 🆕 Nuevo | Clima real vía Open-Meteo API con clasificación KEPLER y cache. |
| 📍 **POIs** | 🆕 Nuevo | Puntos de Interés con 4 categorías, drill-down y detalle con coordenadas. |
| 👣 **Geotracking** | 🆕 v0.7 | Registro automático de rastro GPS (trail) por cada misión. |
| 📱 **Mobile AI** | ✅ Activo | Optimizaciones automáticas para móvil (256px, 1 hilo, sin precarga). |
| 📍 **GPS + IA** | ✅ Activo | Descripción automática de zona con GPS + Nominatim + Mistral. |

---

## 📊 Novedades v0.7.0 (Auto-Capture & AI Re-ID)

### Pipeline de Auto-Captura (Smart Sentinel)
Evolución del sistema Sentinel para una exploración fluida:
- **Ruteo Inteligente** — Las detecciones se clasifican y guardan automáticamente en la tabla correcta:
  - `person` → **Personas Encontradas** (con metadatos biográficos)
  - `building/bench/tent/hydrant...` → **Puntos de Interés** (POI)
  - Otros objetos → **Objetos de Exploración**
- **Eliminación de Duplicados** — Integrado con el sistema de Re-ID para evitar registros repetidos del mismo objeto/persona en una misma zona.

### AI Re-Identification (Re-ID)
Sistema de "memoria visual" persistente basado en Deep Learning:
- **Embeddings CLIP** — Generación de vectores de 512 dimensiones para cada captura importante.
- **Búsqueda Vectorial** — Uso de `pgvector` en Supabase para búsqueda por similitud de coseno en milisegundos.
- **Identificación en Tiempo Real** — El sistema reconoce si una persona o POI ya ha sido registrado previamente, mostrando su identidad histórica en lugar de crear un rastro nuevo.

### Geotracking & Mission Summary
- **Trail GPS** — Registro automático de coordenadas cada 10 segundos durante la misión.
- **Resumen Visual** — Nuevo modal de cierre de misión con estadísticas detalladas (objetos, POIs, personas, rutas y puntos de rastro registrados).

---

## 📊 Novedades v0.6.0 (Dashboard v2 + Explorer Stats)

### Dashboard Modular
Rediseño completo del dashboard en **módulos independientes** (cada card es un archivo JS separado):
- **Misiones Recientes** — Tabla con badges de estado y scrolling oculto
- **Objetos Encontrados** — Tabla + Radar Chart (Canvas API) por categoría
- **POIs** — Drill-down interactivo: Categorías → Items → Detalle con coords/riesgo/zona
- **Personas Detectadas** — Tabla con avatares
- **Rutas Planificadas** — Distancia + seguridad + tipo de terreno
- **Alertas** — Módulo de alertas accionables anidadas con listas dinámicas y redirección a modal de detalle interactivo.

### Explorer Stats (Backend Microservice)
Nuevo endpoint `GET /api/explorer/stats` que calcula:
- **👟 Desgaste del Calzado** — Acumulativo (km × terreno × clima)
- **⚡ Resistencia Física** — Dinámica (baja con misiones, sube con descanso)
- Clima real vía **Open-Meteo API** con geolocalización GPS → IP fallback
- Barras de progreso con color dinámico (verde/amarillo/rojo)

### POIs (Puntos de Interés)
Nueva tabla `puntos_interes` con 4 categorías (`poi_categorias`):
- 🏥 Centros de salud · ⛺ Puntos de descanso · 🔬 Sitios de muestra · ⚠️ Sitios Peligroso
- Drill-down: click categoría → lista de items → detalle con descripción, nivel de riesgo, coordenadas y estado
- Preparado para integración con AR (lat/lng, metadata JSONB, imagen)

### Session Guard
Gestión automática de sesión:
- `sessionStorage` en Supabase: sesión expira al cerrar pestaña/ventana
- Timer de inactividad: logout automático tras 15 minutos sin interacción
- Navegación entre secciones preserva la sesión correctamente

---

## 💬 Sistema de Chat IA

### Características v0.4:
- **Streaming en tiempo real**: Respuestas fluidas con animación typewriter.
- **Detección de Intents**: Sistema ReAct que identifica automáticamente consultas de misiones, objetos, comparaciones, etc.
- **Tablas Comparativas**: Genera tablas markdown al pedir comparaciones entre misiones u objetos.
- **Historial en Español**: Títulos generados automáticamente con emojis temáticos (🔬, 🗺️, 🚀, 💎).
- **Avatar Personalizable**: Elige entre presets de emojis o una imagen personalizada desde tu perfil.
- **Modal Móvil**: Interfaz adaptada con FAB y menú hamburguesa funcional.

---

## 🔔 Sistema de Notificaciones

KEPLER incluye un sistema de notificaciones en tiempo real para mantener a los usuarios informados de eventos del sistema:

### Características:
- **Notificaciones Globales**: Funcionan en todas las secciones (Dashboard, Archivos, Taxonomía, AR).
- **Sincronización Cloud**: Guardado en Supabase (`user_notifications`) para acceso cross-device.
- **Modo Offline**: Fallback automático a localStorage si no hay conexión.
- **Bitácora Avanzada**: Filtros por tipo (Critical, Alert, Success) y contadores dinámicos.
- **Timeline**: Agrupación cronológica inteligente.
- **Borrado Seguro**: Confirmación mediante modales del sistema (System Modals).
- **Atribución de Usuario**: Cada notificación muestra quién realizó la acción (`👤 por [usuario]`).

### Tipos de Notificaciones:
| Tipo | Icono | Duración |
|------|-------|----------|
| **Critical** | 🚨 | Persistente (requiere cierre manual) |
| **Warning** | ⚠️ | 7 segundos |
| **Success** | ✅ | 4 segundos |
| **Info** | ℹ️ | 5 segundos |

### Eventos Realtime Monitoreados:
- 📡 Nueva misión creada
- 🚀 Misión activada
- ✅ Misión completada (con estadísticas detalladas)
- ⚠️ Misión eliminada

### Acceso a la Bitácora:
- **Desktop**: Clic en el ícono de campana 🔔 en el header
- **Mobile**: Menú hamburguesa → "🔔 Notificaciones"

---

## 📚 Documentación Técnica

La documentación está organizada en `docs/backend/` y `docs/frontend/` con un [índice central](docs/README.md):

**Backend:**
*   **[⚙️ API Endpoints](docs/backend/api-endpoints.md)**: Stack, endpoints FastAPI, Docker, despliegue.
*   **[📊 Explorer Stats](docs/backend/explorer-stats.md)**: Algoritmo de Resistencia y Desgaste.
*   **[🌤️ Weather Service](docs/backend/weather-service.md)**: Open-Meteo API, categorías, cache.

**Frontend:**
*   **[📊 Dashboard](docs/frontend/dashboard.md)**: Header, módulos, sidebar, stats, responsive.
*   **[👤 Profile](docs/frontend/profile.md)**: Perfil, avatares, Mixed Content fix.
*   **[🛡️ Session Guard](docs/frontend/session-guard.md)**: Auto-logout, sessionStorage.
*   **[🔑 Auth & Servicios](docs/frontend/auth-y-servicios.md)**: Auth, geolocalización GPS/IP.

**General:**
*   **[🗄️ Database](docs/backend/database.md)**: Esquema PostgreSQL, migraciones.
*   **[🧠 Hybrid AI](docs/ia.md)** · **[🔔 Realtime](docs/realtime.md)** · **[⏳ Loading](docs/loading-system.md)** · **[🗺️ Maps](docs/web/map.md)**

---

## 🚀 Inicio Rápido

### Requisitos Previos
*   **Docker** (Recomendado para servicios backend/db)
*   **Node.js 18+**
*   **Ollama** (Ejecutándose en puerto 11434 para funciones de chat)

### Ejecución Automática

```bash
# Iniciar stack completo (DB + Backend + Frontend)
./start-dev.sh
```

### 🌐 Acceso Remoto (Salidas de Campo)

Para acceder a KEPLER desde tu móvil mientras estás fuera:

```bash
# Opción 1: Todo en uno (inicia servicios + túneles)
./start-remote.sh

# Opción 2: Solo túneles (si ya tienes los servicios corriendo)
./tunnel.sh start
```

El script mostrará URLs públicas temporales y un código QR para escanear con tu móvil.

Para más detalles, consulta la **[Guía de Inicio](docs/guia-inicio.md)**.

---

## 📁 Estructura del Proyecto

```
KEPLER/
├── apps/
│   ├── web/               # Interfaz Holográfica (Vite + Vanilla JS)
│   │   └── src/features/  # Módulos: AR, Dashboard, Login, Archives
│   ├── mobile/            # App React Native (Expo)
│   │   └── src/
│   │       ├── features/  # Dashboard, Map (modular)
│   │       ├── screens/   # Re-exports desde features
│   │       ├── components/# Header compartido, Icons
│   │       └── hooks/     # useSharedMenu, useApi
│   └── desktop/           # Electron wrapper
├── packages/
│   └── shared/            # Tipos, constantes, utilities
├── backend/               # Cerebro Analítico (FastAPI + Python)
│   └── app/               # Lógica de IA y Endpoints
├── deployment/            # Configuración Docker
└── docs/                  # Manuales y Referencias
```

---

## 🤝 Contribuciones

El proyecto es Open Source bajo la licencia MIT. Las contribuciones son bienvenidas, especialmente en áreas de:
*   Optimización de inferencia en navegador (WASM).
*   Expansión del dataset geológico.
*   Mejoras de accesibilidad en la UI holográfica.

---

<div align="center">

**KEPLER PROJECT**
*Explorando lo desconocido, un frame a la vez.*

Desarrollado con 💙 y ☕ por el equipo de ingeniería.

</div>