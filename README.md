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
```

### As a module

```js
import { lkTextbox, lkDropdown, lkCarousel } from './dist/look.js';
```

---

## Component API

All components follow the same pattern: **factory function → plain object with `destroy()`**.
The caller (controller) owns the lifecycle. No hidden subscriptions remain after `destroy()`.

### Base properties (all components)

Every component exposes these shared properties:

| Property | Type | Description |
|---|---|---|
| `el` | Element | The underlying DOM element |
| `id` | string | get/set element id |
| `hidden` | boolean | get/set — toggles visibility |
| `enabled` | boolean | get/set — toggles disabled state |

---

## UI Components

### Button

```js
const btn = Look.lkButton('#my-button');
// btn.el        — the DOM element
// btn.destroy() — removes lk-btn class
```

Variants (CSS): `lk-btn--primary`, `--secondary`, `--ghost`, `--positive`, `--negative`
Sizes: `lk-btn--sm`, `lk-btn--lg`

### Modal

```js
const modal = Look.lkModal('#open-trigger', '#modal-container');
modal.open();
modal.close();
modal.destroy();
```

Required HTML:
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

---

## Form Components

Form components automatically wrap the element in a `.lk-field` container with label and validation message when the `label` option is provided.

### Shared form properties

| Property | Type | Description |
|---|---|---|
| `value` | any | get/set — element value or checked state |
| `name` | string | get/set — form name attribute |
| `label` | string | get/set — label text |
| `required` | boolean | get/set — required attribute |
| `readonly` | boolean | get/set — readonly attribute |
| `setError(msg)` | fn | Show validation error message |
| `clearError()` | fn | Hide validation error |

### Textbox

Wraps `<input>` or `<textarea>` elements.

```js
const email = Look.lkTextbox('#email', {
  label: 'Email address',
  name: 'email',
  type: 'email',
  required: true,
});

email.value;               // get current value
email.value = 'test@x.co'; // set value
email.setError('Invalid email');
email.clearError();
email.destroy();
```

HTML (minimal — wrapper is auto-created):
```html
<input id="email" type="email" />
```

### Dropdown

Wraps `<select>` elements.

```js
const country = Look.lkDropdown('#country', {
  label: 'Country',
  name: 'country',
  items: [
    { value: '',   text: 'Select…' },
    { value: 'us', text: 'United States' },
    { value: 'uk', text: 'United Kingdom' },
  ],
});

country.value;              // selected value
country.selectedIndex;      // selected index
country.selectedText;       // display text of selected option
country.destroy();
```

HTML (minimal):
```html
<select id="country"></select>
```

### Checkbox

Wraps `<input type="checkbox">` elements.

```js
const agree = Look.lkCheckbox('#agree', {
  label: 'I agree to the terms',
  name: 'agree',
  checked: false,
});

agree.checked;              // boolean
agree.toggle();             // flip state
agree.value;                // same as checked
agree.destroy();
```

### Radio

Wraps `<input type="radio">` elements.

```js
const opt = Look.lkRadio('#option-a', {
  label: 'Option A',
  name: 'choice',
});

opt.checked;                // boolean
opt.value;                  // same as checked
opt.destroy();
```

### Switch

Wraps `<input type="checkbox">` as a toggle switch.

```js
const darkMode = Look.lkSwitch('#dark-mode', {
  label: 'Dark mode',
  name: 'darkMode',
  checked: false,
});

darkMode.checked;           // boolean
darkMode.toggle();          // flip state
darkMode.destroy();
```

---

## Interactive Components

### Carousel

```js
const carousel = Look.lkCarousel('#my-carousel', {
  autoplay: true,
  interval: 3000,
  loop: true,
});

carousel.activeIndex;       // current slide index
carousel.next();            // go to next slide
carousel.prev();            // go to previous slide
carousel.goTo(2);           // go to specific slide
carousel.destroy();
```

Required HTML:
```html
<div id="my-carousel" class="lk-carousel">
  <div class="lk-carousel__track">
    <div class="lk-carousel__slide">…</div>
    <div class="lk-carousel__slide">…</div>
  </div>
  <button class="lk-carousel__prev">‹</button>
  <button class="lk-carousel__next">›</button>
  <div class="lk-carousel__indicators">
    <button class="lk-carousel__dot"></button>
    <button class="lk-carousel__dot"></button>
  </div>
