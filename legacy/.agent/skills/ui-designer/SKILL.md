---
name: UI-Designer
description: KEPLER Design System — Comprehensive visual guidelines, tokens, and component patterns used across the entire application (Dashboard, AR, Modals, Notifications). Use this skill whenever creating or modifying any UI component, module, or screen.
---

# KEPLER UI Design System Skill

> **MANDATORY**: Before creating ANY new UI component, modal, card, panel, or screen in the KEPLER project, consult this skill to ensure visual consistency across the entire application.

---

## 1. Design Philosophy

KEPLER follows a **Dark Glassmorphism** design language inspired by Death Stranding's holographic HUDs. Every surface should feel like a translucent glass panel floating in deep space.

### Core Principles
- **Dark-first**: All backgrounds are near-black (`#000`, `#111`, `#0a0a0f`)
- **Glass Panels**: Semi-transparent backgrounds with `backdrop-filter: blur()`
- **Soft Edges**: Rounded corners (`border-radius: 12px–20px`), never sharp or squared
- **Subtle Borders**: Thin `rgba(255,255,255,0.06–0.1)` borders, never solid colored borders
- **Depth via Shadow**: Use `box-shadow` for elevation, not flat outlines
- **Cyan Accent**: `#3FA8FF` is the signature interactive/accent color
- **Restrained Color**: Semantic colors used sparingly, mostly via badges and edge indicators
- **Hidden Scrollbars**: Use `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`

---

## 2. CSS Custom Properties (Design Tokens)

All tokens are defined in `apps/web/src/css/tokens.css`. **Always use these variables** instead of hardcoded values.

### Color Palette

```css
/* Primary - Mars Red */
--color-primary-500: #ff6b6b;   /* Base */
--color-primary-600: #fa5252;
--color-primary-700: #e03131;

/* Secondary - Deep Space Blue */
--color-secondary-500: #339af0; /* Base */
--color-secondary-600: #228be6;

/* Accent - Mineral Gold */
--color-accent-500: #fab005;

/* Semantic */
--color-success: #51cf66;
--color-warning: #ffd43b;
--color-error: #ff6b6b;
--color-info: #74c0fc;
```

### Backgrounds

```css
--bg-primary: #0a0a0f;                     /* Deepest background (body/page) */
--bg-secondary: #1a1a24;                   /* Panel/sidebar background */
--bg-tertiary: #252535;                     /* Card hover/elevated surface */
--bg-glass: rgba(26, 26, 36, 0.7);         /* Glassmorphism base */
--bg-dash-primary: rgba(17, 17, 17, 0.9);  /* Dashboard modal/card bg */
--bg-dash-card: #323232;                    /* Elevated card */
--bg-dash-card-dark: #212121;              /* Darker card variant */
--bg-dash-blur: rgba(17, 17, 17, 0.7);    /* Blur panel */
```

> **Card Standard**: The primary card background is `#111` (solid dark). Glass panels use `rgba()` + `backdrop-filter`.

### Typography

```css
--font-primary: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "Courier New", monospace;
--font-jura: 'Jura', -apple-system, BlinkMacSystemFont, sans-serif;  /* Dashboard titles */
```

- **Dashboard**: Uses `var(--font-jura)` for the main container
- **Everything else**: Uses `var(--font-primary)` for body text and components
- **Code/Data**: Uses `var(--font-mono)` for technical readouts

### Font Sizes (Typography Scale)

| Class | Size | Weight | Use Case |
|---|---|---|---|
| `.text-h1` | 3rem | 700 | Hero/Main titles |
| `.text-h2` | 2.25rem | 600 | Section headers |
| `.text-h3` | 1.875rem | 600 | Card section titles |
| `.text-h4` | 1.5rem | 500 | Sub-headers |
| `.text-h5` | 1.25rem | 500 | Widget titles |
| `.text-body` | 1rem | 400 | Standard text |
| `.text-body-sm` | 0.875rem | 400 | Secondary text, descriptions |
| `.text-caption` | 0.75rem | 400 | Labels, metadata, timestamps |

