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

BEM-style, prefixed `lk-`:
```
.lk-{component}                   block
.lk-{component}--{modifier}       block modifier
.lk-{component}__{element}        element inside a block
```

Examples:
```
.lk-btn  .lk-btn--primary  .lk-btn--sm  .lk-btn--dense
.lk-modal  .lk-modal__header  .lk-modal__body  .lk-modal--open
.lk-input  .lk-input--error
.lk-field  .lk-label  .lk-field-error
.lk-grid  .lk-grid--cols-3  .lk-col-span-2
.lk-flex  .lk-flex--justify-between
```

Utility classes follow `lk-{property}-{value}`:
```
.lk-m-4  .lk-mx-auto  .lk-pt-2
.lk-hidden  .lk-sr-only  .lk-w-full
```

---

## Component style catalog

Every component supports a `--dense` modifier for compact UI. Dense reduces padding, gaps, and font sizes proportionally.

### Avatar — `_avatar.scss`
```
.lk-avatar                        — circle, 2.5rem default
  --xs / --sm / --lg / --xl       — size variants
  --square / --rounded            — shape variants
  --secondary / --accent          — color variants
  --dense                         — compact sizing
  > img                           — auto-covers
.lk-avatar-group                  — overlapping stack (flex row-reverse)
```

### Badge — `_badge.scss`
```
.lk-badge                         — pill, primary bg
  --secondary / --accent / --positive / --warning / --negative / --info
  --outline                       — transparent bg, border color
  --dot                           — 0.5rem indicator, no text
  --square                        — rounded-sm instead of pill
  --dense                         — smaller padding & font
```

### Bar — `_bar.scss`
```
.lk-bar                           — flex row, 3.5rem min-height, bottom border
  __start / __center / __end      — flex sections
  __title                         — semibold, truncated
  --primary / --dark / --flat / --raised / --sticky
  --dense                         — 2.5rem, tighter padding
```

### Breadcrumbs — `_breadcrumbs.scss`
```
.lk-breadcrumbs                   — flex row, list-style none
  __item                          — inline-flex, separator via ::after ('/')
    --active                      — current page, no link
  --arrow                         — separator becomes '›'
  --dot                           — separator becomes '·'
  --dense                         — xs font, tighter gaps
```

### Button — `_button.scss`
```
.lk-btn                           — inline-flex, padding 12px/20px (proportional)
  --primary / --secondary / --ghost / --positive / --negative / --warning / --info
  --sm / --lg                     — size variants (proportional padding)
  --dense                         — compact (4px/8px, sm font)
    --dense--sm / --dense--lg     — dense size combos
  --full-width                    — width: 100%
  :disabled / [aria-disabled]     — 50% opacity

.lk-btn-group                     — inline-flex, collapsed borders, shared radius

.lk-btn-dropdown                  — relative container
  __caret                         — CSS triangle
  __menu                          — absolute dropdown panel (hidden by default)
  __item                          — full-width button row
    --active                      — primary-tinted bg
  __divider                       — horizontal rule
  --open                          — shows __menu
  --dense                         — smaller menu items
```

### Card — `_card.scss`
```
.lk-card                          — bordered, rounded-lg, overflow hidden
  __media > img                   — full-width cover
  __header / __body / __footer    — padded sections with borders
  __title / __subtitle            — typography
  --flat / --raised / --hover / --primary
  --dense                         — compact padding/font throughout
```

### Carousel — `_carousel.scss`
```
.lk-carousel                      — relative, overflow hidden
  __track                         — flex row, transform-based sliding
  __slide                         — flex 0 0 100%
  __prev / __next                 — absolute nav buttons, pill shape
  __indicators                    — flex center, dots
  __dot                           — 0.5rem circle, --active turns primary
  --dense                         — smaller controls & dots
```

### Chip — `_chip.scss`
```
.lk-chip                          — inline-flex, pill, surface bg
  --primary / --secondary / --positive / --warning / --negative / --info
  --filled                        — solid color bg
  --outline                       — border only
  --clickable                     — cursor + hover effect
  __close                         — small X button
  --square                        — rounded corners instead of pill
  --dense                         — xs font, tighter padding
```

