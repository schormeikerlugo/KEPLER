# 🎨 Propuesta de Reestructuración UI/UX del Dashboard (KEPLER)

Para elevar llevar KEPLER al siguiente nivel visual y funcional, es necesario evolucionar el Dashboard de una simple vista de contadores a un **Centro de Comando Interactivo con Gráficos y Tendencias**. 

Aquí tienes un análisis de lo que tenemos hoy y qué módulos nuevos deberías diseñar en **Figma** para que podamos programarlos en la próxima fase.

---

## 1. Análisis de la Distribución Actual

Actualmente nuestra grilla (`dash-main`) tiene tres columnas rígidas:

1.  **Panel Izquierdo (Telemetría Básica):** Sólo tiene texto y números en tiempo real (Temp, O2, BPM, Rad, Pwr, Dist, Tripulación). *Es funcional, pero visualmente plano.*
2.  **Panel Central (Chat IA):** Ocupa demasiado espacio vital en pantalla para ser solo texto. Debería ser colapsable o compartir espacio con el mapa visual.
3.  **Panel Derecho (Data Grid):** Muestra el conteo de Objetos, Misiones, Minerales y POIs (Puntos de Interés). *Falta interactividad y desglose.*

---

## 2. Nuevos Módulos y Gráficos Propuestos para Figma

Al ir a Figma, te recomiendo diseñar los siguientes componentes intermedios (Widgets o Tarjetas) que luego programaremos usando librerías modernas como `Chart.js`, `ApexCharts` o `D3.js`:

### 📊 Módulo 1: "Línea de Vida" (Gráfico de Área - Biometría)
*   **Diseño:** Un gráfico de línea curva y suave (Area Chart) que muestre el historial de los últimos 10 minutos.
*   **Datos Clave:** **BPM (Pulsaciones)** y **O2 (Oxígeno)** solapados.
*   **Utilidad:** El explorador puede ver si su ritmo cardíaco lleva mucho tiempo acelerado o si su tanque de O2 se está vaciando más rápido de lo esperado según la pendiente del gráfico.

### ☢️ Módulo 2: "Espectrómetro Local" (Gráfico de Barras o Radial)
*   **Diseño:** Un indicador circular tipo tacómetro o un gráfico de barras horizontales de progreso.
*   **Datos Clave:** **Nivel de Radiación (RAD)** y **Temperatura Exterior**.
*   **Utilidad:** Controles de peligro visual. Si el tacómetro de radiación pasa a la franja naranja/roja (Ej. > 0.050 µSv), una alarma visual salta.

### 🚶 Módulo 3: "Rastreabilidad de Ruta" (Gráfico de Progreso Lineal)
*   **Diseño:** Una barra de pasos (Timeline) horizontal simple.
*   **Datos Clave:** **Kilómetros recorridos** vs **Batería restante (PWR)**.
*   **Utilidad:** Sirve como estimador de retomo de misión. *"He recorrido 5 km y me queda 40% de batería, debo volver"*. Debería mostrar el tiempo estimado de duración de la batería restante.

### 📦 Módulo 4: "Radar de Bio-Firmas" (Gráfico de Dona / Pie Chart)
*   **Diseño:** Un gráfico tipo dona moderna (hollow pie chart).
*   **Datos Clave:** Desglose porcentual de los **Objetos Escaneados** localmente.
*   **Utilidad:** Al ver el radar, el usuario sabe: "De 100 objetos que detectó YOLO a mi alrededor, 60% son Minerales, 30% es Flora y 10% son Peligros".

### 🗺️ Módulo 5: "Mini-Mapa de Enjambre" (Componente Geográfico Pequeño)
*   **Diseño:** Un recuadro satelital oscuro y pequeño (Mini-Map) incrustado en el propio dashboard (no a pantalla completa).
*   **Datos Clave:** Muestra el punto azul (Tú) y puntos verdes (Los otros miembros de la **Tripulación** activos en el planeta).
*   **Utilidad:** Conocer la ubicación relativa de tus compañeros sin tener que oscurecer todo y abrir el "Mapa Completo".

---

## 3. Propuesta de Reestructuración de la Pantalla (Layout)

Cuando estructures los componentes en Figma, intenta crear este Layout o Marco de Alambre (Wireframe):

*   **Top Bar (Global):** Tu logo, el indicador de conexión (YOLOv26 Activo), perfil y notificaciones.
*   **Izquierda (Status Crítico - 25% ancho):** Módulo de Vida (Biometría en gráfico de curva), Módulo de Batería y Radiación (Tacómetros concéntricos).
*   **Centro Arriba (Módulo de Visión/Contexto - 50% ancho):** El Canvas/Cámara simulada de YOLO (que el visor AR no esté ocuilto sino que el Dashboard se sobreponga como marco Glassmorphism).
*   **Centro Abajo (Data y Radar - 50% ancho):** El gráfico de Dona (Bio-Firmas) y el Mini-Mapa de tus compañeros de tripulación.
*   **Derecha (Comunicaciones e Inventario - 25% ancho):** El Chat de IA optimizado/colapsado y una lista estilizada de tus últimos Objetos scaneados.

---

## Próximos Pasos

Te sugiero que lleves estas 5 ideas de módulos (Gráfico de Pulsaciones/O2, Tacómetro de Radiación, Gráfico de Dona de Objetos, Barra de Kilometraje y Mini-mapa) directo a **Figma**.

Juega con los colores (cyan, aguamarina, rojo neón y fondos oscuros cristalinos tipo Glassmorphism). Una vez que tengas un diseño que te guste, me lo comunicas y **yo me encargaré de codificar cada uno de los gráficos** conectándolos al motor de telemetría y matemáticas que acabamos de construir.