</div>
```

### Slider

```js
const vol = Look.lkSlider('#volume', {
  min: 0, max: 100, value: 50, step: 5,
  onChange(v) { console.log('Volume:', v); },
});

vol.value;                  // get current value
vol.value = 75;             // set value
vol.min; vol.max; vol.step; // get/set range
vol.destroy();
```

Required HTML:
```html
<div id="volume" class="lk-slider">
  <div class="lk-slider__track">
    <div class="lk-slider__fill"></div>
    <div class="lk-slider__thumb">
      <span class="lk-slider__label"></span>
    </div>
  </div>
</div>
```

### Tooltip

```js
const tip = Look.lkTooltip('#info-icon', {
  content: 'More information',
  position: 'top',    // top | bottom | left | right
});

tip.content = 'Updated text';
tip.show();
tip.hide();
tip.destroy();
```

### Rating

```js
const rating = Look.lkRating('#stars', {
  max: 5,
  value: 3,
  symbol: '★',
  onChange(v) { console.log('Rated:', v); },
});

rating.value;               // get rating
rating.value = 4;           // set rating
rating.readonly = true;     // disable interaction
rating.destroy();
```

HTML (stars auto-created if container is empty):
```html
<div id="stars"></div>
```

### Chip

```js
const tag = Look.lkChip('#tag', {
  label: 'JavaScript',
  removable: true,
  onRemove() { console.log('removed'); },
  onSelect(sel) { console.log('selected:', sel); },
});

tag.label;                  // get text
tag.selected;               // boolean
tag.destroy();
```

### Pagination

```js
const pager = Look.lkPagination('#pages', {
  totalPages: 20,
  page: 1,
  maxVisible: 7,
  onPageChange(p) { console.log('Page:', p); },
});

pager.page = 5;             // navigate to page
pager.totalPages = 30;      // update total
pager.destroy();
```

HTML (auto-populated):
```html
<ul id="pages"></ul>
```

### Progress

```js
const loader = Look.lkProgress('#upload', {
  value: 0, max: 100,
});

loader.value = 45;           // update progress
loader.indeterminate = true; // switch to loading animation
loader.destroy();
```

Required HTML:
```html
<div id="upload" class="lk-progress">
  <div class="lk-progress__bar"></div>
</div>
```

### Splitter

```js
const split = Look.lkSplitter('#editor', {
  sizes: [30, 70],
  minSize: 100,
});

split.sizes;                // [30, 70] as percentages
split.sizes = [50, 50];    // resize panes
split.destroy();
```

Required HTML:
```html
<div id="editor" class="lk-splitter">
  <div class="lk-splitter__pane">Left</div>
  <div class="lk-splitter__handle"></div>
  <div class="lk-splitter__pane">Right</div>
</div>
```

### Table

```js
const table = Look.lkTable('#data', {
  sortable: true,
  onSort({ column, order }) { console.log(column, order); },
});

table.sortBy = 2;           // sort by column index
table.sortOrder;             // 'asc' or 'desc'
table.destroy();
```

---

## Theming

### Method 1 — edit custom token files (rebuild required)

Edit any of the three override stubs in `src/scss/tokens/custom/`.

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
│   │   ├── helpers/            ← base.js (shared props), field.js (form wrapper)
│   │   └── components/         ← form.js + individual component files
│   └── scss/
│       ├── main.scss           ← Sass entry, @use import order
│       ├── tokens/             ← design tokens + custom overrides
│       ├── base/               ← reset, typography rules
│       ├── layout/             ← grid, flex
│       ├── components/         ← 25 component partials
│       └── utilities/          ← spacing, display, responsive
├── package.json
├── rollup.config.js
└── .postcssrc.cjs
```

---

## Adding a new component

1. Create `src/scss/components/_newcomponent.scss` (BEM, tokens only, support `--dense`)
2. Add `@use 'components/newcomponent';` to `src/scss/main.scss` (section 5, alphabetical)
3. Create `src/js/components/newcomponent.js` using `resolveEl` + `applyBase` from helpers
4. Re-export from `src/js/components/index.js`
5. Run `npm run build`

The factory must accept `(el, opts = {})` and return at minimum `{ el, destroy() }`.
