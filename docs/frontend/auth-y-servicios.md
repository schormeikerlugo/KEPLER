# Autenticación y Servicios Compartidos

## Auth (`js/auth.js`)
Wrapper sobre el cliente de Supabase que expone métodos simples:

| Método | Descripción |
|---|---|
| `auth.login(email, password)` | Login con email/password |
| `auth.register(email, password)` | Registro de cuenta nueva |
| `auth.logout()` | Cierra la sesión (`signOut()`) |
| `auth.getUser()` | Obtiene el usuario actual de la sesión |
| `auth.getToken()` | Obtiene el JWT access token |

## ProfileService (`js/services/ProfileService.js`)
Servicio singleton para gestión del perfil:

| Método | Descripción |
|---|---|
| `getProfile()` | Obtiene perfil con cache |
| `getAvatarDisplay()` | Retorna tipo (image/emoji/letter) + valor del avatar |
| `_resolveAvatarUrl()` | Reescribe URLs inseguras para Electron |
| `invalidateCache()` | Limpia el cache del perfil |

## Header (`components/Header/Header.js`)
Componente del header global con:
- Dropdown de perfil (botón avatar)
- Logout (`auth.logout()`)
- Navegación a `/profile`
- Notificaciones

## Geolocalización (para clima)
El frontend obtiene la ubicación del explorador con una estrategia de 2 pasos:
1. **GPS:** `navigator.geolocation.getCurrentPosition()` (timeout 5s)
2. **Fallback IP:** `http://ip-api.com/json/?fields=lat,lon` (gratis, sin key)
3. **Default:** Si ambos fallan, no se envían coordenadas al backend

Implementado en `sidebar.js > fetchExplorerStats()`.
