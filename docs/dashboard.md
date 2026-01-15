# Dashboard y UI Components

Documentación técnica de los componentes de la interfaz de usuario del Dashboard de KEPLER.

## Header (Cabecera)

La cabecera del dashboard ha sido refactorizada para ofrecer una experiencia más limpia y escalable. Se divide en componentes modulares para facilitar el mantenimiento y la adaptación a diferentes dispositivos.

### Estructura

1.  **Logo (`.dash-header-left`):**
    *   Contiene el logotipo de KEPLER.
    *   **Móvil:** Incluye el contenedor `#system-status-mobile` para mostrar el estado del sistema en pantallas pequeñas.
2.  **Espacio Central:** Flexible para futuras expansiones.
3.  **Controles (`.dash-header-right`):**
    *   **Command Menu:** Botón `[COMANDOS]` que despliega las acciones principales de navegación (Mapa, Archivos, Taxonomía).
    *   **System Status (Desktop):** Panel informativo del estado del sistema.
    *   **Notificaciones:** Centro de alertas.
    *   **Perfil de Usuario:** Menú de sesión y ajustes.

---

## Módulos Principales

### 1. Command Menu (`main-menu.js`)
Centraliza los botones de navegación principales que anteriormente saturaban la cabecera.
*   **Comportamiento:** Menú desplegable flotante con estilo Glassmorphism.
*   **Interacción:** Se cierra automáticamente al hacer clic fuera o seleccionar una opción.

### 2. System Status (`system-status.js`)
Panel avanzado de monitoreo en tiempo real.

**Características:**
*   **Dual Rendering (Escritorio/Móvil):**
    *   El módulo maneja dos instancias del DOM simultáneamente para garantizar visibilidad en todas las resoluciones.
    *   **Escritorio:** Se renderiza a la derecha del header.
    *   **Móvil:** Se renderiza a la izquierda (junto al logo) y se oculta en escritorio mediante CSS (`display: none !important`).
*   **Monitoreo:**
    *   **Backend:** Ping periódico (`/api/dashboard/stats`).
    *   **GPS:** API de Geolocalización del navegador.
    *   **Sync:** Estado del servicio `OfflineSyncService`.
    *   **IA:** Estado de carga de modelos (`ModelPreloader`).
*   **UX Móvil:** Ajuste automático de alineación del dropdown (crece hacia la izquierda) para evitar scroll horizontal.

### 3. User Profile
Menú de gestión de usuario.
*   **Estilo:** Unificado con el resto de componentes (Glassmorphism).
*   **Feedback Visual:** Estado `.active` en el botón cuando el menú está abierto.

---

## Estilos y Diseño
Se utiliza un sistema de **Glassmorphism** consistente para todos los menús flotantes:
*   **Fondo:** `rgba(10, 15, 25, 0.95)` con `backdrop-filter: blur(20px)`.
*   **Bordes:** Sutiles `1px solid rgba(63, 168, 255, 0.3)`.
*   **Sobras:** Profundas para separar los menús del contenido (`box-shadow: 0 10px 40px ...`).

## Responsive
*   **Breakpoint:** 900px.
*   **Desktop:** Header completo visible. Status a la derecha.
*   **Mobile:**
    *   `dash-header-right` se oculta (menú hamburguesa opcional).
    *   `system-status-mobile` se hace visible junto al logo.
    *   Dropdowns optimizados para uso táctil.
