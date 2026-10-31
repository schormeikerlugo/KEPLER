# Session Guard — Auto-Logout

## Descripción
Módulo que cierra la sesión automáticamente en dos escenarios para asegurar que el usuario pase por el login y el loader en cada arranque.

## Archivo
`apps/web/src/js/session-guard.js`

## Comportamientos

### 1. Logout al cerrar la app
- Evento: `beforeunload` (se dispara al cerrar pestaña, ventana, o apagar sistema)
- Acción: Limpia los tokens de Supabase del `localStorage` (claves que empiezan con `sb-` y terminan con `-auth-token`)
- **Nota:** No usa `fetch` ya que las peticiones async no completan durante `beforeunload`

### 2. Logout por inactividad
- Temporizador de **15 minutos** sin interacción
- Eventos monitoreados: `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`, `click`
- Cualquier interacción reinicia el temporizador
- Al expirar: llama `auth.logout()` y redirige a `/login`

## Configuración
```javascript
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos
```
Para cambiar el tiempo, editar esta constante.

## Integración
Se activa en `main.js` solo para usuarios autenticados:
```javascript
import { initSessionGuard } from './js/session-guard.js';

// Dentro de route(), después de verificar autenticación:
if (user && !window.kepler.realtime) {
    window.kepler.realtime = new RealtimeService();
    initSessionGuard(); // ← Aquí
}
```

## Por qué no afecta la página de Login
`initSessionGuard()` solo se ejecuta dentro del bloque `if (user)`, por lo que la página de login nunca activa el guard.