### Input — `_input.scss`
```
.lk-input                         — block, bordered, focus ring
  --error                         — red border + ring
  :disabled                       — surface bg, 60% opacity
.lk-field                         — flex-col wrapper
.lk-label                         — sm, medium weight
.lk-field-error                   — sm, negative color
```

### List — `_list.scss`
```
.lk-list                          — unstyled list
  --bordered                      — border + radius + overflow
  --separated                     — border-top between items
  --dense                         — smaller items

.lk-list-item                     — flex row, 3rem min-height
  __start / __content / __end     — flex sections
  __label / __secondary           — text styles
  --clickable                     — hover bg
  --active                        — primary-tinted bg
  --disabled                      — 50% opacity

.lk-list-header                   — uppercase subheader
```

### Modal — `_modal.scss`
```
.lk-modal-overlay                 — fixed, centered, overlay bg
.lk-modal                         — dialog panel, shadow-lg
  __header / __body / __footer    — sections
  __title / __close               — header items
.lk-modal--open                   — opacity + pointer-events toggle
```

### Pagination — `_pagination.scss`
```
.lk-pagination                    — flex row
  __item                          — inline-flex wrapper
  __link                          — 2.25rem square, bordered on hover
    --active                      — primary bg
    --disabled                    — 40% opacity
  __ellipsis                      — non-interactive '…'
  --bordered / --round
  --dense                         — 1.75rem, xs font
```

### Progress — `_progress.scss`
```
.lk-progress                      — 0.5rem tall bar, surface bg
  __bar                           — primary fill, width via inline style
  --positive / --warning / --negative / --info / --accent — bar colors
  --xs / --sm / --lg / --xl       — height variants
  --square                        — no border-radius
  --striped                       — diagonal stripe pattern
  --animated                      — moving stripes
  --indeterminate                 — sliding 30% bar
  --labeled + __label             — centered percentage text
  --dense                         — 0.25rem height
```

### Rating — `_rating.scss`
```
.lk-rating                        — inline-flex, gap-1
  __item                          — star button, 1.5rem
    --active                      — warning color
    --half                        — 60% opacity
  --sm / --lg                     — size variants
  --primary / --negative          — color variants
  --readonly                      — no cursor/hover
  --disabled                      — 50% opacity
  --dense                         — no gap, 1.125rem items
```

### Slider — `_slider.scss`
```
.lk-slider                        — relative flex, 2rem min-height
  __track                         — 0.25rem bar
  __fill                          — primary fill
  __thumb                         — 1rem circle, draggable
  __label                         — tooltip above thumb on hover
  __ticks / __tick                — position markers
  --positive / --negative / --accent
  --disabled                      — 50% opacity, no interaction
  --dense                         — thinner track, smaller thumb
```

### Spinner — `_spinner.scss`
```
.lk-spinner                       — 2rem border-spinner, 0.75s rotation
  --xs / --sm / --lg / --xl       — size variants (proportional border)
  --secondary / --accent / --positive / --warning / --negative / --info
  --on-dark                       — white border
  --dense                         — compact sizes
```

### Splitter — `_splitter.scss`
```
.lk-splitter                      — flex row
  __pane                          — overflow auto
  __handle                        — 6px drag bar, col-resize cursor
    grip dots via ::after
  --vertical                      — flex-col, row-resize
  --bordered                      — outer border + radius
  --dense                         — 3px handle
```

### Table — `_table.scss`
```
.lk-table                         — collapse, full-width
  thead th                        — semibold, 2px bottom border
  --bordered                      — all cell borders
  --hover                         — row hover bg
  --striped                       — odd rows highlighted
  --striped-even                  — even rows highlighted
  --compact                       — smaller padding + font
  --flat                          — no cell borders (header only)
  --fixed                         — table-layout fixed
  tr.lk-table__row--active/positive/warning/negative — row tints
  --dense                         — xs font, minimal padding

.lk-table-wrap                    — overflow-x auto
```

