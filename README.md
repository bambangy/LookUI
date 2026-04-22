# LookUI

A no-frills JavaScript and CSS library for UI components and composable utilities.
Imperative, predictable, and MVC-friendly.

---

## Quick start

```bash
npm install
npm run build
```

Open `examples/index.html` in a browser.

---

## Prerequisites

- Node.js 18+
- npm 9+

---

## npm scripts

| Script | Description |
|---|---|
| `npm run build` | Full build (JS then CSS) |
| `npm run build:js` | Rollup bundles `src/js/index.js` into `dist/look.js` |
| `npm run build:css` | Sass + PostCSS builds `dist/look.css` |
| `npm run dev` | Rollup watch mode (JS only) |

---

## Usage

### Browser (UMD)

```html
<link rel="stylesheet" href="dist/look.css" />
<script src="dist/look.js"></script>
<script>
  const btn = Look.lkButton('#my-btn');
</script>
```

### ESM

```js
import { lkButton, lkDialog, lkDataSource } from './dist/look.js';
```

---

## Core utilities

### `Look.qs(selector, ctx?)`

```js
const el = Look.qs('#app');
```

### `Look.qsa(selector, ctx?)`

```js
const buttons = Look.qsa('.lk-btn');
```

### `Look.createElement(tag, attrs?, text?)`

```js
const badge = Look.createElement('span', { class: 'lk-badge' }, 'New');
```

### Event bus: `Look.on`, `Look.off`, `Look.emit`

```js
function onSaved(data) { console.log(data); }
Look.on('saved', onSaved);
Look.emit('saved', { id: 1 });
Look.off('saved', onSaved);
```

---

## Behaviors

### `Look.lkToggleable(triggerEl, targetEl, activeClass?)`

```js
const t = Look.lkToggleable('#menu-btn', '#menu', 'is-open');
t.destroy();
```

### `Look.lkFocusTrap(containerEl)`

```js
const trap = Look.lkFocusTrap('#dialog');
trap.destroy();
```

---

## Element-bound Components

All element-bound components return plain objects. Most expose base properties:
- `el`
- `id`
- `hidden`
- `enabled`

### `Look.lkButton(el)`

```js
const btn = Look.lkButton('#save-btn');
btn.destroy();
```

### `Look.lkModal(triggerEl, modalEl)`

```js
const modal = Look.lkModal('#open-modal', '#modal-container');
modal.open();
modal.close();
modal.destroy();
```

### `Look.lkTextbox(el, opts?)`

Options:
- `label`, `name`, `required`, `readonly`, `type`

```js
const email = Look.lkTextbox('#email', {
  label: 'Email',
  name: 'email',
  type: 'email',
  required: true,
});

email.value = 'a@company.com';
email.setError('Invalid email');
email.clearError();
email.destroy();
```

### `Look.lkDropdown(el, opts?)`

Options:
- `label`, `name`, `required`, `readonly`
- `items: [{ value, text, selected?, disabled? }]`

```js
const country = Look.lkDropdown('#country', {
  label: 'Country',
  items: [
    { value: '', text: 'Select' },
    { value: 'th', text: 'Thailand' },
    { value: 'us', text: 'United States' },
  ],
});

console.log(country.value, country.selectedIndex, country.selectedText);
```

### `Look.lkCheckbox(el, opts?)`

Options:
- `label`, `name`, `required`, `readonly`, `checked`

```js
const agree = Look.lkCheckbox('#agree', { label: 'I agree', checked: false });
agree.toggle();
console.log(agree.checked, agree.value);
```

### `Look.lkRadio(el, opts?)`

Options:
- `label`, `name`, `required`, `readonly`, `checked`

```js
const optA = Look.lkRadio('#option-a', { label: 'Option A', name: 'group1' });
console.log(optA.checked);
```

### `Look.lkSwitch(el, opts?)`

Options:
- `label`, `name`, `required`, `readonly`, `checked`

```js
const darkMode = Look.lkSwitch('#dark-mode', { label: 'Dark mode' });
darkMode.toggle();
```

### `Look.lkCarousel(el, opts?)`

Options:
- `autoplay` (default `false`)
- `interval` (default `5000`)
- `loop` (default `true`)

```js
const carousel = Look.lkCarousel('#hero-carousel', {
  autoplay: true,
  interval: 3000,
  loop: true,
});

carousel.next();
carousel.prev();
carousel.goTo(2);
console.log(carousel.activeIndex);
```

### `Look.lkSlider(el, opts?)`

Options:
- `min` (default `0`)
- `max` (default `100`)
- `value` (default `min`)
- `step` (default `1`)
- `onChange(value)`

