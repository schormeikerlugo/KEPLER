# ⚡ Supabase (Base de Datos & Auth)

## ☁️ Infraestructura
KEPLER utiliza **Supabase** como su plataforma Backend-as-a-Service (BaaS) principal para persistencia de datos, autenticación segura y almacenamiento de archivos multimedia.

---

## 🔐 Autenticación (Auth)
*   **Proveedor:** Email & Password.
*   **Gestión:** Manejada por el cliente JS de Supabase (`@supabase/supabase-js`).
*   **Políticas:** Los usuarios deben estar autenticados para acceder al Dashboard y realizar escaneos.
*   **User ID:** UUID único generado automáticamente que vincula todos los registros.

---

## 🗄️ Esquema de Base de Datos (PostgreSQL)

### Tabla: `scans` (Archivo Central)
Almacena todos los análisis realizados por los usuarios.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID | Identificador único del escaneo. |
| `user_id` | UUID | Referencia al usuario (FK). |
| `image_url` | TEXT | URL pública de la imagen en Storage. |
| `label` | TEXT | Nombre detectado (ej: "Crater"). |
| `confidence` | FLOAT | Nivel de certeza de la IA (0-1). |
| `description` | TEXT | Descripción generada por Mistral 7B. |
| `embedding` | VECTOR(512) | Vector CLIP para búsqueda semántica. |
| `created_at` | TIMESTAMPTZ | Fecha de captura. |

### Extensiones Activas
*   **`vector`:** Permite almacenar embeddings y realizar búsquedas de similitud (`cosine_distance`).

### Tabla: `user_notifications`
Historial de notificaciones sincronizado por usuario.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `user_id` | UUID | FK al usuario (auth). |
| `message` | TEXT | Contenido de la notificación. |
| `type` | VARCHAR | 'critical', 'warning', 'success', 'info'. |
| `read` | BOOLEAN | Estado de lectura. |
| `created_at` | TIMESTAMPTZ | Fecha de creación. |

*   **RLS Activo:** Acceso exclusivo por `user_id`.

---

## 🗂️ Storage (Buckets)

### Bucket: `scans`
*   **Contenido:** Imágenes capturadas durante el modo AR.
*   **Acceso:** Público (lectura), Autenticado (escritura).
*   **Estructura:** Las imágenes se guardan con nombres únicos basados en timestamp para evitar colisiones.

---

## 🔎 RPC (Remote Procedure Calls)

### `search_similar_objects`
Función personalizada en PostgreSQL para realizar búsuqedas vectoriales rápidas.
*   **Input:** Vector de consulta (embedding).
*   **Lógica:** Calcula la distancia coseno entre el vector input y los vectores en la tabla `scans`.
*   **Output:** Lista de registros más cercanos (similares).
