# ⚡ Supabase (Base de Datos & Auth)

## ☁️ Infraestructura
KEPLER utiliza **Supabase** como su plataforma Backend-as-a-Service (BaaS) principal para persistencia de datos relacionales, autenticación segura y almacenamiento de archivos multimedia. Este repositorio se conecta a una instancia local/remota a través del cliente `@supabase/supabase-js`.

---

## 🔐 Autenticación (Auth)
*   **Gestión:** Manejada por el esquema `auth` interno de Supabase y enlazado a la tabla pública `profiles`.
*   **Políticas (RLS):** Toda la base de datos está protegida con Row Level Security (RLS) para asegurar que cada explorer solo pueda leer/editar sus propias misiones, perfil y registros.
*   **User ID:** UUID único generado automáticamente al crear una cuenta.

---

## 🗄️ Esquema de Base de Datos (PostgreSQL)

La versión moderna de KEPLER organiza sus datos en 11 tablas principales enfocadas en expediciones, taxonomía de objetos, y telemetría espacial en vivo.

### 👤 Usuarios y Perfiles

#### Tabla: `profiles`
Perfil extendido de cada usuario autenticado.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Referencia a `auth.users(id)`. |
| `full_name` | TEXT | Nombre del explorador. |
| `avatar_url` | TEXT | URL de la imagen de perfil. |
| `role` | VARCHAR(20) | Rol (ej: 'explorer', 'commander'). Default: `explorer`. |
| `status` | VARCHAR(20) | Estado actual. Default: `offline`. |
| `preferences` | JSONB | Preferencias de UI/sistema del usuario. |
| `ai_avatar_url` | TEXT | Avatar de la IA asignada al usuario. |
| `created_at` / `updated_at` | TIMESTAMPTZ | Timestamps del registro. |

### 🚀 Sistema de Misiones

#### Tabla: `misiones`
Representa una expedición o ruta táctica iniciada por el explorador.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador de la misión. |
| `user_id` | UUID (FK) | Explorador que inició la misión. |
| `nombre` | TEXT | Nombre asignado a la expedición. |
| `descripcion` | TEXT | Detalles y objetivos. |
| `estado` | TEXT | Estado ('planificada', 'activa', 'completada', 'abortada'). Default: `planificada`. |
| `fecha_inicio` / `fecha_fin` | TIMESTAMPTZ | Tiempos de duración de la misión. |
| `created_at` | TIMESTAMPTZ | Fecha de creación. |

### 🛰️ Telemetría y Seguimiento

#### Tabla: `mission_telemetry`
Resumen de la telemetría vital asociada a una misión.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador del registro. |
| `mission_id` | UUID (FK) | Misión a la que pertenece (Cascade Delete). |
| `battery_level` | NUMERIC(5,2) | Nivel de batería del traje/rover. |
| `oxygen_level` | NUMERIC(5,2) | Nivel de soporte vital O2. |
| `temperature` | NUMERIC(5,2) | Temperatura ambiental externa. |
| `radiation_level`| NUMERIC(5,2) | Nivel de radiación medida (Sieverts/h). |
| `heart_rate` | INTEGER | Ritmo cardíaco del explorador (BPM). |
| `timestamp` | TIMESTAMPTZ | Momento de la lectura. |

#### Tabla: `telemetry_samples`
Puntos de tracking espacial (GPS) en alta frecuencia.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador del ping de ubicación. |
| `mission_id` | UUID (FK) | Misión a la que pertenece. |
| `lat` / `lng` | DOUBLE PRECISION| Coordenadas geográficas exactas. |
| `altitude` | DOUBLE PRECISION| Elevación. |
| `speed` / `heading` | DOUBLE PRECISION| Velocidad y rumbo de desplazamiento. |
| `timestamp` | TIMESTAMPTZ | Marca temporal del punto. |

### 📦 Taxonomía y Objetos Descubiertos

#### Tabla: `categorias` & `subcategorias`
Estructura de clasificación jerárquica para lo que escanea la IA.
*   `categorias` (id, nombre, descripcion)
*   `subcategorias` (id, categoria_id, nombre, descripcion)

#### Tabla: `etiquetas` & `objeto_etiquetas`
Sistema de etiquetado múltiple (N:M).
*   `etiquetas` (id, nombre, color)
*   `objeto_etiquetas` (objeto_id, etiqueta_id)

#### Tabla: `objetos_exploracion` (El Registro Principal)
Todos los escaneos (Point of Interests, Minerales, Anomalías) detectados y guardados.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | ID único del objeto. |
| `user_id` | UUID (FK) | Explorador que lo descubrió. |
| `mission_id` | UUID (FK) | Misión durante la cual se halló. |
| `categoria_id` | UUID (FK) | Top-level taxonomía. |
| `subcategoria_id`| UUID (FK) | Low-level taxonomía. |
| `nombre` | TEXT | Nombre/Alias del objeto. |
| `descripcion` | TEXT | Notas o reporte generado por IA. |
| `lat` / `lng` | DOUBLE PRECISION| Ubicación del hallazgo. |
| `confidence` | FLOAT | Nivel de certeza de la red neuronal/scanner. |
| `image_url` | TEXT | Rastro fotográfico en el Storage (Bucket). |
| `attributes` | JSONB | Data flexible no relacional (composición química, etc). |

### 🤖 Comunicación y Logs

#### Tabla: `chat_logs`
Historial de interacción texto/comandos entre el Explorador y la IA del Sistema.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | ID de la interación. |
| `user_id` | UUID (FK) | Usuario asociado. |
| `session_id` | UUID | Agrupación de la sesión de chat. |
| `message` | TEXT | Contenido de la transcripción. |
| `role` | VARCHAR(20) | Emisor: 'user', 'assistant', 'system'. |
| `metadata` | JSONB | Contexto adicional (tokens usados, intenciones). |
| `created_at` | TIMESTAMPTZ | Fecha de emisión. |

#### Tabla: `user_notifications`
Historial de alertas del sistema (Event Feed).
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | ID alerta. |
| `user_id` | UUID (FK) | Dueño de la alerta. |
| `message` | TEXT | Contenido descriptivo (ej: Caída de presión O2). |
| `type` | VARCHAR(20) | Severidad: 'critical', 'warning', 'success', 'info'. |
| `read` | BOOLEAN | Si ha sido vista u ocultada del HUD en vivo. |

---

## 🗂️ Storage (Buckets)

*   **Bucket Relacionado:** Se espera la existencia de un bucket (ej. `scans` u `objects`) donde reside la metadata binaria enlazada por la columna `image_url` de la tabla `objetos_exploracion`.
*   **Avatares:** Posible uso de un bucket `avatars` para la columna `avatar_url` en `profiles`.

---

## 🔒 Security (RLS)
Todas las tablas incluyen políticas *Row-Level Security* activas.
Patrón común de seguridad en las sentencias de la base de datos:
`USING ((auth.uid() = user_id))`
Garantizando que las Inserciones, Actualizaciones, Borrados y Selecciones solo operen sobre los recursos que estrictamente pertenecen a la credencial del explorador que hace la petición.
