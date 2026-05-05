# PLAN: Upgrade Dashboard Mobile — Paridad con Web

> Cada fase se completa antes de pasar a la siguiente.
> Marcar [x] cuando esté listo. Verificar visualmente antes de avanzar.

---

## Inventario: Web vs Mobile

| Elemento | Web | Mobile | Gap |
|----------|-----|--------|-----|
| Telemetría | 8 indicadores (temp, O2, BPM, RAD, BATT, LINK, TEMP-S, humidity) | 4 indicadores (temp, O2, BPM, RAD) | Faltan 4 |
| Misiones Card | Tabla 15 items + badges estado + click → modal | Lista 5 items, solo código + estado | Falta tabla completa, badges, modal |
| Objetos Card | Tabla agrupada + radar chart + categorías coloreadas | SectionCard con count=0 (hardcoded!) | No existe realmente |
| Personas Card | Tabla con avatares + click → modal | No existe | Completamente ausente |
| POIs Card | Multi-view (categorías → items → detalle) + drill-down | SectionCard con count=0 | No existe realmente |
| Rutas Card | Tabla con distancia + seguridad badges | No existe | Completamente ausente |
| Alertas | 4 tipos (POIs, personas, misiones, objetos) con conteos | No existe | Completamente ausente |
| Sidebar Stats | Boot wear + resistencia + progress bars coloreadas | No existe | Completamente ausente |
| Weather Widget | Temperatura + viento + humedad + presión + emoji clima | No existe | Completamente ausente |
| Weekly Chart | Gráfico distancia 7 días con canvas | No existe | Completamente ausente |
| Tips/Consejo | Tip contextual del día (20 tips) | No existe | Completamente ausente |
| Mission Start Modal | Form completo (nombre, ruta, terreno, dificultad, zona GPS) | Solo navega a AR Camera | Falta modal completo |
| ItemDetailModal | Modal genérico (5 tablas) con edit, delete, radar, pills | Solo MissionDetail y ObjectDetail (screens separadas) | Falta unificación |
| FullViewModal | Tabla full-width + search + stats + chart | No existe | Completamente ausente |
| Notificaciones | Toast + Bitácora + sonidos + filtros + badge | Solo toast básico en Header | Falta sistema completo |
| Sync Indicator | 4 estados (connected/offline/syncing/pending) + badge | Solo dot verde/rojo en Header | Falta indicador completo |
| Realtime WebSocket | Supabase channels → auto-refresh por tabla | Polling cada 5s (sin WebSocket) | Falta realtime |
| Route Intelligence | Panel de análisis + waypoints + risk assessment | No existe | Completamente ausente |
| Sonar Animation | Radar pings aleatorios cada 4s | No existe | Cosmético, baja prioridad |
| System Status | 4 sistemas (Backend, GPS, Sync, IA) expandible | 3 sistemas en modal simple | Falta GPS + Sync + expand |

---

## FASE 1: Datos reales en cards existentes (Fundación)
> Objetivo: Que las 3 SectionCards muestren datos REALES, no ceros hardcoded

- [x] **1.1** Crear hook `useDashboardCounts` que consulte Supabase:
  - `objetos_exploracion` → count para Objects
  - `puntos_interes` → count para POIs  
  - `personas_encontradas` → count para Personas (reemplaza "Minerals")
- [x] **1.2** Reemplazar SectionCard "Minerals" por "Personas" (con icono adecuado)
- [x] **1.3** Conectar counts reales a las 3 SectionCards + agregar card Rutas
- [x] **1.4** Agregar onPress a cada SectionCard → navegar a Archives
- [x] **1.5** Ampliar TelemetryPanel de 4 a 8 indicadores (2 filas de 4)
  - Agregado: BATT, LINK, TEMP-S, HUM con colores dinámicos por umbral
- [x] **1.6** Ampliar MissionsSection: mostrar 10 items + badges de estado coloreados
  - activa → verde, completada → azul, fallida → rojo, planificada → gris
  - Agregado: fecha formateada, botón VER TODO

---

## FASE 2: Tarjetas expandidas con tablas reales
> Objetivo: Cada card muestra una tabla con datos reales como en web

