# ⚙️ Arquitectura Backend (API & AI Service)

## 🧠 Visión General
El Backend de KEPLER es un servicio robusto construido en **Python** con **FastAPI**, diseñado para procesar tareas pesadas de Inteligencia Artificial y servir datos de telemetría en tiempo real. Actúa como el cerebro analítico que complementa la interfaz ligera del frontend.

---

## 🛠️ Stack Tecnológico

*   **Lenguaje:** Python 3.10+
*   **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Alto rendimiento, asíncrono).
*   **Server:** Uvicorn (ASGI).
*   **IA Core:** PyTorch, Sentence-Transformers (CLIP), Ollama (Mistral 7B).
*   **Base de Datos Relacional:** Supabase (PostgreSQL) vía cliente Python.

---

## 🔌 API Endpoints

### 1. Telemetría (`/api/realtime-telemetry`)
*   **Método:** GET
*   **Función:** Provee datos simulados del estado del traje/rover en tiempo real.
*   **Datos:** Ritmo cardíaco, Presión del traje, Temperatura, O2, Radiación.
*   **Frecuencia:** Polling cada 1s desde el Frontend.

### 2. Análisis Visual (`/api/generate-embedding`)
*   **Método:** POST
*   **Input:** Imagen (Base64).
*   **Proceso:** Utiliza el modelo **CLIP (ViT-B-32)** para convertir la imagen en un vector matemático (embedding de 512 dimensiones).
*   **Uso:** Permite que el sistema "entienda" qué contiene la imagen visualmente.

### 3. Enriquecimiento de Datos (`/api/enrich-data`)
*   **Método:** POST
*   **Input:** Etiqueta o texto simple (ej: "Roca Volcánica").
*   **Proceso:** Consulta a **Mistral 7B** (vía Ollama) para generar una descripción científica detallada y contextualizada del objeto.
*   **Output:** Texto narrativo descriptivo.

### 4. Búsqueda por Similitud (`/api/search-similar`)
*   **Método:** POST
*   **Input:** Imagen (Base64).
*   **Proceso:**
    1.  Genera embedding de la imagen input.
    2.  Consulta a la base de datos vectorial de Supabase (`pgvector`).
    3.  Encuentra objetos previamente analizados que sean visualmente similares.

### 5. Objetos del Mapa (`/api/objects/map`)
*   **Método:** GET
*   **Parámetros:** `?scope=mine|all`
*   **Función:** Obtiene objetos para visualización en el mapa.
*   **scope=mine:** Solo objetos del usuario actual.
*   **scope=all:** Todos los objetos con info del propietario (avatar, nombre, bio).

### 6. Perfil de Usuario (`/api/objects/user/{user_id}/profile`)
*   **Método:** GET
*   **Función:** Obtiene perfil público y estadísticas de un usuario.
*   **Datos:** avatar, username, bio, stats (objetos, misiones, puntos), fecha de registro.

---

## 📦 Dependencias Clave

*   **`torch` (CPU Optimized):** Motor de cálculo tensorial para CLIP.
*   **`sentence-transformers`:** Wrapper para facilitar el uso de modelos de visión.
*   **`ollama`:** Cliente para comunicarse con el servicio local de Mistral 7B.
*   **`pillow`:** Procesamiento de imágenes antes del análisis.

---

## ⚠️ Notas de Despliegue

*   El backend requiere ejecutar un servidor **Ollama** externo en el puerto `11434` para las funciones de texto.
*   Se recomienda usar la versión CPU-only de PyTorch para ahorrar espacio (~1.5GB vs 7GB con CUDA) si no se dispone de GPU dedicada en el servidor.