### Spacing

```css
--spacing-xs: 0.25rem;  /* 4px */
--spacing-sm: 0.5rem;   /* 8px */
--spacing-md: 1rem;     /* 16px */
--spacing-lg: 1.5rem;   /* 24px */
--spacing-xl: 2rem;     /* 32px */
--spacing-2xl: 3rem;    /* 48px */
```

### Border Radius

```css
--radius-sm: 4px;       /* Small UI elements (badges inner) */
--radius-md: 8px;       /* Buttons, inputs */
--radius-lg: 12px;      /* Cards, toasts, panels */
--radius-xl: 16px;      /* Large panels, sidebars */
--radius-full: 9999px;  /* Pills, badges, avatars */
--radius-dash: 20px;    /* Dashboard main cards and modals */
```

### Shadows

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
--shadow-glow: 0 0 20px rgba(255, 107, 107, 0.3);        /* Red glow */
--shadow-glow-blue: 0 0 20px rgba(51, 154, 240, 0.3);    /* Blue glow */
--glow-cyan: 0 0 20px rgba(63, 168, 255, 0.5);           /* Cyan glow */
--glow-cyan-strong: 0 0 30px rgba(63, 168, 255, 0.7);    /* Stronger cyan */
```

### Z-Index Stack

```css
--z-base: 1;
--z-dropdown: 1000;
--z-sticky: 1100;
--z-fixed: 1200;
--z-modal-backdrop: 1300;
--z-modal: 1400;
--z-popover: 1500;
--z-tooltip: 1600;
```

### Transitions

```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 3. Component Patterns

### 3.1 Dashboard Cards (`.dash-card`)

The standard container for all dashboard sections.

```css
.dash-card {
    background: #111;
    border-radius: 14px;
    padding: 20px 24px;
    position: relative;
    overflow: hidden;
}
```

**Rules:**
- Background: solid `#111` (not glass/transparent)
- Border-radius: `14px`
- Padding: `20px 24px`
- No visible borders (unless highlighted)
- Contains a `.card-header-row` (flex, space-between) with a `.card-title`

### 3.2 Data Tables (`.dash-table`)

```css
.dash-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}
/* Header */
thead th {
    position: sticky; top: 0;
    background: #111; /* matches card */
    color: #666;
    font-weight: 500;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.8rem;
    letter-spacing: 0.5px;
}
/* Rows */
tbody td {
    padding: 10px;
    color: #ccc;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
tbody tr { transition: background 0.2s ease; cursor: pointer; }
tbody tr:hover { background: rgba(255, 255, 255, 0.04); }
```

**Rules:**
- Table wrapper: `max-height: 245px; overflow-y: auto; scrollbar-width: none;`
- Headers are sticky with matching `#111` background
- Row hover: `rgba(255, 255, 255, 0.04)` — very subtle
- Row separators: `1px solid rgba(255, 255, 255, 0.03)` — almost invisible

### 3.3 Status Badges

Badges use a **translucent background** with matching text color.

```css
.badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
}
```

**Semantic badge colors (background → text):**

| Badge | Background | Text Color |
|---|---|---|
| Active/Seguro | `rgba(0, 200, 120, 0.15)` | `#00c878` |
| Completed | `rgba(63, 168, 255, 0.15)` | `#3FA8FF` |
| Failed/High Risk | `rgba(255, 60, 60, 0.15)` | `#ff3c3c` |
| Planned/Medium Risk | `rgba(255, 180, 0, 0.15)` | `#ffb400` |
| Unknown | `rgba(150, 150, 150, 0.15)` | `#999` |

**Pattern**: Always `rgba(color, 0.15)` background + solid `color` text.

### 3.4 Glassmorphism Panels (Notifications, Sidebars)

For floating panels like the notification log, use:

```css
.glass-panel {
    background: rgba(10, 14, 20, 0.75);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-shadow: -15px 0 40px rgba(0, 0, 0, 0.5);
    font-family: var(--font-primary);
}
```

