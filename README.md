# LookUI

A no-frills JavaScript & CSS library for UI components.
Imperative, predictable, and MVC-friendly.

---

## Quick start

```bash
npm install
npm run build
```

Open `examples/index.html` in a browser to see all components.

---

## Prerequisites

- Node.js 18+
- npm 9+

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run build` | Full build — JS then CSS |
| `npm run build:js` | Rollup bundles `src/js/index.js` → `dist/look.js` (UMD) |
| `npm run build:css` | Sass compiles `src/scss/main.scss` → PostCSS autoprefixes → `dist/look.css` |
| `npm run dev` | Rollup watch mode (JS only) |

---

## Using the output files

### In a plain HTML page

```html
<link rel="stylesheet" href="dist/look.css" />
<script src="dist/look.js"></script>
```

Everything is available on the `window.Look` global:

```js
Look.version        // '0.1.0'
Look.qs(selector)   // document.querySelector wrapper
Look.qsa(selector)  // returns Array, not NodeList
Look.createElement(tag, attrs, text)
Look.on(event, fn)  // global event bus
Look.off(event, fn)
Look.emit(event, data)
Look.lkToggleable(triggerEl, targetEl, activeClass)
Look.lkFocusTrap(containerEl)
Look.lkButton(el)
Look.lkModal(triggerEl, modalEl)
Look.lkInput(el)
```

### As a module

```js
import { Button, Modal, Input } from './dist/look.js';
```

---

## Component API

All components follow the same pattern: **factory function → plain object with `destroy()`**.
The caller (controller) owns the lifecycle. No hidden subscriptions remain after `destroy()`.

### Button

```js
const btn = Look.lkButton('#my-button');
// btn.el        — the DOM element
// btn.destroy() — removes lk-btn class
```

Variants (CSS modifier): `lk-btn--primary`, `--secondary`, `--ghost`, `--positive`, `--negative`
Sizes: `lk-btn--sm`, `lk-btn--lg`
State: `lk-btn--full-width`, `disabled`, `aria-disabled="true"`

### Modal

```js
const modal = Look.lkModal('#open-trigger', '#modal-container');
modal.open();
modal.close();
modal.destroy(); // removes all event listeners
```

Required HTML structure:
```html
<div id="modal-container">
  <div class="lk-modal-overlay">
    <div class="lk-modal" role="dialog" aria-modal="true">
      <div class="lk-modal__header"> … </div>
      <div class="lk-modal__body"> … </div>
      <div class="lk-modal__footer"> … </div>
    </div>
  </div>
</div>
```

JS toggles `.lk-modal--open` on the container. Focus is trapped inside while open.

### Input

```js
const field = Look.lkInput('#email');
field.setError();    // adds lk-input--error + aria-invalid
field.clearError();  // removes both
field.destroy();     // removes all lk-input classes
```

Field wrapper pattern:
```html
<div class="lk-field">
  <label class="lk-label" for="email">Email</label>
  <input id="email" type="email" />
  <span class="lk-field-error">Error message here</span>
</div>
```

---

## Theming

### Method 1 — edit custom token files (rebuild required)

Edit any of the three override stubs in `src/scss/tokens/custom/`.
They load after the defaults, so only your declarations override.

```scss
/* src/scss/tokens/custom/_color.scss */
:root {
  --lk-primary:          #00897b;
  --lk-primary-dark:     #00695c;
  --lk-primary-contrast: #ffffff;
}
```

Then run `npm run build:css`.

### Method 2 — runtime override (no rebuild)

Redefine any `--lk-*` property after the stylesheet loads:

```html
<!-- global -->
<style>:root { --lk-primary: #00897b; }</style>

<!-- scoped to one section -->
<div style="--lk-primary: #e91e63; --lk-primary-contrast: #fff;">
  <button class="lk-btn lk-btn--primary">Pink</button>
</div>
```

---

## Layout utilities

### Grid

```html
<div class="lk-grid lk-grid--cols-3 lk-grid--gap-lg">
  <div>col 1</div>
  <div>col 2</div>
  <div>col 3</div>
</div>
```

Column modifiers: `lk-grid--cols-1` … `--cols-12`
Gap modifiers: `lk-grid--gap-sm`, `--gap-lg`, `--gap-0`
Span helper: `lk-col-span-1` … `lk-col-span-12`

### Flex

```html
<div class="lk-flex lk-flex--justify-between lk-flex--align-center lk-flex--gap-md">
  …
</div>
```

---

## Project structure

```
LookUI/
├── dist/                       ← build output (gitignored)
│   ├── look.js                 ← UMD bundle — window.Look global
│   └── look.css                ← compiled + autoprefixed CSS
├── examples/
│   └── index.html              ← open in browser after build
├── src/
│   ├── js/
│   │   ├── index.js            ← Rollup entry, re-exports everything
│   │   ├── core/index.js       ← qs, qsa, createElement, on/off/emit
│   │   ├── behaviors/index.js  ← lkToggleable, lkFocusTrap
│   │   └── components/index.js ← Button, Modal, Input
│   └── scss/
│       ├── main.scss           ← Sass entry, @use import order
│       ├── tokens/
│       │   ├── _color.scss     ← default color palette
│       │   ├── _typography.scss← default type scale + weights
│       │   ├── _layout.scss    ← default spacing, radius, shadows, z-index
│       │   ├── _variables.scss ← @forward index (convenience import)
│       │   └── custom/         ← project overrides — edit to theme
│       ├── base/               ← reset, typography rules
│       ├── layout/             ← grid, flex
│       ├── components/         ← button, modal, input
│       └── utilities/          ← spacing, display
├── package.json
├── rollup.config.js
└── .postcssrc.cjs
```

---

## Adding a new component

1. Create `src/scss/components/_newcomponent.scss`
2. Add `@use 'components/newcomponent';` to `src/scss/main.scss` (section 5)
3. Export `function NewComponent(el) { … }` from `src/js/components/index.js`
4. Run `npm run build`

The factory must return at minimum `{ el, destroy() }`.