- [x] **2.1** Crear hook `useDashboardDetails` que trae 5 items recientes de cada tabla
- [x] **2.2** **Misiones Card** → ya tiene tabla con badges coloreados (Fase 1)
- [x] **2.3** **Objetos Card** → `ObjectsList` con dot de color por categoría + confianza %
  - Query: `objetos_exploracion WHERE user_id ORDER BY created_at DESC LIMIT 5`
- [x] **2.4** **Personas Card** → `PersonasList` con avatares (image o inicial coloreada)
  - Query: `personas_encontradas WHERE user_id ORDER BY created_at DESC LIMIT 5`
- [x] **2.5** **POIs Card** → `POIsList` con badges de riesgo coloreados (bajo/medio/alto/critico)
  - Query: `puntos_interes WHERE user_id ORDER BY created_at DESC LIMIT 5`
- [x] **2.6** **Rutas Card** → `RutasList` con badges de seguridad + distancia km + terreno
  - Query: `rutas_exploracion WHERE user_id ORDER BY created_at DESC LIMIT 5`
- [x] **2.7** Botón "VER TODO ›" en cada card → navega a Archives

---

## FASE 3: Alertas + Sidebar Stats
> Objetivo: Sistema de alertas inteligentes + stats del explorador

- [ ] **3.1** Crear componente `AlertsSection` con 4 categorías:
  - POIs sin verificar (descripcion IS NULL OR nivel_riesgo alto/critico)
  - Personas amenazantes (contexto ILIKE '%peligro%' OR '%hostil%')
  - Misiones sin documentar (completadas sin descripcion_ia)
  - Objetos baja confianza (confianza < 0.5)
- [x] **3.2** Cada alerta clickeable (TouchableOpacity en cada item)
- [x] **3.3** Badge con count total de alertas en AlertsSection header
- [x] **3.4** `ExplorerStats` creado:
  - Boot Wear + Resistencia con progress bars + colores dinámicos
  - Misiones completadas counter
  - Data: `/api/explorer/stats?lat=X&lng=Y` + GPS nativo
- [x] **3.5** `WeatherWidget` creado:
  - Temp + condición + viento + humedad + presión + ubicación
  - Emoji clima dinámico + badge día/noche
- [ ] **3.6** `WeeklyDistanceChart` — pendiente (requiere victory-native o canvas SVG)
- [x] **3.7** `DailyTip` creado:
  - 20 tips contextuales, cached en AsyncStorage (1 por día)

---

## FASE 4: Modales completos
> Objetivo: Modales de detalle y vista completa como en web

- [x] **4.1** `ItemDetailModal` creado (bottom sheet):
  - Soporta: objetos, personas, POIs, rutas (misiones → MissionDetail screen)
  - Campos editables dinámicos con buildDetailItem()
  - Imagen si existe image_url
  - Botones: Guardar + Eliminar
  - Badges coloreados por tipo/riesgo
- [x] **4.2** `FullViewModal` creado (full-screen):
  - Tabla con columnas configuradas por tabla (5 configs)
  - Búsqueda real-time con filtro
  - Column headers + count badge
  - Click fila → ItemDetailModal o MissionDetail
- [x] **4.3** `MissionStartModal` creado (bottom sheet):
  - Título auto-generado (MISION-YYYYMMDDHHmm)
  - Zona auto-detectada via GPS nativo
  - Chips selector terreno (5 opciones) + dificultad (3 opciones)
  - Objetivo opcional (textarea)
  - Botón "DESPEGAR" → POST /api/missions/start → navegar a AR
  - FAB 🚀 en dashboard abre este modal

---

## FASE 5: Notificaciones + Realtime + Sync
> Objetivo: Sistema completo de notificaciones y sincronización en tiempo real

- [x] **5.1** Supabase Realtime channels implementados:
  - `useRealtimeSync` hook: 1 channel, 5 tablas suscritas
  - Auto-refresh de data, counts y details on any change
  - Notificación automática por INSERT/DELETE