### Timeline — `_timeline.scss`
```
.lk-timeline                      — unstyled list
  __item                          — flex + vertical line via ::before
  __dot                           — 1rem circle, colored ring
    --primary / --positive / --warning / --negative / --info
  __content / __title / __time / __body
  --dense                         — smaller dots, tighter spacing
```

### Toolbar — `_toolbar.scss`
```
.lk-toolbar                       — flex row, subtle bg, border
  __group                         — flex, gap-1
  __separator                     — vertical 1px divider
  __spacer                        — flex-grow
  --flat / --primary / --dark
  --dense                         — tighter padding, no group gap
```

### Tooltip — `_tooltip.scss`
```
.lk-tooltip                       — relative inline-block
  __content                        — absolute, dark bg, xs font, opacity 0
    --top / --bottom / --left / --right — position + arrow via ::after
  --open / :hover / :focus-within  — opacity 1
  --dense                          — half-space padding
```

---

## Layout & utilities

### Grid — `_grid.scss`
```
.lk-grid                 — CSS grid, gap-4
  --cols-1…12            — repeat columns
  --gap-sm / --gap-lg / --gap-0
.lk-col-span-1…12       — grid-column span
```

### Flex — `_flex.scss`
```
.lk-flex                 — display flex
  --inline / --col / --row / --wrap / --nowrap
  --justify-start…around
  --align-start…stretch
  --gap-sm / --gap-md / --gap-lg
  --grow / --shrink / --none
```

### Spacing — `_spacing.scss`
```
.lk-m-{0…10}  .lk-p-{0…10}     — all sides
.lk-mx-{n}  .lk-my-{n}          — axis
.lk-px-{n}  .lk-py-{n}
.lk-m{t|r|b|l}-{n}  .lk-p{t|r|b|l}-{n}
.lk-mx-auto  .lk-ml-auto  .lk-mr-auto
```

### Display — `_display.scss`
```
.lk-block / .lk-inline / .lk-inline-block / .lk-hidden
.lk-visible / .lk-invisible / .lk-sr-only
.lk-overflow-hidden / -auto / -scroll
.lk-relative / .lk-absolute / .lk-fixed / .lk-sticky
.lk-w-full / .lk-h-full / .lk-w-auto / .lk-h-auto

.lk-text-left / .lk-text-center / .lk-text-right

.lk-items-start / -center / -end / -stretch         — align-items
.lk-justify-start / -center / -end / -between / -around / -evenly  — justify-content
.lk-self-start / -center / -end / -stretch           — align-self

.lk-center         — flex + items-center + justify-center (block)
.lk-center-inline  — inline-flex + items-center + justify-center
```

### Responsive — `_responsive.scss`
```
.lk-hidden-{sm|md|lg|xl|2xl}-up       — hide at breakpoint and above
.lk-hidden-{xs|sm|md|lg|xl}-down      — hide below breakpoint
.lk-visible-{xs|sm|md|lg|xl}-only     — show only in range
.lk-grid--cols-{sm|md|lg|xl}-{1…12}   — responsive grid columns
.lk-col-span-{sm|md|lg|xl}-{1…12}     — responsive column spans
.lk-container                          — responsive max-width
.lk-container--fluid                   — 100% width
.lk-flex--col-sm / --col-md            — responsive column direction
.lk-text-center-sm / -md / .lk-text-left-md / .lk-text-right-md
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
// 5. components/avatar, badge, bar, breadcrumbs, button, card, carousel, chip,
//    input, list, modal, pagination, progress, rating, slider, spinner,
//    splitter, table, timeline, toolbar, tooltip
// 6. utilities/spacing, utilities/display, utilities/responsive   ← must be last (highest specificity)
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
- **Dense modifier**: every component must support `--dense` for compact layouts. Dense reduces padding/gaps proportionally and steps font-size down one scale notch.

---

## Theming model

Two-layer cascade:
1. `tokens/_color.scss` sets all defaults on `:root`
2. `tokens/custom/_color.scss` loaded after — same specificity, later wins
3. Runtime: any `:root { --lk-primary: … }` in a `<style>` tag overrides both
4. Scoped: `style="--lk-primary: …"` on an element scopes the override to that subtree

This means theming never requires changing component code — only token values.
