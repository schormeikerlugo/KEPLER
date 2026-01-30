---
description: How to add a new feature synchronized across Web, Desktop, and Mobile
---

# Sync Feature Workflow

Este workflow define los pasos para agregar un nuevo feature manteniendo sincronizadas las 3 plataformas.

## Pre-requisitos

- El paquete `@kepler/shared` debe estar compilado (`npm run build -w @kepler/shared`)
- La estructura de features debe existir en mobile (`apps/mobile/src/features/`)

---

## Paso 1: Definir el Feature

1. Crear documento de especificación en `/docs/features/[nombre-feature].md`
2. Definir:
   - Qué hace el feature
   - Qué datos consume/produce
   - Qué API endpoints necesita
   - Mockups si aplica

---

## Paso 2: Actualizar Shared Package

1. Agregar tipos a `packages/shared/src/types/[feature].ts`
2. Agregar constantes a `packages/shared/src/constants/[feature].ts` (si aplica)
3. Agregar utils a `packages/shared/src/utils/[feature].ts` (si aplica)
4. Actualizar barrel exports (`index.ts` de cada carpeta)
5. Compilar:

// turbo
```bash
cd packages/shared && npm run build
```

---

## Paso 3: Implementar en Web

1. Crear carpeta `apps/web/src/features/[feature]/`
2. Crear archivos:
   - `index.js` - Lógica principal
   - `template.html` - HTML template
   - `styles.css` - Estilos específicos
   - `modules/` - Sub-módulos si es complejo
3. Agregar ruta en `apps/web/src/main.js`
4. Probar en navegador: `npm run dev:web`

---

## Paso 4: Desktop (Automático)

- Desktop carga la web via Electron
- Solo agregar código si necesitas APIs nativas de Electron
- Verificar que funciona: `npm run dev:desktop`

---

## Paso 5: Implementar en Mobile

1. Crear screen `apps/mobile/src/screens/[Feature]Screen.tsx`
2. Crear folder `apps/mobile/src/features/[feature]/`
   - `components/` - Componentes específicos
   - `hooks/` - Hooks específicos
3. Importar tipos de `@kepler/shared`:
   ```typescript
   import type { Mission } from '@kepler/shared';
   import { formatDate, COLORS } from '@kepler/shared';
   ```
4. Agregar a navegación en `apps/mobile/src/navigation/`
5. Probar con Expo Go: `npm run dev:mobile`

---

## Paso 6: Actualizar Documentación

1. Actualizar `/docs/features/SYNC_MATRIX.md`:
   - Agregar fila del nuevo feature
   - Marcar estado en cada plataforma

2. Actualizar `/docs/features/CHANGELOG_UNIFIED.md`:
   - Agregar entrada bajo `[Unreleased]`
   - Etiquetar con `[WEB]`, `[MOBILE]`, etc.

---

## Paso 7: Commit

```bash
git add .
git commit -m "feat([feature]): [descripción]

- [WEB] Implementación completa
- [MOBILE] Implementación completa
- [SHARED] Tipos y utils agregados

Sync: SYNC_MATRIX.md actualizado"
```

---

## Estructura de Archivos Resultante

```
packages/shared/src/
├── types/[feature].ts      # Nuevos tipos
├── constants/[feature].ts  # Nuevas constantes (opcional)
└── utils/[feature].ts      # Nuevas utils (opcional)

apps/web/src/features/[feature]/
├── index.js
├── template.html
├── styles.css
└── modules/

apps/mobile/src/
├── screens/[Feature]Screen.tsx
└── features/[feature]/
    ├── components/
    └── hooks/
```

---

## Checklist Rápido

```markdown
## Feature: ____________

### Shared
- [ ] Tipos definidos
- [ ] Constants (si aplica)
- [ ] Utils (si aplica)
- [ ] Compilado

### Web
- [ ] Feature folder creado
- [ ] Ruta agregada
- [ ] Probado ✅

### Desktop
- [ ] Funciona con web ✅

### Mobile
- [ ] Screen creado
- [ ] Feature folder creado
- [ ] Navegación actualizada
- [ ] Probado en Expo ✅

### Docs
- [ ] SYNC_MATRIX.md actualizado
- [ ] CHANGELOG_UNIFIED.md actualizado
```
