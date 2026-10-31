# 🔄 KEPLER Feature Sync Matrix

> **Última actualización:** 2026-01-30  
> **Versión actual:** 0.5.0

Esta matriz muestra el estado de sincronización de features entre las 3 plataformas.

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Implementado y sincronizado |
| ⚠️ | Parcialmente implementado |
| ❌ | No implementado |
| 🔄 | En progreso |
| N/A | No aplica a esta plataforma |

---

## Features Core

| Feature | Web | Desktop | Mobile | Última Sync | Notas |
|---------|:---:|:-------:|:------:|-------------|-------|
| **Login** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | Supabase Auth |
| **Dashboard** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | Modularizado + Header compartido |
| **AR Camera** | ✅ v0.5 | ✅ | ⚠️ v0.3 | 2026-01-15 | Mobile usa expo-camera |
| **Archives** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | Full Management (CRUD) |
| **Map** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | MapLibre + menú completo |
| **Map Menu** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | 7 opciones sincronizadas |
| **Profile** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | Header compartido |
| **Shared Header** | ✅ v0.5 | ✅ | ✅ v0.5 | 2026-01-30 | Menú drawer animado + toast |
| **Taxonomía** | ✅ v0.5 | ✅ | ❌ | - | Por crear en mobile |

---

## Features Dashboard Widgets

| Widget | Web | Desktop | Mobile | Notas |
|--------|:---:|:-------:|:------:|-------|
| Mission Card | ✅ | ✅ | ✅ | |
| Telemetry Panel | ✅ | ✅ | ✅ | Modularizado |
| Weather Display | ✅ | ✅ | ❌ | |
| Quick Actions | ✅ | ✅ | ✅ | |
| Recent Objects | ✅ | ✅ | ⚠️ | |

---

## Features AR

| Funcionalidad | Web | Desktop | Mobile | Notas |
|---------------|:---:|:-------:|:------:|-------|
| Camera Feed | ✅ | ✅ | ✅ | expo-camera en mobile |
| YOLO Detection | ✅ | ✅ | ⚠️ | Mobile usa backend API |
| Object Tracking | ✅ | ✅ | ❌ | |
| Capture Photo | ✅ | ✅ | ✅ | |
| Save to DB | ✅ | ✅ | ✅ | |
| Sentinel Mode | ✅ | ✅ | ❌ | |

---

## Servicios Backend

| Endpoint | Estado | Usado por |
|----------|--------|-----------|
| `/api/missions` | ✅ | Web, Mobile |
| `/api/objects` | ✅ | Web, Mobile |
| `/api/inference` | ✅ | Mobile |
| `/health` | ✅ | Todas |
| `/api/describe-zone` | ✅ | Web, Mobile |

---

## Próximas Sincronizaciones

- [ ] Dashboard: Agregar widget de clima a Mobile
- [ ] AR: Implementar Sentinel Mode en Mobile
- [ ] Taxonomía: Crear screen en Mobile
- [ ] AR: Object Tracking en Mobile (requiere optimización)

---

## Cómo Actualizar Esta Matriz

1. Al completar un feature en cualquier plataforma, actualizar el símbolo
2. Cambiar la fecha de "Última Sync" 
3. Agregar notas si hay diferencias de implementación
4. Mover items completados de "Próximas Sincronizaciones"
