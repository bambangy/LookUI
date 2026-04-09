# LookUI — AI Reference

This file is the primary context document for AI-assisted development on LookUI.
Read this before touching any file. It encodes all architectural decisions and naming conventions.

---

## What this project is

A **vanilla JS + CSS component library**. No framework, no virtual DOM, no reactivity.
Output: two files — `dist/look.js` (UMD) and `dist/look.css`.
Built with: Rollup (JS) + Sass + PostCSS autoprefixer (CSS).

---

## Core design rule

> Every component is a factory function that returns a plain object with a `destroy()` method.
> The **controller** owns the lifecycle. The library never cleans up on its own.

```js
// pattern every component must follow
export function MyComponent(el, options = {}) {
  const node = typeof el === 'string' ? qs(el) : el;
  // ... setup ...
  return {
    el: node,
    destroy() { /* undo everything */ }
  };
}
```

---

## File map — critical paths

| What you want to change | File |
|---|---|
| Color palette | `src/scss/tokens/_color.scss` (defaults) / `tokens/custom/_color.scss` (overrides) |
| Type scale, font family, weights | `src/scss/tokens/_typography.scss` / `tokens/custom/_typography.scss` |
| Spacing, radius, shadows, z-index, breakpoints | `src/scss/tokens/_layout.scss` / `tokens/custom/_layout.scss` |
| CSS import order | `src/scss/main.scss` |
| DOM helpers + event bus | `src/js/core/index.js` |
| Reusable behaviors (lkToggleable, lkFocusTrap) | `src/js/behaviors/index.js` |
| Component factories (Button, Modal, Input) | `src/js/components/index.js` |
| JS public API surface | `src/js/index.js` (re-exports all three above) |
| Build config | `rollup.config.js`, `package.json`, `.postcssrc.cjs` |
| Live demo | `examples/index.html` |

---

## Token naming convention

All CSS custom properties are prefixed `--lk-`.

### Color tokens
```
--lk-primary / --lk-primary-light / --lk-primary-dark / --lk-primary-contrast
--lk-secondary / --lk-secondary-light / --lk-secondary-dark / --lk-secondary-contrast
--lk-accent / --lk-accent-light / --lk-accent-dark / --lk-accent-contrast
--lk-positive / --lk-positive-light / --lk-positive-dark / --lk-positive-contrast
--lk-warning  / --lk-warning-light  / --lk-warning-dark  / --lk-warning-contrast
--lk-negative / --lk-negative-light / --lk-negative-dark / --lk-negative-contrast
--lk-info     / --lk-info-light     / --lk-info-dark     / --lk-info-contrast
--lk-bg / --lk-bg-subtle / --lk-surface / --lk-overlay
--lk-text / --lk-text-muted / --lk-text-on-dark
--lk-border / --lk-border-strong
--lk-shadow-color   (raw "R G B" triplet for use inside rgb())
```

### Typography tokens
```
--lk-font-sans / --lk-font-serif / --lk-font-mono
--lk-font-family  (defaults to --lk-font-sans)
--lk-text-xs / -sm / -base / -md / -lg / -xl / -2xl / -3xl / -4xl
--lk-weight-thin / light / regular / medium / semibold / bold / extrabold
--lk-leading-none / tight / snug / normal / relaxed / loose
--lk-line-height  (defaults to --lk-leading-normal)
--lk-tracking-tight / normal / wide / wider / widest
--lk-prose-max-width
```

### Layout tokens
```
--lk-space-1 … -2 … -3 … -4 … -5 … -6 … -7 … -8 … -9 … -10 … -12 … -16
--lk-radius-none / -sm / (default) / -md / -lg / -xl / -2xl / -full
--lk-border-width / -width-md / -width-lg
--lk-shadow-xs / -sm / (default) / -md / -lg / -xl / -inner / -none
--lk-container-sm / -md / -lg / -xl / -2xl / -fluid
--lk-grid-columns / --lk-grid-gutter
--lk-duration-instant / fast / base / slow / slower
--lk-easing-default / -in / -out / -spring
--lk-z-below / base / raised / dropdown / sticky / overlay / modal / toast / tooltip
```

