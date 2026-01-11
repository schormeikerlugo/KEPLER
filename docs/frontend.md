# 🖥️ Arquitectura Frontend (KEPLER UI)

## 🌌 Visión General
El Frontend de **KEPLER (anteriormente Mars-Sight AR)** es una Interfaz de Usuario Holográfica (HUI) diseñada para la exploración y análisis de datos en entornos espaciales simulados. Está construido con tecnologías web modernas, priorizando el rendimiento y la estética visual "Cyberpunk/Sci-Fi".

---

## 🛠️ Stack Tecnológico

*   **Core:** Javascript (Vanilla ES6+), HTML5, CSS3.
*   **Build Tool:** [Vite](https://vitejs.dev/) (Rápido, ligero y modular).
*   **Estilos:** CSS Puro (Variables CSS, Flexbox, Grid) + Efectos Glassmorphism.
*   **Fuentes:** [Jura](https://fonts.google.com/specimen/Jura) (Tipografía principal).
*   **Iconos:** SVG optimizados y Phosphor Icons (si aplica).

---

## 🧩 Estructura Modular

El proyecto sigue una arquitectura basada en **features** (características) para facilitar la escalabilidad:

```
frontend/src/
├── css/                  # Estilos Globales
│   ├── style.css         # Reset y bases
│   ├── tokens.css        # Variables (Colores, Espaciado, Efectos)
│   ├── fonts.css         # Definiciones de tipografía
│   └── holo-logo.css     # Componente reutilizable del logo
├── features/             # Módulos Funcionales
│   ├── login/            # Autenticación y Entrada
│   ├── dashboard/        # Panel Principal y Widgets
│   ├── ar/               # Vista de Realidad Aumentada (YOLO)
│   ├── archives/         # Galería y Base de Datos (Supabase)
│   ├── map/              # Mapa de Exploración (Leaflet.js)
│   └── taxonomia/        # Sistema de Clasificación
├── js/                   # Lógica Transversal
│   ├── auth.js           # Cliente Supabase Auth
│   ├── utils/            # Utilidades (Kalman Filter, Tracker)
│   ├── services/         # Servicios de estado (NotificationStore)
│   └── components/       # Componentes JS (ModalSystem, Notifications)
└── main.js               # Punto de entrada y Router
```

---

## 🎨 Sistema de Diseño "KEPLER"

### Paleta de Colores
*   **Cyan (Principal):** `#3FA8FF` (Acentos, UI activa).
*   **Red (Alerta):** `#ff4444` (Errores, Peligro).
*   **Green (Éxito):** `#00d4aa` (Confirmaciones, Estado Online).
*   **Backdrop:** `#0a0f19` (Fondo profundo espacial).

### Componentes Visuales Clave

1.  **Holo-Logo (`holo-logo.css`):**
    *   Animación de entrada "Materialize".
    *   Estado "Idle" con respiración leve.
    *   Efecto **Glitch** interactivo al pasar el mouse.
    *   Efecto **Quantum Warp** al completar una acción exitosa.

2.  **Tarjetas (Glassmorphism):**
    *   Fondo translúcido con `backdrop-filter: blur()`.
    *   Bordes sutiles y sombras de neón suaves.

3.  **Animaciones:**
    *   Transiciones suaves de CSS para todos los estados interactivos.
    *   Efectos de escaneo y carga simulada.

---

## 📱 Responsividad

El diseño es completamente responsivo (**Mobile-First**):
*   **Login:** El logo y los inputs se adaptan a pantallas pequeñas (zoom ajustado a 1.5x en móviles).
*   **Dashboard:** Adopta un layout de columna única en móviles, con cabecera simplificada.
*   **AR View:** Optimizado para interactuar con pantallas táctiles.

---

## 🚀 Flujo de Usuario

1.  **Boot Sequence:** Carga inicial con animación del logo --> Login.
2.  **Autenticación:** Validación de credenciales contra Supabase.
3.  **Dashboard:** Vista central de telemetría y acceso a módulos.
4.  **AR Mode:** Activación de cámara y detección de objetos.
5.  **Archives:** Gestión de hallazgos guardados.
6.  **Mapa:** Visualización geográfica de objetos detectados.