```js
const slider = Look.lkSlider('#price-slider', {
  min: 0,
  max: 100,
  step: 5,
  value: 25,
  onChange(v) { console.log('value', v); },
});

slider.value = 50;
```

### `Look.lkTooltip(el, opts?)`

Options:
- `content`
- `position`: `top | bottom | left | right` (default `top`)

```js
const tip = Look.lkTooltip('#help-icon', {
  content: 'More details',
  position: 'right',
});

tip.show();
tip.hide();
tip.content = 'Updated message';
```

### `Look.lkRating(el, opts?)`

Options:
- `max` (default `5`)
- `value` (default `0`)
- `readonly` (default `false`)
- `symbol` (default `*` visual star)
- `onChange(value)`

```js
const rating = Look.lkRating('#product-rating', {
  max: 5,
  value: 3,
  onChange(v) { console.log('rated', v); },
});

rating.value = 4;
rating.readonly = true;
```

### `Look.lkChip(el, opts?)`

Options:
- `label`
- `selected`
- `removable`
- `onSelect(selected)`
- `onRemove()`

```js
const chip = Look.lkChip('#chip-js', {
  label: 'JavaScript',
  selected: false,
  removable: true,
  onSelect(sel) { console.log('selected', sel); },
  onRemove() { console.log('removed'); },
});

chip.selected = true;
```

### `Look.lkPagination(el, opts?)`

Options:
- `totalPages` (default `1`)
- `page` (default `1`)
- `maxVisible` (default `7`)
- `onPageChange(page)`

```js
const pager = Look.lkPagination('#pager', {
  totalPages: 20,
  page: 1,
  onPageChange(p) { console.log('page', p); },
});

pager.page = 3;
```

### `Look.lkProgress(el, opts?)`

Options:
- `value` (default `0`)
- `max` (default `100`)
- `indeterminate` (default `false`)

```js
const progress = Look.lkProgress('#upload-progress', {
  value: 20,
  max: 100,
});

progress.value = 55;
progress.indeterminate = true;
```

### `Look.lkSplitter(el, opts?)`

Options:
- `sizes` (percent array for panes)
- `minSize` (px, default `50`)

```js
const split = Look.lkSplitter('#editor-split', {
  sizes: [40, 60],
  minSize: 100,
});

console.log(split.sizes);
split.sizes = [50, 50];
```

### `Look.lkTable(el, opts?)`

Options:
- `sortable` (default `true`)
- `onSort({ column, order })`

```js
const table = Look.lkTable('#user-table', {
  sortable: true,
  onSort(info) { console.log(info); },
});

table.sortBy = 2;
console.log(table.sortOrder);
```

---

## Composables

Composables are programmatic APIs. They can create internal DOM and return lifecycle methods.

### `Look.lkDialog(opts?)`

Key options:
- `title`, `content`
- `confirmText`, `cancelText`
- `showCancel`, `showClose`
- `closeOnEscape`, `closeOnOverlay`
- `destroyOnClose`
- `className`, `mount`, `open`
- callbacks: `onOpen`, `onClose(reason)`, `onConfirm`, `onCancel`

```js
const dialog = Look.lkDialog({
  title: 'Delete item?',
  content: 'This action cannot be undone.',
  confirmText: 'Delete',
  cancelText: 'Cancel',
  onConfirm() { console.log('confirmed'); },
});

dialog.setTitle('Please confirm');
dialog.setContent('Updated content');
dialog.close('manual');
dialog.destroy();
```

### `Look.lkAlert(opts?)`

Wrapper on top of `lkDialog` for one-button alerts.

Key options:
- `title`
- `message` or `content`
- `okText`
- `onOk` (alias of `onConfirm`)

```js
Look.lkAlert({
  title: 'Session Expiring',
  message: 'Please save your work.',
  okText: 'Understood',
  onOk() { console.log('acknowledged'); },
});
```

### `Look.lkToast(opts?)`

Key options:
- `title`, `message`
- `duration` (ms, `0` means sticky)
- `position`: `top-left | top-center | top-right | bottom-left | bottom-center | bottom-right`
- `dismissible`
- `actionText`, `onAction`
- `onClose(reason)`

```js
const toast = Look.lkToast({
  title: 'Saved',
  message: 'Changes saved successfully.',
  actionText: 'Undo',
  onAction() { console.log('undo'); },
});

toast.update({ message: 'Updated message' });
toast.close('manual');
```

### `Look.lkLoading(opts?)`

Fullscreen loading overlay.

Key options:
- `content`, `text`
- `spinner`, `spinnerSize`
- `backdrop`, `closeOnClick`, `lockScroll`
- `zIndexBase`, `open`
- `onShow`, `onHide(reason)`