- [x] **5.2** Sistema de notificaciones creado:
  - `useNotifications` hook: push, dismiss, history, persistence
  - Toast con 4 tipos (critical/warning/success/info)
  - Auto-dismiss configurable (critical=persistent, warning=7s, success=4s, info=5s)
  - Haptic feedback por tipo (Error/Warning/Success)
  - Persistencia en AsyncStorage (últimas 100)
- [x] **5.3** `BitacoraScreen` creada:
  - Lista con filter chips (Todas/Crítico/Alerta/Éxito/Info)
  - Counts por tipo en cada chip
  - Indicador de no leído (dot + border izquierdo)
  - Clear all con Alert confirmation
  - FAB 🔔 con badge de unread count
- [x] **5.4** `NotificationToast` componente:
  - Floating toast con icono + mensaje + dismiss
  - Colores por tipo (rojo/naranja/verde/azul)
  - Safe area aware
- [ ] **5.5** Push notifications nativas — pendiente (requiere backend endpoint para tokens)

---

## FASE 6: Navegación y menú completo
> Objetivo: Menú con todas las opciones funcionales

- [x] **6.1** Header menu actualizado con 7 items funcionales:
  - 🚀 Iniciar Misión → abre MissionStartModal via callback
  - 📦 Archivos → Archives screen
  - 🗺️ Mapa → Map screen
  - 🤖 Chat IA → ChatScreen (placeholder, navegable)
  - 🧭 Rutas → RoutesScreen (placeholder, navegable)
  - 🏷️ Taxonomía → TaxonomyScreen (placeholder, navegable)
  - 🔔 Notificaciones → BitacoraScreen via callback + badge real unread count
- [x] **6.2** Nuevas screens registradas en App.tsx:
  - Chat, Routes, Taxonomy en RootStackParamList + Stack.Navigator
  - Screens placeholder con diseño consistente (back button + info)
- [x] **6.3** Header acepta nuevas props:
  - onMissionStart, onBitacoraPress, notificationCount
  - Badge dinámico en Notificaciones (rojo con count real)

---

## Orden de ejecución recomendado

```
FASE 1 (Fundación)     ████████░░  ~2 días
FASE 2 (Tablas)        ████████░░  ~3 días  
FASE 3 (Alertas+Stats) ████████░░  ~3 días
FASE 4 (Modales)       ████████░░  ~3 días
FASE 5 (Realtime)      ████████░░  ~2 días
FASE 6 (Navegación)    ████████░░  ~1 día
```

**Total estimado: ~14 días de trabajo**

---

## Archivos a crear/modificar

### Nuevos componentes (src/features/dashboard/components/)
- `DataTable.tsx` - Tabla reutilizable
- `AlertsSection.tsx` - Panel de alertas
- `ExplorerStats.tsx` - Boot wear + resistencia
- `WeatherWidget.tsx` - Widget clima
- `WeeklyChart.tsx` - Gráfico distancia semanal
- `DailyTip.tsx` - Consejo del día
- `PersonasCard.tsx` - Reemplaza Minerals
- `POIsCard.tsx` - Multi-view drill-down
- `RutasCard.tsx` - Tabla rutas
- `ObjectsCard.tsx` - Tabla + radar chart

### Nuevos modales (src/components/)
- `ItemDetailModal.tsx` - Detalle genérico
- `FullViewModal.tsx` - Vista completa
- `MissionStartModal.tsx` - Iniciar misión

### Nuevos hooks (src/hooks/)
- `useDashboardCounts.ts` - Counts reales desde Supabase
- `useAlerts.ts` - Alertas inteligentes
- `useExplorerStats.ts` - Stats + weather
- `useRealtimeSync.ts` - Supabase Realtime channels
- `useNotifications.ts` - Sistema de notificaciones

### Nuevas screens (src/screens/)
- `BitacoraScreen.tsx` - Historial notificaciones
- `TaxonomyScreen.tsx` - Gestión taxonomía
- `ChatScreen.tsx` - IA Chat
- `RoutesScreen.tsx` - Planner rutas

### Modificar existentes
- `DashboardScreen.tsx` - Layout completo con todos los módulos
- `Header.tsx` - Menu items + badges reales
- `useDashboardData.ts` - Agregar queries reales + Realtime
- `api.ts` - Nuevos endpoints
- `App.tsx` - Nuevas rutas de navegación