SCSS breakpoint variables (for @media, not in CSS):
```scss
$look-bp-sm: 480px  $look-bp-md: 768px  $look-bp-lg: 1024px
$look-bp-xl: 1280px  $look-bp-2xl: 1536px
```

---

## CSS class naming convention

BEM-style, prefixed `look-`:
```
.lk-{component}                   block
.lk-{component}--{modifier}       block modifier
.lk-{component}__{element}        element inside a block
```

Examples:
```
.lk-btn  .lk-btn--primary  .lk-btn--sm
.lk-modal  .lk-modal__header  .lk-modal__body  .lk-modal--open
.lk-input  .lk-input--error
.lk-field  .lk-label  .lk-field-error
.lk-grid  .lk-grid--cols-3  .lk-col-span-2
.lk-flex  .lk-flex--justify-between
```

Utility classes follow `look-{property}-{value}`:
```
.lk-m-4  .lk-mx-auto  .lk-pt-2
.lk-hidden  .lk-sr-only  .lk-w-full
```

---

## JS public API

`window.Look` (UMD global) exposes:

```
version                              string
qs(selector, context?)               → Element|null
qsa(selector, context?)              → Element[]
createElement(tag, attrs?, text?)    → Element
on(event, handler)                   → void
off(event, handler)                  → void
emit(event, data?)                   → void
lkToggleable(triggerEl, targetEl, activeClass?) → { destroy }
lkFocusTrap(containerEl)               → { destroy }
lkButton(el)                           → { el, destroy }
lkModal(triggerEl, modalEl)            → { open, close, destroy }
lkInput(el)                            → { el, setError, clearError, destroy }
```

---

## Build pipeline

```
src/js/index.js
  └─ Rollup + @rollup/plugin-node-resolve
       └─ dist/look.js  (UMD, name: 'Look', exports: named)

src/scss/main.scss
  └─ Sass (Dart Sass 1.x, @use not @import)
       └─ dist/look.raw.css  (intermediate, deleted after)
            └─ PostCSS + autoprefixer (.postcssrc.cjs)
                 └─ dist/look.css
```

`package.json` has `"type": "module"` — so `.postcssrc.cjs` must stay `.cjs`, not `.js`.
`rollup.config.js` uses ESM `import` syntax — works because of `"type": "module"`.

---

## main.scss load order (do not change order)

```scss
// 1. Default tokens     — tokens/_color, _typography, _layout
// 2. Custom token overrides — tokens/custom/_color, _typography, _layout
//    (aliased with 'as token-color', 'as custom-color' etc to avoid @use namespace collisions)
// 3. base/reset, base/typography
// 4. layout/grid, layout/flex
// 5. components/button, modal, input
// 6. utilities/spacing, utilities/display   ← must be last (highest specificity)
```

When adding a new partial, insert it in the correct section.
All custom/ files load after their corresponding default — this is how overrides work.

---

## Conventions to follow when adding code

- **New component JS**: factory function, accepts `el` (string or Element), returns `{ el, destroy }` minimum.
- **New component SCSS**: one partial file, BEM classes, use `--lk-*` tokens only (no hardcoded hex colors).
- **New token**: add to the appropriate `tokens/_*.scss` default file first; add stub comment to `tokens/custom/_*.scss`.
- **No `@import`** in SCSS — always `@use`. Sass `@import` is deprecated.
- **No hardcoded colors** in component partials — always reference a `--lk-*` token.
- **No inline JS logic inside SCSS** and no CSS-in-JS. The pipeline is strictly separated.
- `examples/index.html` must be updated whenever a new component is added.

---

## Theming model

Two-layer cascade:
1. `tokens/_color.scss` sets all defaults on `:root`
2. `tokens/custom/_color.scss` loaded after — same specificity, later wins
3. Runtime: any `:root { --lk-primary: … }` in a `<style>` tag overrides both
4. Scoped: `style="--lk-primary: …"` on an element scopes the override to that subtree

This means theming never requires changing component code — only token values.
