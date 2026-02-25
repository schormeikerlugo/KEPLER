# Reporte de Modelos: Ecosistema YOLOv26 y Casos de Uso en KEPLER

Basado en la [documentación oficial de Ultralytics YOLOv26](https://docs.ultralytics.com/es/models/yolo26/), YOLOv26 representa un salto importante al eliminar capas de procesamiento innecesarias (DFL y NMS separada) para permitir una inferencia integral mucho más veloz ("End-to-End"), especialmente en uso de CPU puro (hasta 43% más rápido).

YOLOv26 no es un solo modelo, sino una **familia** dividida en **Tamaños** y **Tareas**. Aquí te explico cómo cada uno se aplicaría perfectamente al universo exploratorio de **KEPLER**.

---

## 1. Variantes por "Tamaño" (Rendimiento vs Precisión)

Las letras al final del modelo (`n`, `s`, `m`, `l`, `x`) indican el tamaño y la cantidad de parámetros neuronales.

| Modelo | Nombre | Uso principal en KEPLER |
| :--- | :--- | :--- |
| **`yolov26n.pt`** | **Nano** | **El Predeterminado Actual (Desktop/Mobile)**. Ultra-rápido. Perfecto para mantener 30-60 FPS en el cliente WebSocket e indispensable para la Fase 2 (Frame Processors en React Native) donde la RAM del celular es muy limitada. |
| **`yolov26s.pt`** | **Small** | **Análisis de Escritorio**. Ligeramente más lento que Nano pero comete menos errores confundiendo rocas. Ideal si el usuario de Desktop tiene una PC promedio. |
| **`yolov26m.pt`** | **Medium** | **El equilibrio**. Si logramos conectar una Tarjeta Gráfica Dedicada (CUDA/GPU) al backend Python, este debería ser el estándar para máxima precisión sin perder FPS. |
| **`yolov26l.pt`** / **`x.pt`** | **Large / Xtreme** | **Análisis de Misión Post-Mortem**. Muy lentos para AR en tiempo real, pero perfectos si KEPLER tuviera una función de "Analizar Foto Geológica" en alta resolución donde no importa esperar 2 segundos por un escaneo exhaustivo. |

---

## 2. Variantes por "Tarea" (Casos de Uso)

Además de cajas estándar (Detect), YOLOv26 soporta otras inteligencias visuales.

### A. Detección Estándar (`yolov26n.pt`)
*   **Modo de acción:** Dibuja cuadrados alrededor de los objetos (Bounding Boxes).
*   **Caso en KEPLER:** Es lo que usamos actualmente. Detecta "Persona", "Monitor", "Drone", etc., en tiempo real mientras mueves la cámara de tu casco espacial simulado.

### B. Segmentación de Instancias (`yolov26n-seg.pt`)
*   **Modo de acción:** En lugar de dibujar un cuadrado rígido, "pinta" exactamente la silueta irregular del píxel del objeto recortándolo del fondo.
*   **Caso en KEPLER:** **Escaneo de Minerales/Flora.** Si el explorador encuentra una roca o planta alienígena, usar `.seg` permitiría al Dashboard de KEPLER aislar la textura de la roca perfectamente para mostrártela en 3D o analizar su porosidad, ignorando la arena detrás de ella.

### C. Estimación de Pose (`yolov26n-pose.pt`)
*   **Modo de acción:** Identifica el "esqueleto" humano (codos, rodillas, cabeza) conectando puntos clave (Keypoints).
*   **Caso en KEPLER:** **Telemetría de Tripulación.** Podría usarse si la cámara AR de tu Dashboard apunta a otro explorador. El sistema podría leer su lenguaje corporal (Ej: "Tripulante agachado recolectando muestras" o "Tripulante con brazos en alto: Señal de alerta").

### D. Detección Orientada - OBB (`yolov26n-obb.pt`)
*   **Modo de acción:** Detecta cuadrados pero que **pueden rotar en diagonal** (Oriented Bounding Boxes).
*   **Caso en KEPLER:** **Mapeo Satelital (Drones).** Ideal para la vista del mapa (MapBox). Si envías una imagen satelital al Backend, el modelo OBB dibuja rectángulos rotados perfectos para marcar edificios, vehículos abandonados o naves de colonos aparcadas en ángulo, en lugar de cajas rectas y feas.

### E. Clasificación de Imagen (`yolov26n-cls.pt`)
*   **Modo de acción:** No busca dónde está el objeto ni dibuja cajas. Simplemente te dice: "Toda esta foto es un cráter [99% seguro]".
*   **Caso en KEPLER:** **Validación Biológica.** Cuando se hace un escaneo puntual y directo a una placa de Petri o muestra química de la misión, usas este modelo (que es más ligero y preciso) para saber qué es globalmente.

---

## Recomendación Estratégica para tu Desarrollo

1.  **Mantén `yolov26n.pt`** (Detection Estándar) para la capa Base de Realidad Aumentada de tu Desktop y Mobile actual de forma unificada.
2.  Dado que tu entorno backend soporta descripciones con Mistral y CLIP en **docs/ia.md**, el siguiente salto natural de "Wow Factor" para tu portafolio sería agregar la función de recortar la silueta usando **`yolov26n-seg.pt`** cuando el usuario le dé clic al botón "Escanear" en la Interfaz.
3.  Descarga el `yolov26n.pt` desde los releases de Ultralytics e introdúcelo en la carpeta `backend/models/` para activarlo hoy.
