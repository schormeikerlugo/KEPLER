# KEPLER Design System

## Arquitectura CSS

```
css/
├── tokens.css              ← Tokens originales (colores, fonts, spacing, shadows)
├── system/
│   ├── tokens.css          ← Tokens extendidos (blur, overlays, borders, z-index)
│   ├── base.css            ← Reset scoped, keyframes compartidos, scrollbar utils
│   ├── components.css      ← Modal system, cards, inputs, buttons, badges
│   └── utilities.css       ← Helpers (flex, glass, text, z-layers)
├── fonts.css               ← @font-face Jura
├── style.css               ← Globals (body, SPA transitions)
├── holo-logo.css           ← Logo holografico
└── notifications.css       ← Toast + bitacora + deep-dive
```

**Principio:** Mobile-first. Base = mobile. `@media (min-width: 768px)` agrega desktop.

---

## Tokens Extendidos (`system/tokens.css`)

### Blur Scale
| Token | Valor | Uso |
|---|---|---|
| `--blur-xs` | 4px | Backdrops sutiles |
| `--blur-sm` | 8px | Modal backdrop (default) |
| `--blur-md` | 16px | Glass panels |
| `--blur-lg` | 24px | Modales internos |
| `--blur-xl` | 50px | Dashboard header |

### Overlays
| Token | Valor |
|---|---|
| `--overlay-light` | rgba(0,0,0,0.5) |
| `--overlay-medium` | rgba(0,0,0,0.7) |
| `--overlay-heavy` | rgba(0,0,0,0.85) |

### Borders
| Token | Valor | Uso |
|---|---|---|
| `--border-holo` | rgba(63,168,255,0.4) | Borde principal cyan |
| `--border-holo-strong` | rgba(63,168,255,0.8) | Hover/focus |
| `--border-holo-subtle` | rgba(63,168,255,0.15) | Modales, cards |
| `--border-subtle` | rgba(255,255,255,0.06) | Dividers |
| `--border-muted` | rgba(255,255,255,0.1) | Inputs idle |

### Z-Index Scale
| Token | Valor | Uso |
|---|---|---|
| `--z-base` | 1 | Elementos base |
| `--z-raised` | 10 | Ligeramente elevados |
| `--z-sticky` | 50 | Headers sticky |
| `--z-dropdown` | 100 | Menus desplegables |
| `--z-overlay` | 500 | Overlays de sección |
| `--z-modal-bg` | 1000 | Backdrop de modal |
| `--z-modal` | 1100 | Modal content |
| `--z-notification` | 5000 | Bitacora |
| `--z-toast` | 10000 | Toast popups |
| `--z-system` | 20000 | Confirmaciones sistema |

---

## Modal System (`system/components.css`)

### Estructura HTML
```html
<div class="k-modal-overlay" id="mi-modal">
    <div class="k-modal k-modal--md">
        <div class="k-modal__header">
            <h3 class="k-modal__title">Titulo</h3>
            <button class="k-modal__close">&times;</button>
        </div>
        <div class="k-modal__body">
            <!-- Contenido scrollable -->
        </div>
        <div class="k-modal__footer">
            <button class="k-btn k-btn--danger">Cancelar</button>
            <button class="k-btn k-btn--primary">Confirmar</button>
        </div>
    </div>
</div>
```

### Con imagen (--lg)
```html
<div class="k-modal-overlay" id="detail-modal">
    <div class="k-modal k-modal--lg">
        <div class="k-modal__header">
            <h3 class="k-modal__title">Detalle</h3>
            <button class="k-modal__close">&times;</button>
        </div>
        <div class="k-modal__content">
            <div class="k-modal__image">
                <img src="..." alt="..." />
            </div>
            <div class="k-modal__body">
                <!-- Form fields -->
            </div>
        </div>
        <div class="k-modal__footer">
            <button class="k-btn k-btn--danger">Eliminar</button>
            <button class="k-btn k-btn--primary">Guardar</button>
        </div>
    </div>
</div>
```

### Tamanos
| Clase | Mobile | Desktop |
|---|---|---|
| `.k-modal--sm` | 100% | 420px |
| `.k-modal--md` | 100% | 600px |
| `.k-modal--lg` | 100% (vertical) | 900px (grid 300px + 1fr) |
| `.k-modal--full` | 100% | 95vw, 90vh |

### Comportamiento mobile
- Todos los modales son 100% width con 12px padding del overlay
- Max-height: 88vh con scroll interno
- Imagen arriba, form abajo (column)
- `--lg`: sin grid, stack vertical

### Comportamiento desktop
- Centrado, tamano segun variante
- `--lg`: grid 2 columnas (imagen izquierda, form derecha)
- Max-height segun variante

### Abrir/Cerrar en JS
```js
// Abrir
document.getElementById('mi-modal').classList.add('is-open');

// Cerrar con animacion
const overlay = document.getElementById('mi-modal');
overlay.classList.add('is-closing');
setTimeout(() => overlay.classList.remove('is-open', 'is-closing'), 250);
```

---

## Formularios

```html
<div class="k-field">
    <label class="k-label">Nombre</label>
    <input class="k-input" placeholder="..." />
    <span class="k-hint">Texto de ayuda opcional</span>
</div>

<div class="k-field-row">
    <div class="k-field">
        <label class="k-label">Tipo</label>
        <select class="k-select">...</select>
    </div>
    <div class="k-field">
        <label class="k-label">Estado</label>
        <select class="k-select">...</select>
    </div>
</div>

<div class="k-field">
    <label class="k-label">Notas</label>
    <textarea class="k-textarea" placeholder="..."></textarea>
</div>
```

- `.k-field` tiene `gap: 6px` interno (label → input)
- `.k-field + .k-field` tiene `margin-top: 18px` (espacio entre campos)
- `.k-field-row` = 1 columna en mobile, 2 columnas en desktop
- Labels: font `0.72rem`, `#666`, uppercase, `1.5px` letter-spacing
- Inputs: padding `12px 16px`, `border-radius: 10px`, font `0.88rem`

---

## Botones

| Clase | Uso |
|---|---|
| `.k-btn--primary` | Accion principal (cyan) |
| `.k-btn--danger` | Eliminar/cancelar (rojo) |
| `.k-btn--confirm` | Confirmar (verde) |
| `.k-btn--ghost` | Accion secundaria (gris) |

---

## Badges

```html
<span class="k-badge k-badge--success">Activo</span>
<span class="k-badge k-badge--danger">Critico</span>
<span class="k-badge k-badge--warning">Precaucion</span>
<span class="k-badge k-badge--info">Info</span>
<span class="k-badge k-badge--neutral">Desconocido</span>
```

---

## Utilities

### Glass Effect
```html
<div class="k-glass">Panel glassmorphism</div>
<div class="k-glass--strong">Panel mas opaco</div>
```

### Texto
```html
<span class="k-text-muted">Texto sutil</span>
<span class="k-text-holo">Texto cyan</span>
<span class="k-text-sm k-text-upper">Label</span>
<span class="k-truncate">Texto largo que se corta...</span>
```

### Layout
```html
<div class="k-flex k-flex-between k-gap-md">...</div>
<div class="k-flex-col k-gap-sm">...</div>
```

---

## Migracion

Los componentes `k-` coexisten con el CSS antiguo. Para migrar un modal:

1. Reemplazar HTML classes por `k-modal-*`
2. Cambiar JS `style.display` por `classList.add('is-open')`
3. Eliminar CSS antiguo del modal
4. Verificar mobile + desktop
