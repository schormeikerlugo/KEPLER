# ⏳ Sistema de Carga y Caché (Loading System)

Este documento detalla la arquitectura de inicialización de KEPLER, diseñada para asegurar que todos los recursos críticos (especialmente los modelos de IA) estén listos antes de que el usuario interactúe con el Dashboard.

## 🚀 Flujo de Inicialización

El sistema de carga (`frontend/src/features/loading/`) se ejecuta inmediatamente después del inicio de sesión y antes de mostrar el Dashboard principal.

### Ciclo de Tareas
El proceso sigue una secuencia de tareas ponderadas:

| Tarea | Peso | Descripción | Almacenamiento |
|-------|------|-------------|----------------|
| **1. Sesión** | 10% | Verificación de token de Supabase Auth | - |
| **2. Perfil** | 10% | Carga de datos de usuario y avatar | `sessionStorage` |
| **3. Misiones** | 15% | Sincronización de las últimas misiones | `sessionStorage` |
| **4. Modelo IA** | 50% | Inicialización del motor YOLOv11 (WASM) | `window.__keplerYoloWorker` |
| **5. Assets** | 15% | Precarga de iconos y logotipos SVG | Caché Navegador |

---

## 🧠 Model Preloader Service

La carga del modelo de IA es la tarea más pesada y crítica. Se maneja a través de un Singleton (`ModelPreloaderService`) en `src/js/services/ModelPreloader.js`.

### Arquitectura
1.  **Web Worker:** El modelo se carga en un thread separado (`yolo.worker.js`) para no bloquear la UI.
2.  **Persistencia:** Una vez cargado, el worker se adjunta al objeto global `window` para sobrevivir a la navegación SPA (Single Page Application).
3.  **WASM Cache:** ONNX Runtime utiliza el cache del navegador para los binarios `.wasm` y el modelo `.onnx`, haciendo que las cargas subsiguientes sean instantáneas.

```javascript
// Ejemplo de acceso global al worker precargado
if (window.__keplerModelReady) {
    const worker = window.__keplerYoloWorker;
    worker.postMessage({ type: 'DETECT', ... });
}
```

### Manejo de Errores y Timeouts
*   Si la carga del modelo tarda más de **90 segundos**, se considera timeout.
*   El sistema permite continuar (Omitir) aunque el modelo no esté listo; en este caso, el Dashboard intentará cargarlo en segundo plano.

---

## 💾 Estrategia de Caché

### Session Storage
Para reducir la latencia y las llamadas a la API (Supabase), los datos "calientes" se guardan en `sessionStorage`:
*   `kepler_profile`: Datos del usuario actual.
*   `kepler_missions`: Lista de misiones recientes.

Esto permite que el Dashboard renderice su estructura inmediatamente mientras se valida la frescura de los datos en segundo plano (estrategia *Stale-While-Revalidate*).

### Service Worker & Assets
(Planificado para v0.5)
Actualmente, los assets estáticos se precargan mediante `Image()` promises, confiando en el caché estándar HTTP del navegador.

---

## 🎨 UX de Carga (`LoadingOverlay`)

*   **Tips de Exploración:** Muestra datos curiosos sobre Marte rotativos cada 5 segundos para entretener al usuario durante la espera.
*   **Skip Button:** Aparece automáticamente si la carga supera el 40% del progreso, permitiendo a usuarios impacientes acceder a funciones básicas si la IA tarda demasiado.
*   **Feedback Visual:** Barra de progreso real basada en el peso de las tareas completadas.
