<div align="center">

# 🔭 K E P L E R

### Sistema de Reconocimiento Visual Estelar con IA

<p align="center">
  <img src="https://img.shields.io/badge/Fase-Entrenamiento_Terrestre-cyan?style=for-the-badge&logo=target&logoColor=black" alt="Fase">
  <img src="https://img.shields.io/badge/Estado-Activo-green?style=for-the-badge&logo=statuspage&logoColor=black" alt="Estado">
  <img src="https://img.shields.io/badge/Versión-0.4.0_Beta-blue?style=for-the-badge&logo=semver&logoColor=white" alt="Versión">
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

## 🌌 ¿Qué es KEPLER?

**KEPLER** (anteriormente conocido como Mars-Sight AR) es una plataforma avanzada de exploración asistida por Inteligencia Artificial. Diseñada con una estética holográfica (HUI), su objetivo es asistir a astronautas y rovers en la **identificación, clasificación y análisis en tiempo real** de formaciones geológicas y artefactos en entornos desconocidos.

> 🚀 **Misión:** Proveer ojos inteligentes a la exploración espacial humana y robótica.

---

## 🛠️ Capacidades del Sistema

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| 🔭 **Visual Core** | ✅ Activo | Detección de objetos en tiempo real (YOLOv11 Nano en browser). |
| 🧠 **Cortex AI** | ✅ Activo | Análisis semántico profundo (CLIP + Mistral 7B). |
| 💬 **AI Chat** | ✅ Activo | Chat streaming con intents inteligentes, tablas comparativas y títulos contextuales. |
| 🗺️ **HoloMap** | ✅ Activo | Mapa táctico 3D (MapLibre) con filtros Odradek y tracking GPS. |
| 📊 **Dashboard** | ✅ Activo | Telemetría vital, gestión de misiones y chat integrado. |
| 📂 **Archives** | ✅ Activo | Base de datos vectorial de hallazgos. |
| 🔔 **Realtime** | ✅ Activo | Alertas en tiempo real vía WebSocket (Supabase Realtime). |
| 👤 **Perfil** | ✅ Activo | Gestión de usuario y personalización de avatar del asistente IA. |

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

La documentación ha sido reorganizada para facilitar el desarrollo:

*   **[🎨 Frontend Architecture](docs/frontend.md)**: UI Design, Animaciones Holográficas, Vite.
*   **[🗺️ Map System](docs/map.md)**: MapLibre, Odradek Theme, Tile Proxy & Layers.
*   **[⚙️ Backend & AI Services](docs/backend.md)**: FastAPI, Python, Mistral 7B, CLIP.
*   **[⚡ Database & Cloud](docs/supabase.md)**: Esquema PostgreSQL, Auth, Vector Search.
*   **[🧠 Hybrid AI System](docs/ia.md)**: Detalles sobre la integración Edge-Cloud AI.
*   **[🔔 Realtime & Notificaciones](docs/realtime.md)**: WebSocket, Alertas, Bitácora.
*   **[📊 Dashboard & UI Components](docs/dashboard.md)**: Header Refactor, Command Menu, System Status.
*   **[⏳ Loading & Caching System](docs/loading-system.md)**: Initialization tasks, Model Preloading.

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
├── frontend/          # Interfaz Holográfica (Vite + Vanilla JS)
│   └── src/features/  # Módulos: AR, Dashboard, Login, Archives
├── backend/           # Cerebro Analítico (FastAPI + Python)
│   └── app/           # Lógica de IA y Endpoints
├── deployment/        # Configuración Docker
└── docs/              # Manuales y Referencias
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
