# Perfil del Explorador

## Descripción
Página standalone (`/profile`) donde el usuario puede ver y editar su perfil, cambiar avatar, ver estadísticas de exploración, personalizar el avatar de la IA, y administrar seguridad.

## Archivos
- **HTML:** `apps/web/src/features/profile/profile.html`
- **CSS:** `apps/web/src/features/profile/profile.css`
- **Entry Point:** `apps/web/src/features/profile/index.js`

### Módulos JavaScript
| Archivo | Función |
|---|---|
| `modules/profile-data.js` | Carga y renderiza datos del perfil + avatar |
| `modules/form.js` | Formulario de edición (nombre, bio, ubicación) |
| `modules/avatar.js` | Modal de cambio de avatar (archivo, emoji, URL) |
| `modules/ai-avatar.js` | Selección del avatar del asistente IA |
| `modules/stats.js` | Estadísticas: misiones, objetos, POIs, horas |
| `modules/security.js` | Cambio de contraseña, cerrar sesión en todos lados |

## Avatar — Flujo de Carga
1. Usuario hace clic en **"Cambiar Avatar"** → abre modal.
2. Puede subir un **archivo de imagen** o seleccionar un **emoji**.
3. El archivo se sube a **Supabase Storage** (bucket `avatars`).
4. La URL pública se pasa por `ProfileService._resolveAvatarUrl()` para reescribir URLs inseguras (`http://` → `https://`).
5. Se guarda en `profiles.avatar_url`.

## Mixed Content Fix
En Electron, las URLs de Supabase Storage pueden ser `http://` lo cual causa bloqueo CSP. El método `_resolveAvatarUrl()` en `ProfileService.js` detecta URLs con `/storage/v1/object/public/` y las reescribe usando el origin seguro de `VITE_SUPABASE_URL`.

## Notificaciones
La página standalone del perfil importa `NotificationSystem` desde `js/components/NotificationSystem.js` para mostrar feedback al usuario (éxito/error al guardar, subir avatar, etc.).