```js
const loading = Look.lkLoading({
  open: false,
  text: 'Loading dashboard...',
});

loading.show();
loading.setContent('Almost there...');
loading.hide();
loading.destroy();
```

### `Look.lkInnerLoading(target, opts?)`

Overlay loading inside a specific target element.

Key options:
- `content`, `text`
- `spinner`, `spinnerSize`
- `backdrop`, `lockPointer`, `open`

```js
const inner = Look.lkInnerLoading('#orders-card', {
  open: false,
  text: 'Refreshing orders...',
});

inner.show();
inner.hide();
inner.destroy();
```

### `Look.lkPingBadge(target, opts?)`

Key options:
- `position`: `top-right | top-left | bottom-right | bottom-left`
- `colorClass` (default `lk-badge--negative`)
- `pulse` (default `true`)
- `count` (number or `null`)
- `open`

```js
const badge = Look.lkPingBadge('#notif-btn', { count: 3 });

badge.setCount(4);
badge.hide();
badge.show();
badge.destroy();
```

### `Look.lkShimmer(target, opts?)`

Key options:
- `backdrop` (default `true`)
- `radius` (default `var(--lk-radius)`)
- `lockPointer` (default `true`)
- `open`

```js
const shimmer = Look.lkShimmer('#report-card', { open: false });
shimmer.show();
shimmer.hide();
shimmer.destroy();
```

### `Look.lkStorage(opts?)`

Namespaced browser storage helper. `set` and `get` are async.

Key options:
- `namespace` (default `look`)
- `secret` (string for encryption key material)
- `encrypted` (default `true`)
- `useSession` (default `false`, uses `localStorage` otherwise)

Methods:
- `set(key, value)`
- `get(key, fallback?)`
- `remove(key)`
- `has(key)`
- `clear()`
- `keys()`

```js
const store = Look.lkStorage({
  namespace: 'app',
  encrypted: false,
});

await store.set('profile', { name: 'Ada' });
const profile = await store.get('profile', null);
console.log(profile);
```

---

## Data helper

### `Look.lkDataSource(opts?)`

Alias: `Look.createDataSource(opts)`

Ref-like state:
- `value`, `items`, `view`
- `filter`, `sort`, `page`, `pageSize`
- `loading`, `error`, `total`, `totalPages`

CRUD and query methods:
- `set(data)`
- `load(params?)`
- `add(record, op?)`
- `update(target, patch, op?)`
- `remove(target, op?)`
- `clear()`
- `setFilter(filter)`, `clearFilter()`
- `setSort(sort)`, `clearSort()`
- `setPage(page)`, `setPageSize(size)`, `setQuery(query)`

Events and subscriptions:
- `on`, `off`, `once`, `emit`
- `subscribe(handler, { event, immediate })`

Transport options:
- `transport.read`
- `transport.create`
- `transport.update`
- `transport.delete`

Transport can be:
- URL string
- config object (`{ url, method, headers, credentials }`)
- function `(payload, source) => Promise<any>`

```js
const ds = Look.lkDataSource({
  keyField: 'id',
  data: [
    { id: 1, name: 'Ada', active: true, age: 32 },
    { id: 2, name: 'Bram', active: false, age: 25 },
    { id: 3, name: 'Clio', active: true, age: 29 },
  ],
  pageSize: 2,
});

ds.subscribe((state, evt) => {
  console.log('change reason:', evt.reason, state.view);
});

ds.setFilter({ active: true });
ds.setSort({ field: 'age', dir: 'desc' });
ds.setPage(1);
await ds.add({ id: 4, name: 'Dana', active: true, age: 21 }, { sync: false });
```

Remote sync example:

```js
const users = Look.lkDataSource({
  keyField: 'id',
  pageSize: 10,
  transport: {
    read: '/api/users',
    create: '/api/users',
    update: { url: '/api/users/{id}', method: 'PUT' },
    delete: { url: '/api/users/{id}', method: 'DELETE' },
  },
  server: {
    filter: true,
    sort: true,
    paging: true,
  },
});

await users.load();
```

---

## Examples

See `examples/index.html`.
It includes dedicated pages for components, composables, and `lkDataSource`.

---

## Project structure

```
LookUI/
|-- dist/
|   |-- look.js
|   `-- look.css
|-- examples/
|-- src/
|   |-- js/
|   |   |-- core/
|   |   |-- behaviors/
|   |   |-- components/
|   |   |-- compossables/
|   |   `-- helpers/
|   `-- scss/
|-- package.json
|-- rollup.config.js
`-- .postcssrc.cjs
```

---

## Notes

- Call `destroy()` for components/composables when you no longer need them.
- Form components auto-wrap fields when `label` is provided.
- Composables are implementation-driven and may evolve while the library is pre-1.0.