**Rules:**
- Blur: `16px–24px` (panels), `10px` (cards)
- Background alpha: `0.65–0.75`
- Borders: thin `rgba(255,255,255,0.08)` — barely visible
- Always add `-webkit-backdrop-filter` for Safari support

### 3.5 Modals

```css
/* Overlay */
.modal-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: var(--z-modal-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
}
/* Content Panel */
.modal-content {
    background: var(--bg-dash-primary);
    border: 1px solid #3FA8FF;          /* Cyan accent border */
    border-radius: var(--radius-dash);  /* 20px */
    width: 400px;
    max-width: 90%;
    max-height: 80vh;
    box-shadow: 0 0 30px rgba(63, 168, 255, 0.3);
    animation: slideInRight 0.3s ease-out;
}
```

**Rules:**
- Overlay: `rgba(0,0,0,0.8)` + `blur(5px)` — heavy darkening
- Content: Cyan accent border (`#3FA8FF`), `border-radius: 20px`
- Shadow: Cyan glow `rgba(63, 168, 255, 0.3)`
- Animation: `slideInRight` or `slideUp` on entry
- Close button: `×` or SVG cross, hovers to `#ff4444`

### 3.6 Form Inputs (AR Context)

For inputs inside AR modals:

```css
input[type="text"], textarea, select {
    width: 100%;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fff;
    font-family: var(--font-primary);
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.2s ease;
}
input:focus, textarea:focus, select:focus {
    border-color: rgba(63, 168, 255, 0.5);
    box-shadow: 0 0 0 2px rgba(63, 168, 255, 0.15);
}
```

### 3.7 Custom Select Dropdowns

```css
.select-wrapper { position: relative; width: 100%; }
select {
    appearance: none;
    -webkit-appearance: none;
    padding-right: 40px;  /* room for chevron */
}
.select-chevron {
    position: absolute;
    right: 14px; top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: rgba(255, 255, 255, 0.6);
}
select option {
    background: #0f141c;   /* Solid dark for native dropdown */
    color: #fff;
}
```

### 3.8 Notification Toasts

```css
.holo-notification {
    background: rgba(15, 20, 28, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px 20px;
    font-family: var(--font-primary);
    box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
}
```

**Semantic edge lights (left bar, 4px wide):**
- Critical: `#ff4444`
- Warning: `#ffbb33`
- Success: `#00d4aa`
- Info: `#33b5e5`

### 3.9 Buttons (Action / Toggle)

```css
/* Primary Action */
.btn-action {
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: transparent;
    color: #fff;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}
.btn-action:hover { background: rgba(255,255,255,0.08); }
.btn-action.active { border-color: #3FA8FF; color: #3FA8FF; }

/* Toggle */
.toggle-btn {
    padding: 6px 16px;
    border-radius: 4px;
    border: 1px solid #555;
    background: transparent;
    color: #888;
    cursor: pointer;
}
.toggle-btn.active { border-color: #00ff00; color: #00ff00; }
```

### 3.10 Avatars (Personas)

```css
.persona-avatar {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: #222;
    object-fit: cover;
}
```

Color-coded initials fallback using a palette: `['#ff6b6b', '#ffa94d', '#69db7c', '#74c0fc', '#b197fc']`

---

## 4. Animation Patterns

### Entry Animations
```css
@keyframes slideInSoft {
    from { opacity: 0; transform: translateX(40px) scale(0.95); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
}
```

### Emphasis
```css
@keyframes criticalPulse {
    0%   { box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
    100% { box-shadow: 0 10px 30px rgba(255,68,68,0.15); }
}
@keyframes border-glow {
    0%, 100% { border-color: rgba(63,168,255,0.3); }
    50%      { border-color: rgba(63,168,255,0.8); }
}
```

### Hover Patterns
- Cards: `transform: translateY(-2px)` + enhanced shadow
- Buttons: `background: rgba(255,255,255,0.08)`
- Close buttons: `transform: rotate(90deg)` or `scale(1.1)`
- Delete buttons: color transition to `#ff4444`

