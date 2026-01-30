# KEPLER Mobile - Mapa

## Arquitectura

El mapa móvil usa **@maplibre/maplibre-react-native** para renderizado nativo de vectores con el estilo Odradek.

## Componentes

```
src/components/map/
├── KeplerMap.tsx      # Componente principal MapLibre
├── MapControls.tsx    # Botones flotantes (ubicación, capas, refresh)
├── MapCoords.tsx      # Widget LAT/LNG/ZOOM
├── styles/
│   └── odradek.ts     # Estilo vector Odradek
└── index.ts           # Barrel exports
```

## Uso

```tsx
import { KeplerMap, MapControls, MapCoords } from '../components/map';

<KeplerMap
  center={[lng, lat]}
  zoom={14}
  onMapReady={() => console.log('Listo')}
/>
```

## Estilo Odradek

El estilo vectorial incluye:
- **Fondo oscuro** (#0a0f14)
- **Autopistas cyan** con glow (#00f7ff)
- **Edificios** con outline luminoso
- **Agua** con borde cyan
- **Labels** en cyan uppercase

## Requisitos

> ⚠️ Requiere **Expo Development Build** (no funciona con Expo Go)

```bash
npx expo prebuild
npx expo run:android
# o
npx expo run:ios
```

## Tiles

Usa **Protomaps API** para vectores:
```
https://api.protomaps.com/tiles/v3/{z}/{x}/{y}.mvt
```
