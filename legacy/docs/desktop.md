# KEPLER Desktop Architecture

Este documento detalla la arquitectura actual de la aplicación de escritorio de KEPLER (Fase 1 completada del plan de optimización), explicando cómo funcionan en conjunto los componentes HTML, CSS, JavaScript (Electron/React Vite) y el Backend en Python.

## Índice
1. [Resumen del Sistema](#resumen-del-sistema)
2. [Estructura de Ficheros Relevante](#estructura-de-ficheros)
3. [Componente Frontend Web (Vite + React Vanilla JS)](#componente-frontend-web)
4. [El Puente: WebSockets (AIEngine_YOLO.js)](#el-puente-websockets)
5. [Componente Backend (Python + FastAPI)](#componente-backend)
6. [Contenedor de Escritorio (Electron)](#contenedor-de-escritorio-electron)
7. [Flujo de Ejecución (Paso a Paso)](#flujo-de-ejecución)

---

## 1. Resumen del Sistema

Originalmente, KEPLER intentaba cargar y ejecutar modelos pesados de Inteligencia Artificial (ONNX) directamente en el navegador del usuario utilizando Web Workers.  
En la arquitectura Desktop actual, **hemos desacoplado este proceso**.

El Frontend *(interfaz)* ahora es un cliente ultraligero que envía fotografías en tiempo real a una terminal "Core" en Python (*Backend Nativo*) situada en el mismo ordenador. El backend escrito en Python cuenta con acceso directo al hardware del sistema operativo (PyTorch) para ejecutar la inferencia a alta velocidad y luego retorna la posición de los objetos detectados a la interfaz para ser dibujados en el navegador.

## 2. Estructura de Ficheros

Esta es la lista clave de archivos involucrados en este baile de ida y vuelta:

```text
KEPLER/
├── apps/
│   ├── desktop/
│   │   └── main.js                  <-- Contenedor Electron. Lanza la App y puentea SSL.
│   │
│   └── web/
│       ├── .env                     <-- Variables de Entorno y Proxy URLs de Vite
│       ├── vite.config.js           <-- Levanta el Dev Server en 5180 y envía '/api' al puerto 8000
│       └── src/
│           ├── features/dashboard/
│           │   ├── dashboard.html   <-- La maquetación de tu interfaz visual (HTML/CSS)
│           │   └── index.js         <-- El orquestador que inicia el Dashboard
│           │
│           └── js/engines/
│               └── AIEngine_YOLO.js <-- (CLAVE) Captura el Canvas y lo envía a Python por WebSocket.
│
└── backend/
    ├── app/
    │   ├── main.py                  <-- Servidor FastAPI en el puerto 8000
    │   └── api/endpoints/
    │       └── inference.py         <-- (CLAVE) Lee las imágenes, acciona YOLO (Ultralytics) y devuelve Cajas.
    │
    └── models/
        └── yolo11n.pt               <-- El peso neuronal pre-entrenado (Fallback de yolov26n).
```

---

## 3. Componente Frontend Web

El frontend (tu base en React/Vanilla con Vite) se encarga puramente de la experiencia de usuario (UX) y el renderizado rápido a 60FPS sin quedarse bloqueado pensando.

- **Diseño**: `dashboard.html` alberga el Canvas AR de tu cámara simulada y toda tu telemetría decorativa.
- **Lanzador**: Múltiples clases inicializan el sistema de usuario (Supabase) pero **saltan la precarga de la IA pesada** ya que está delegada al backend (verificado por `loading-overlay.js` haciendo ping a `/api/status`).

## 4. El Puente: WebSockets

El archivo `AIEngine_YOLO.js` es el punto de inflexión. Así es como funciona su ciclo de vida cada milisegundo:

1. El motor extrae lo que ve la cámara/video oculto.
2. Lo dibuja en un Canvas invisible.
3. Lo comprime a una cadena de texto en codificación `Base64` formato JPEG (`toDataURL('image/jpeg', 0.6)`).
4. Lo envía al aire libremente mediante un `websocket.send()` al enchufe de Python local (`ws://localhost:8000/api/ws/detect`).
5. Se queda esperando pacientemente.
6. Apenas la terminal Python contesta con un formato JSON (Ej. Caja en X:200, Y:150, Persona).
7. Le entrega esa caja al Renderizador (ObjectTracker) para que la dibuje en tu pantalla en color aguamarina con un pitido y vibre el dispositivo.

Este proceso asincróno evita que la pantalla se congele («stuttering») y te mantiene tu app reactiva incluso cuando YOLO tarda 300ms en procesar.

## 5. Componente Backend

El Backend ha adquirido el rol estelar de "Músculo de Procesamiento":

- **Entorno Virtual (venv)**: Aquí viven librerías especializadas y pesadas en C++ adaptadas para Python como `torch` y `ultralytics`.
- El archivo `inference.py` se despierta, carga las capas neuronales de YOLOv26 (o el salvavidas `yolov11n.pt` que existe en tu carepta `/models`) guardándolo activamente en RAM para evitar calentamiento de discos duros repetitivos.
- Abre la ruta Websocket e inicia un Loop Secuencial infinito. Desencripta cada texto en Base64 convirtiéndolo en un tensor fotográfico OpenCV (`cv2`), corre el modelo, y arma un JSON con todas las cajas colisionadas enviándolo de reversa.

> **💡 Nota Petición:** El código de `inference.py` está configurado para buscar `yolov26n.pt` o `yolo11n.pt` nativamente en la carpeta madre `models`. Si encuentra la v11, se acoplará a ella. Actualmente, tu carpeta local contiene **yolo11n.pt**. ¡Es correcto! 

## 6. Contenedor de Escritorio (Electron)

`apps/desktop/main.js` es el caparazón final. Electron levanta un binario incrustado del navegador Chromium y corre tu URL de Vite (`https://localhost:5180`). 

No hace procesamiento lógico, excepto dar los permisos OS (Operative System) que saltan los fallos de certificados auto-firmados SSL locales (ERR_CERT_AUTHORITY_INVALID) en navegadores tradicionales tanto para REST (`https://localhost`) como Realtime/WebSockets (`wss://localhost`).

---

## 7. Flujo de Ejecución (Paso a Paso)

Cuando haces click en el acceso de Desktop:

1. **Python (Core)** asume sus posiciones en el puerto `8000` con FastAPI alojando Ultralytics.
2. **Vite** prepara los Scrips visuales en el puerto `5180`.
3. **Electron** estremece al sistema abriendo un Chromium oscuro empaquetado en tu monitor de 1440x900px.
4. El Frontend aparece con el menú "*K E P L E R*".
5. Al hacer login, el `loading-overlay.js` saluda a Supabase primero, luego pregunta por la ruta proxy `/api/status`.
6. Python contesta: *«Disponible Native PyTorch - YOLOv11»*. El porcentaje de carga cruza al 100%.
7. La cámara se enciende. `AIEngine_YOLO.js` abre el Web Socket ininterrumpido a Python.
8. Los Base64 fluyen hacia la terminal oscura Python cada 100 milésimas, y cajas JSON retro-retornan dibujando contornos en tiempo real. 

Esta arquitectura separa tus roles, optimiza tus tiempos y te sienta las bases para migrar este mismo Front-End (la carpeta `web`) al celular en un contenedor como React Native (Fase 2) que charlará en armonía con este mismo enrutamiento Python a través de tu WiFi local.
