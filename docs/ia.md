# 🧠 Inteligencia Artificial (IA)

## 🌐 Ecosistema Híbrido
KEPLER implementa una arquitectura de IA híbrida, dividiendo el procesamiento entre el navegador del cliente (Edge AI) para inmediatez y el servidor (Cloud AI) para análisis profundo.

---

## ⚡ Frontend AI (Tiempo Real)

### 1. Detección de Objetos (YOLOv11)
*   **Modelo:** YOLOv11 Nano (`yolo11n.onnx`).
*   **Ejecución:** [ONNX Runtime Web](https://onnxruntime.ai/) con backend WebAssembly (WASM) / WebGL.
*   **Rendimiento:** Optimizado para correr directamente en el navegador a 15-30 FPS.
*   **Propósito:** Detectar e identificar objetos instantáneamente en el feed de video del usuario (AR Mode).

### 2. Estabilización (Filtro de Kalman)
*   **Algoritmo:** Implementación personalizada en JS (`KalmanFilter.js`).
*   **Uso:** Suaviza las coordenadas (Bounding Boxes) de las detecciones de YOLO. Reduce el "jitter" (temblor) de las cajas delimitadoras, proporcionando una experiencia de UI fluida y profesional.

### 3. Object Tracking
*   **Lógica:** Sistema de rastreo (`ObjectTracker.js`) que asigna IDs únicos a los objetos detectados para mantener su identidad a través de los frames, evitando parpadeos de etiquetas.

---

## ☁️ Backend AI (Análisis Profundo)

### 1. Visión Semántica (CLIP)
*   **Modelo:** OpenAI CLIP (ViT-B-32).
*   **Función:** Transforma imágenes en vectores numéricos (embeddings).
*   **Aplicación:** Permite al sistema "recordar" qué ha visto y buscar objetos visualmente similares en el archivo histórico sin depender de etiquetas de texto.

### 2. Inteligencia Generativa (Mistral 7B)
*   **Modelo:** Mistral 7B (mistral:7b).
*   **Ejecución:** Local vía [Ollama](https://ollama.ai).
*   **Función:** Actúa como el "Científico a Bordo". Recibe datos simples (ej: "Roca") y genera descripciones detalladas, hipótesis geológicas y análisis contextuales ricos para el usuario.

---

## 💬 Sistema de Chat IA (v0.4.0)

### Arquitectura de Agente ReAct

El sistema de chat implementa un agente con capacidad de razonamiento y acción:

```
Usuario → Intent Detector → Tool Executor → LLM Response → Streaming UI
```

### Componentes del Sistema

| Componente | Archivo | Función |
|------------|---------|---------|
| **Intent Detector** | `intent_detector.py` | Clasifica mensajes en intents (QUERY_MISSION, COMPARE_ITEMS, etc.) |
| **Tool Executor** | `tool_executor.py` | Ejecuta herramientas basadas en el intent detectado |
| **Session Context** | `session_context.py` | Mantiene contexto de conversación (misión activa, último intent) |
| **Schema Loader** | `schema_loader.py` | Descubre dinámicamente el esquema de la base de datos |

### Intents Soportados

| Intent | Patrones | Ejemplo |
|--------|----------|---------|
| `QUERY_MISSION` | "qué es la misión", "háblame de" | "¿Qué misión es Prueba 5?" |
| `LIST_MISSIONS` | "cuántas misiones", "lista misiones" | "Lista mis misiones activas" |
| `COMPARE_ITEMS` | "compara", "diferencias entre" | "Compara misiones Prueba 5 y Prueba 10" |
| `SHOW_OBJECTS` | "objetos de", "muéstrame objetos" | "Muestra objetos de la misión Casa" |
| `GET_IMAGE` | "imagen de", "foto de" | "Dame la imagen de Mineral 1" |
| `SHOW_THIS_IMAGE` | "esa imagen", "quiero ver" | "Quiero ver esa imagen" |
| `DELETE_OBJECT` | "elimina", "borra" | "Elimina el objeto Roca" |
| `UPDATE_MISSION` | "marca como", "cambia estado" | "Marca misión Prueba 5 como completada" |
| `GENERAL_QUERY` | (fallback) | "¿Cómo funciona la exploración en Marte?" |

### Streaming en Tiempo Real

El chat usa **Server-Sent Events (SSE)** para respuestas fluidas:

```javascript
// Frontend (stream.js)
const eventSource = new EventSource(`/api/chat/stream?...`);
eventSource.onmessage = (event) => {
    const chunk = event.data;
    appendChunk(chunk); // Animación typewriter
};
```

### Generación de Títulos

Los títulos del historial se generan automáticamente en español con emojis temáticos:

| Tema | Prefijo Emoji |
|------|---------------|
| Investigación/Análisis | 🔬 |
| Mapas/Ubicaciones | 🗺️ |
| Misiones/Exploración | 🚀 |
| Objetos/Recursos | 💎 |
| Comparaciones/Datos | 📊 |
| Preguntas Generales | ❓ |

### Tablas Comparativas

Cuando el usuario pide comparaciones, el sistema genera tablas markdown:

```markdown
## 📊 Comparativa de Misiones

| Propiedad | Misión A | Misión B |
|-----------|----------|----------|
| Estado | Activa | Completada |
| Zona | Norte | Sur |
| Objetos | 5 | 12 |

### Conclusión
Análisis de diferencias...
```

---

## 🖼️ Avatar de IA Personalizable

Los usuarios pueden personalizar el avatar del asistente desde su perfil:

*   **Presets:** 🤖, 🛸, 👽, 🌌, 🔭
*   **URL Personalizada:** Cualquier imagen externa
*   **Almacenamiento:** Columna `ai_avatar_url` en tabla `profiles`

---

## 🔄 Flujo de Datos IA

### Análisis de Objetos (AR)
1.  **Cámara:** Captura frame.
2.  **YOLO (Browser):** Detecta "Objeto A" y dibuja caja.
3.  **Usuario:** Toca "Analizar".
4.  **Backend:**
    *   **CLIP:** Genera vector del "Objeto A".
    *   **Mistral 7B:** Escribe reporte sobre "Objeto A".
5.  **Supabase:** Guarda Imagen + Vector + Reporte.

### Chat Inteligente
1.  **Usuario:** Escribe mensaje.
2.  **Intent Detector:** Clasifica → `COMPARE_ITEMS`.
3.  **Tool Executor:** Consulta DB para misiones.
4.  **Mistral 7B:** Genera tabla comparativa.
5.  **SSE Stream:** Envía respuesta token por token.
6.  **Frontend:** Renderiza con animación typewriter.

---

## 📦 Dependencias del Backend

```python
# requirements.txt (IA)
langchain>=0.1.0
langchain-ollama>=0.1.0
ollama>=0.1.0
sentence-transformers>=2.2.0  # CLIP
```

## 🚀 Configuración de Ollama

```bash
# Instalar Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Descargar modelo Mistral 7B
ollama pull mistral:7b

# Verificar
ollama list
# NAME         SIZE
# mistral:7b   4.1 GB
```