---

## 5. Layout Patterns

### Dashboard Grid
```css
.dash-body { display: grid; grid-template-columns: 1fr 340px; gap: 30px; }
.cards-row { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
```

### List Items (POIs, Alerts)
```css
.list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s ease;
}
.list-item:hover { background: rgba(255, 255, 255, 0.04); }
```

### Bottom Navigation / Action Bar (AR)
```css
.ar-bottom-bar {
    position: fixed;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    padding: 15px;
    width: 100%;
}
```

---

## 6. Icon Guidelines

- **SVG Inline Icons**: For close buttons, navigation, and UI chrome — use inline `<svg>` with `stroke="currentColor"` so they inherit text color
- **Emoji Icons**: Acceptable for notification types (🚨, ⚠️, ✅, ℹ️) and data labels (📍, 📅)
- **Icon Size**: 18px for buttons, 16px for inline, 35px for alert items
- **Icon Opacity**: Use `opacity: 0.8` on decorative icons, `1` on actionable ones

---

## 7. Color Quick Reference

| Purpose | Color | Usage |
|---|---|---|
| Accent / Interactive | `#3FA8FF` | Links, highlights, active states, borders |
| Success / Active | `#00c878` | Active badges, safe indicators |
| Warning / Medium | `#ffb400` | Warning badges, planned states |
| Error / Danger | `#ff3c3c` / `#ff4444` | Error badges, delete hovers, critical |
| Text Primary | `#fff` | Titles, important text |
| Text Secondary | `#ccc` | Body text, table cells |
| Text Muted | `#888` / `#666` | Timestamps, labels, metadata |
| Text Disabled | `#555` | Inactive elements, placeholder |
| Dividers | `rgba(255,255,255,0.03–0.06)` | Table rows, section borders |

---

## 8. Responsive Breakpoints

```css
@media (max-width: 1200px) { /* Tablet adjustments */ }
@media (max-width: 768px)  { /* Mobile: single column, full-width panels */ }
@media (max-width: 480px)  { /* Small mobile: reduced padding */ }
```

**Mobile rules:**
- Panels go full-width (`width: 100%`)
- Cards stack vertically
- Font sizes reduce by ~10%
- Padding reduces to `15px`

---

## 9. File Reference

| File | Purpose |
|---|---|
| `apps/web/src/css/tokens.css` | Global CSS custom properties (design tokens) |
| `apps/web/src/css/style.css` | Global base styles |
| `apps/web/src/css/fonts.css` | Font imports (Inter, Jura, JetBrains Mono) |
| `apps/web/src/css/notifications.css` | Notification toasts + log panel |
| `apps/web/src/features/dashboard/css/base.css` | Dashboard layout grid |
| `apps/web/src/features/dashboard/css/dashboard-cards.css` | Cards, tables, badges, POIs, alerts |
| `apps/web/src/features/dashboard/css/modal.css` | Modal overlay + content patterns |
| `apps/web/src/features/dashboard/css/sidebar.css` | Sidebar profile + stats |
| `apps/web/src/features/ar/ar.css` | AR HUD elements |

---

## 10. Checklist for New Components

Before shipping any new UI element, verify:

- [ ] Uses `var(--font-primary)` or `var(--font-jura)` — no browser defaults
- [ ] Background is `#111` (cards) or `rgba()` + `backdrop-filter` (panels)
- [ ] Border-radius is `12px–20px` — never sharp corners
- [ ] Borders use `rgba(255,255,255,0.06–0.1)` — never solid white
- [ ] Hover states use `rgba(255,255,255,0.04–0.08)` backgrounds
- [ ] Badges follow the `rgba(color, 0.15)` background + solid text pattern
- [ ] Scrollbars are hidden (`scrollbar-width: none`)
- [ ] Animations use `cubic-bezier(0.16, 1, 0.3, 1)` or `ease-out`
- [ ] Interactive accent color is `#3FA8FF`
- [ ] Mobile responsive at `768px` breakpoint
