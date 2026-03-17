# 🗺️ Roadmap de Desarrollo Estratégico: Proyecto KEPLER

Este documento sirve como hoja de ruta a largo plazo (Roadmap). Aquí se analiza la visión del sistema, la viabilidad técnica de las nuevas características y se proponen ideas de expansión para llevar a KEPLER al siguiente nivel.

---

## 🧭 Visión Global del Sistema

El objetivo de KEPLER ha evolucionado de un experimento de Machine Learning en el navegador a un **Sistema Integrado de Topografía y Exploración Científica**.

La topología ideal requiere dos roles:
1.  **Centro de Comando (Desktop/Python):** El cerebro central. Recibe transmisiones, analiza datos pesados usando tarjetas gráficas locales y observa la telemetría masiva de todos los módulos desplegados.
2.  **Unidad de Campo (Mobile/React Native):** El explorador. Es una estación ligera, robusta (capaz de operar sin internet) y equipada con sensores, GPS e inferencia acelerada para detectar peligros u objetos en el sitio.

---

## 📍 Estado de Fases y Viabilidad

### 🟢 Fase 1: Desktop Optimization (COMPLETADA)
*   **Logros:** Transferencia de la carga neuronal (YOLO) al Backend Python, liberando a la web de congelamientos de RAM. Implementación de WebSockets ultrarrápidos y nueva grilla de telemetría (Batería, GPS real, Radar de otros usuarios). Todo 100% viable y funcional.

### 🟡 Fase 2: The "Field Unit" - React Native Mobile (Siguiente Paso)
*   **Descripción:** Abordar la app celular. Cambiar la "simulación con delay" de ARCamera a una cámara nativa profesional.
*   **Viabilidad [ALTA]:** React Native soporta componentes C++ de alta respuesta a través de JSI (JavaScript Interface).
*   **Plan de Acción (Roadmap Técnico):**
    1.  Abandonar Expo Go (ya que no soporta código nativo profundo sin compilar en la nube). Migrar el proyecto a **EAS (Expo Application Services)** para compilar binarios APK (Android) / IPA (iOS) reales.
    2.  Integrar `react-native-vision-camera`. Es la librería más potente del mercado moderno.
    3.  Construir un **Frame Processor**. Es un bloque de código C++ que toma la luz cruda de la cámara a 60FPS y la pasa por el modelo `yolov26n.pt` internamente dentro del celular.

---

## 🎯 Ideas y Propuestas para Potenciar el Software (Análisis)

*Basado en tu solicitud, he estructurado varias ideas que añaden valor inmenso al software para presentarlo como producto.*

### 1. Sistema "Offline-First" (Supervivencia sin Red)
*   **Estado:** **Parcialmente Completado (v0.7.0)**.
*   **Logros:** Integración de sincronización offline en `api.js` y registro rastro GPS persistente.
*   **Pendiente:** Sincronización masiva de assets (imágenes) en desconexión total prolija.

### 2. AI Re-ID y Auto-Captura (COMPLETADA v0.7.0)
*   **Descripción:** Sistema Sentinel con ruteo inteligente a tablas de Personas y POIs.
*   **Logros:** Integración de pgvector para persistencia de identidad visual. Ya no se requieren capturas manuales para entidades críticas.
*   **Viabilidad:** **Alta**. Implementado exitosamente en v0.7.0 usando CLIP + Supabase RPC.

### 2. Biometría Real Extrapolada (Relojes Inteligentes)
*   **Propuesta:** En este momento, los latidos del corazón (BPM) y la temperatura que programamos son variables matemáticas aleatorias (`Math.random()`). Sería fascinante conectar Apple HealthKit (iOS) o Google Fit (Android) dentro de la Fase 2 móvil.
*   **Resultado:** El explorador usa un smartwatch. React Native lee los pulsos cardíacos cardíacos reales y los inyecta por Supabase Realtime para que *tú* los veas en vivo en la app Desktop del Centro de Comando.
*   **Viabilidad:** **Alta**. Expo tiene plugins preconstruidos para solicitar permisos de Salud (`expo-apple-healthkit`). Aumentaría muchísimo el valor "Real-World" de tu portafolio.

### 3. Comunicación VoIP / P2P de Emergencia ("Radio")
*   **Propuesta:** ¿Qué pasa si "Tripulación" marca a otro usuario? Poder abrir un canal de audio estilo Walkie-Talkie utilizando WebRTC.
*   **Viabilidad:** **Baja-Media**. El video en vivo gasta mucho ancho de banda, pero un stream de audio es fácil de implementar con un servidor de señalización simple integrado en Python.

### 4. Inteligencia Artificial: Segmentación y Aislamiento 3D
*   **Propuesta:** Utilizar el peso `yolov26n-seg.pt` (Segmentación de instancias) que ya descargamos. En lugar de dibujar rectángulos feos alrededor de las rocas, la IA bordea el píxel exacto de su silueta. Si "recortamos" esa roca del marco, podríamos llevar la captura al Dashboard 3D web y generar un modelo giratorio de la roca utilizando Photogrametría simple / Three.js.
*   **Viabilidad:** **Media-Alta**. Requeriría un botón en la app "Escanear Terreno Profundo" que toma de 2 a 3 segundos (en contraste con la detección en tiempo real que es de 0.05 segs).

### 5. Reconocimiento de Posturas de Crisis
*   **Propuesta:** Usa `yolov26n-pose.pt`. Si la cámara (colocada en un rover, un dron compañero o el pecho) dictamina que el explorador frente a ella está en posición horizontal en el suelo durante 10 segundos, dispara automáticamente una alerta crítica al Desktop y enciende el color Rojo.
*   **Viabilidad:** **Alta**. YOLO Pose ya te devuelve los puntos clave; la lógica sería simplemente medir si la distancia entre Cabeza y Tobillo en el eje *Y* es muy baja (lo que significa que la persona está tendida).

---

## 🚦 Conclusión de la Ruta Actual

Nuestra estrategia confirmada y a seguir es continuar estrictamente la línea de la **Fase 2 (Mobile Field Unit)**. Ninguna de las funcionalidades 3, 4 o 5 son prioritarias hasta que no aseguremos que el motor nativo de la cámara AR funciona impecablemente en el equipo del usuario a nivel cliente dentro de un contenedor Expo Dev Build.

**Flujo Sugerido del Plan Diario:**
1. Crear el `expo-dev-client` y configurar el entorno `android/ios`.
2. Reemplazar y estabilizar el Canvas AR del UI Móvil.
3. Incorporar los Frame Processors (C++) al flujo.
4. Volver a revisar y añadir los extras de Biometría u Offline Sync.
