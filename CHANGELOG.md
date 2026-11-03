# Changelog

All notable changes to `@lookui/core` are documented here.
The project follows [Semantic Versioning](https://semver.org/); while the version is `0.x`, minor releases may contain breaking changes — they are listed under **Breaking changes**.

Documentation: https://bambangy.github.io/LookUI/docs/

## [Unreleased]

Nothing yet.

## [0.4.0] — 2026-11-03

A large feature wave: ~15 new components/composables, the i18n/guard infrastructure behind them, plus the first
round of `Feature.md`'s Fase 1 items (`Look.state`, `lkDialog`'s Promise/channel API, auto-dispose, and the first
Vitest test suite). See `CLAUDE.md` § Release milestones and `Feature.md` §0/§5 for what's still ahead on the way to
`v1.0.0` — this release is feature-complete but not yet tooling-complete (no lint config, no `.d.ts`, no
component-level test coverage, bundle size over budget).

### Breaking changes

- The 0.3 compatibility shims are removed: `lkModal(triggerElement, modalElement)` argument order, `lkChip` option `onSelect` (also `lkToolbar` chip `options.onSelect`), and `lkPagination` option `onPageChange`. Use `lkModal(modal, { trigger })` and `onChange` instead. See the [migration guide](https://bambangy.github.io/LookUI/docs/migration.html).

### Added

- **`Look.state` / `createState()`** — a lightweight reactive state container for sharing data between components/pages (`helpers/state.js`): `set(key, value)` / `get(key?)` / `patch(key, partialOrFn)` / `subscribe(key?, handler)` (key-scoped `(next, prev)` or wildcard `(key, next, prev)`, returns an unsubscribe fn) / `reset(key?)` / `snapshot()` + `restore(snap)` (deep-clone, useful around a cancellable form wizard) / `namespace(name)` (isolated, lazily-created child container) / `bindDataSource(key, ds)` (mirrors an `lkDataSource`'s snapshot into a state key, kept live on every `change`). `state.data` is a `Proxy` over the same store, so `state.data.cart = […]` and `state.set('cart', […])` are equivalent. `Look.state` is the default shared instance; `Look.createState(initial)` makes an independent one.
- **`lkDialog` Promise-based `open()` + channel** — `api.then` makes the returned `api` thenable: `await Look.lkDialog({...}).open()` resolves once the dialog closes with `{ reason, confirmed, cancelled, value }` (`value` from `close(reason, source, value)`'s 3rd argument, or the `onConfirm` handler's return value), without changing what `open()`/`close()` return for existing synchronous chaining (`dialog.open().close()`). A dialog `destroy()`ed while open/pending resolves with `reason: 'destroy'` instead of leaving the `await` hanging. `api.channel` (`send`/`on`/`off`) is a per-instance two-way pub/sub; `content` functions now receive `api` as their argument so they can read `api.channel` without closing over the dialog from outside.
- **Vitest test suite** (`npm test` / `npm run test:watch`) covering `core/index.js`, `helpers/base.js`, `helpers/guard.js`, `helpers/dataSource.js` (local filter/sort/page/CRUD/batch), and the new auto-dispose registry — the first automated tests in the repo (`vitest.config.js`, `test/`).
- **Auto-dispose (`Look.autoDispose`, `disposeAll`, `disposeWithin`)** — `helpers/registry.js` tracks every `applyBase`-based component instance against its root element. `Look.autoDispose(true)` destroys instances automatically via `MutationObserver` as soon as their element is removed from the DOM (e.g. a container's `innerHTML` is replaced after an AJAX reload), instead of leaking a listener-holding instance. `disposeAll()` / `disposeWithin(target)` destroy tracked instances on demand; a `beforeunload` check warns in the console when instances were never `destroy()`ed. `destroy()` is now idempotent on every element-bound component (a second call is a no-op) since both the observer and manual code paths can race to call it.
- **`lkUpload(input, opts)`** — enhances `<input type="file">`. `mode: 'field'` (default) is a textbox look with removable file-name chips (truncated) and an upload icon; `mode: 'box'` is a drag-and-drop / click area showing the file as icon + name inside the box, or — with `multiple` — a collapsible list (icon, name, size) below it. Options `accept`, `maxSize` (`'5MB'`), `multiple` (alias `multi`), `maxFiles`, `placeholder`, `hint`, `messages`; rejected files fire `onReject` and show the message as the field error. Fully validateable (`rules`, `validate`, `required`, `label`, `lkValidation`). `onChange(value, { source, component, added, removed })`.
- **`lkCard(el, opts)`** — accordion header: clicking `.lk-card__header` slides the rest of the card open/closed (`collapsed`, `chevron`, `onOpen`, `onClose(reason)`, `open/close/toggle/expanded`). Controls inside the header do not toggle.
- **`lkAccordion(el, opts)`** — groups lkCard panels (existing `.lk-card` markup, or built from `items`) into a single-or-multiple-open accordion (`multiple`, `collapsible`, `variant: 'separated'|'bordered'|'flush'`). Opening a panel in single mode asks every open sibling's `beforeToggle` guard too, so a vetoed sibling close cancels the whole open. `onChange(openIds, { source, item, opened, closed })`; `open/close/toggle/openAll/closeAll/add/remove/enable/disable`.
- **`lkTree(target, opts)`** — accessible tree view built from nested `items`, an `lkDataSource` (flat rows via `parentField`), or lazy `loadChildren(node)`. `selectable` (single/multiple), tri-state `checkboxes` with parent/child propagation, `filter(text)`, full roving-tabindex keyboard navigation, and the usual guards (`beforeChange`, `beforeToggle`, `beforeLoad`) / `onChange`, `onToggle`, `onLoad`, `onError`, `onAction` callbacks.
- **`lkMenu(target, opts)`** — dropdown / context menu with nested submenus, built on `lkPopupProxy`. `trigger: 'click'|'contextmenu'|'hover'|'manual'`, item types `item`/`separator`/`header`/`checkbox`/`radio`, keyboard navigation and type-ahead, guards `beforeOpen`/`beforeClose`/`beforeAction`, `onAction`/`onOpen`/`onClose`.
- **`lkOrg(target, opts)`** — organization chart composable: a "linked head/tail" tree (`{ id, parent, head, tail, prev, next, childCount, data }` per node, walked via `for (let c = node.head; c; c = c.next)`) rendered as nested flexbox with CSS-drawn connector lines. Nested `items` or a flat array/`lkDataSource` + `parentField`; `render()` for custom cards; built-in or `opts.editor(host, { node, mode, value, setValue, close })` add/edit form; `removeStrategy: 'cascade'|'promote'`. Drag-and-drop re-parenting/reordering is one `lkSortable` per sibling row sharing a `group`, with cycle prevention; `readOnly` drops CRUD and drag but keeps expand/collapse/select. `add`/`update`/`remove`/`move`/`get`/`getChildren`/`getPath`/`toJSON`/`expand`/`collapse`/`select`/`destroy`; guards `beforeAdd`/`beforeUpdate`/`beforeRemove`/`beforeMove`/`beforeToggle`; `onAdd`/`onUpdate`/`onRemove`/`onMove`/`onToggle`/`onSelect`/`onChange`.
- **`lkFloating(opts)`** — a persistent element pinned to a screen corner (FAB, chat launcher, scroll-to-top): `position: 'top-left'|'top-right'|'bottom-left'|'bottom-right'` (default `'bottom-right'`). Content is `html` (trusted string), `content` (text/Node/function, same contract as `renderContent`), `template` (`<template>`), or `component: { component, options, tag }` to mount a Look component as the content (mirrors lkTable's `editor` convention). `show`/`hide`/`toggle`/`setContent`/`destroy`; guards `beforeShow`/`beforeHide`.
- **`lkNumber(input, opts)`** — numeric/currency/percent/unit field with locale-aware `Intl.NumberFormat` display, spinners, mouse-wheel stepping, `min`/`max`/`step`/`decimals`, `clamp`/`round`, a hidden raw-value input for `name`. `onChange(value, { source, component, display })`; `beforeChange` guard.
- **`lkTime(input, opts)`** — time-of-day field: lenient typed entry plus an `lkPopupProxy` panel (hour/minute/second selects, AM/PM, Now/Cancel/OK). `value` is `'HH:mm'[':ss']`; `format: 12|24`, `minuteStep`, `seconds`, `min`/`max`. `onChange`, `onConfirm`, `onOpen`/`onClose(reason)`; guards `beforeOpen`/`beforeClose`/`beforeChange`/`beforeConfirm`.
- **`lkColor(input, opts)`** — swatch + text field with a presets/custom-picker/opacity popup; parses hex, CSS color names, `rgb()`/`hsl()` (`parseColor()` exported). `format: 'hex'|'rgb'|'hsl'`, `swatches`, `clearable`. `onChange(value, { source, component, rgb, hsl, display })`; guards `beforeOpen`/`beforeClose`/`beforeChange`.
- **`lkSegmented(el, opts)`** — segmented button group (single, sliding indicator, or `multiple`), built from `items` or enhanced `data-value`/radio/checkbox markup. `onChange(value, { source, component, item })`; `beforeChange` guard.
- **`lkAutocomplete(input, opts)`** — ARIA combobox with a suggestion listbox; `source` is an array, `lkDataSource`, or an async function (debounced, stale-response safe). `template()` for custom rendering, `forceSelection`, `openOnFocus`. `onChange(value, { source, component, item })`, `onOpen`/`onClose(reason)`, `onLoad`/`onError`; guards `beforeChange`/`beforeOpen`/`beforeClose`.
- **`lkTagInput(input, opts)`** — chip-based tag field (Enter/comma/paste to add, Backspace to remove) with optional `lkAutocomplete` suggestions, per-tag validation (`minLength`/`maxLength`/`validateTag`/`maxTags`). `onChange(value, { source, component, added, removed })`, `onReject(rejected, { component })`; guards `beforeAdd`/`beforeRemove`.
- **`lkForm(form, opts)`** — form helper over a `<form>`: field registry + auto-discovered native controls, live `getValues()`/`dirty`/`changes()`, `submit(handler)` (validate → call → map server field errors, never rejects), `serialize()` to `FormData`, `warnOnLeave`. Components without a native value event must call `form.notify(name)`. Guards `beforeSubmit`/`beforeReset`; `onSubmit`/`onSubmitted`/`onReset`/`onChange`.
- **`lkStepper(target, opts)`** — multi-step wizard with per-step `renderContent`, forward-only validation (`fields` + `validate()`) before advancing, Back/Next/Finish buttons. `onChange(step, { source, component, prev })`, `onComplete`, `onError`, `onLoad`; guards `beforeChange`/`beforeComplete`.
- **`lkDrawer(opts)`** — modal or non-blocking side panel (the `lkDialog` sibling), optional resizable edge, SweetAlert-style motion contract. `onOpen`/`onClose(reason)`/`onLoad`/`onError`/`onResize`; guards `beforeOpen`/`beforeClose`/`beforeResize`.
- **`lkClipboard(trigger, opts)`** — copy-to-clipboard trigger with a tip/toast/none feedback mode and an `execCommand` fallback; static `lkClipboard.copy()`/`.read()`. `onCopy(text, { source, component })`, `onError`; `beforeCopy` guard (can veto, wait, or replace the copied text).
- **`lkHotkeys(opts)`** — global/scoped keyboard shortcuts and sequences (`'ctrl+k'`, `'g i'`), layout-independent, input-aware by default, with `add()`/`list()`/`format()` for building a shortcuts help UI; per-binding `beforeTrigger` guard.
- **`lkTheme(opts)`** — light/dark/system theme switcher: sets `data-theme` + `color-scheme`, persists the mode, follows `prefers-color-scheme` live, syncs across tabs, and ships `lkTheme.inlineScript()` for a no-flash `<head>` snippet. `onChange(mode, { source, component, resolved })`; `beforeChange` guard. New dark token set (`src/scss/tokens/_dark.scss`).
- **`lkSortable(container, opts)`** — drag-to-reorder behavior (pointer + full keyboard) for list/grid/table-row containers, with cross-container `group` support and `onChange`/`onStart`/`onEnd` callbacks; `beforeStart` (sync) and a per-move `change` guard.
- **`lkTextbox`**: `autosize` (grow a `<textarea>` with its content, optional `maxRows`) and `reveal` (password show/hide toggle button).
- `.lk-collapse` — shared slide-open/closed utility (grid-rows animation to the real content height, reduced-motion aware).
- **Localization — `Look.i18n`** (`set`, `use`, `extend`, `t`, `has`, `keys`, `defaults`, `locales`, `onChange`, `reset`, `define`). Every user-facing string of every component and composable is a flat dotted key (`upload.placeholder.single`, `table.filter.apply`, shared `common.*` and `validation.*`) with `{name}` placeholders, plural forms and function messages. Lookup: explicit text option → instance `text` option / `component.text = {…}` → active locale (`id-ID` → `id`) → fallback `en` → built-in English. Switching the locale re-renders mounted components live (open panels, drafts, selection and focus are kept). Dates, numbers and sizes follow `Intl` with the active locale; `lkPhone` country names use `Intl.DisplayNames`. Guide: docs/localization.html (includes a generated key reference).
- **Overridable events — `before<Action>` guards.** Every user-driven action can be vetoed, delayed (Promise) or have its payload replaced, through an option callback *and* a cancelable, bubbling DOM event `lk:before-<action>` (`event.preventDefault()`, `event.detail.payload`). Added for: lkButton, lkModal, lkTextbox, lkCheckbox, lkRadio, lkSwitch, lkDropdown, lkPhone, lkTextPop, lkUpload (`beforeAdd`/`beforeRemove`/`beforeBrowse`), lkCard, lkChip, lkRating, lkSlider, lkPagination, lkCarousel, lkTabs, lkList, lkSplitter, lkTooltip, lkDate, lkDialog, lkToast, lkPopupProxy, lkValidation (`beforeSubmit`), lkToolbar (`beforeAction` + per-item), lkTable (`beforeSort/Filter/Page/Select/Edit/Save/Delete/Cancel`) and lkDataSource (`beforeLoad/Add/Update/Remove`). Vetoed actions fire no after-callback and restore the UI. Guide: docs/events.html.
- `lkUpload` `onReject` may return `false` to suppress the default error message; `formatBytes(n, { units, locale })`.
- `lkTable`: `grid.removeRow(keyOrRow)` (goes through `beforeDelete`); `lkDropdown` `onOpen` / `onClose`; `renderContent` accepts `loadingText` / `retryText` / `errorText` (string or function); `lkCarousel` / `lkTabs` pass them through.
- Docs generator: `texts`, `guards` and `textNamespace` spec sections — every component page lists its text keys and overridable events.
- `LOOK_DIST=<dir>` builds the JS bundles into another directory (parallel work, tests).
- **`lkEditor(textarea, opts)`** — WYSIWYG rich-text HTML editor that enhances a `<textarea>` (native textarea stays in the DOM, visually hidden, kept in sync for form submission, like `lkUpload`). Toolbar is a real `lkToolbar` instance: Undo/Redo, paragraph-style and font-size dropdowns, Bold/Italic/Underline/Strikethrough, text/highlight color (each an `lkPopupProxy` + `lkColor`), align, ordered/unordered list, Link (`lkPopupProxy` mini-form), Code block, Clear formatting, and a Source-view toggle (raw HTML `<textarea>`). Built on `document.execCommand`/`queryCommandState`. `value` get/set (silent) plus `getValue({ encode })` / `setValue(v, { encoded })` entity-encode helpers; `opts.encodeForSubmit` posts the encoded form. `opts.sanitize` (default `true`; `false`; or a custom `fn(html) => safeHtml`) runs a built-in allowlist DOMParser sanitizer over the initial value, `setValue()`, pasted content and source-view round-trips; `opts.allowedTags`/`allowedAttributes` extend or replace the defaults. `onChange(value, { source, component })`; guards `beforeChange`, `beforeCommand(name, value, ctx)`, `beforeSourceToggle`. Validation checks the required rule against the text content, stripped of tags.

### Changed

- Hard-coded English in the library now comes from the registry; the English output is unchanged unless you override it. Options that used to default to English text (`noRecords`, `confirmDelete`, `invalidMessage`, `noResultsText`, `loadingText`, `searchPlaceholder`, …) now default to `undefined` and fall back to the registry; passing them still wins.
- `lkDate` `locale` and the lkTable / lkToolbar number and date formatting default to `Look.i18n.locale` (`'en'`) instead of `'en-US'` / the browser locale.
- `lkPhone` country names are localized with `Intl.DisplayNames` when the active language is not English (your own `countries` keep their names).
- `lkValidation.submit()` resolves `message: 'Something went wrong'` (localizable `validation.submitError`) when a thrown error has no message, where it used to be `null`.
- `lkTabs.remove()` and `lkChip.remove()` return `true | false | Promise` (the guard result). `lkPagination` finds its buttons through `data-nav` instead of their aria-label. `lkDialog` status icons are `role="img"` with a label; loading overlays carry `role="status"`.
- `lkTextPop`: `comp.text` still returns the display string; assigning an object replaces the text overrides (`comp.texts` returns them).

## [0.3.0] — 2026-10-08

One callback convention across the library before the 1.0 API freeze. Upgrade guide: https://bambangy.github.io/LookUI/docs/migration.html

### Breaking changes

- **Value callbacks are `onChange(value, ctx)`** with `ctx = { source, component, …extras }`: lkDropdown (`item` / `items`), lkTextPop (`item` / `items`), lkPhone (info fields kept on ctx), lkRating and lkSlider (`prev`), lkCarousel (`prev`, `slide`), lkTabs (`prev`, `tab`), lkChip, lkPagination (`prev`).
- **lkTabs**: `beforeChange(next, { prev, source, component })`, `onLoad(panel, { name, tab, component })`, `onError(error, { name, panel, tab, component })`.
- **lkCarousel**: `onLoad(slide, { index, component })`, `onError(error, { slide, index, component })`.
- **lkDate**: `onConfirm(value, { component, display, iso })`.
- **Open/close callbacks receive the instance**: lkTextPop `onClose(reason, component)`, lkLoading `onShow(loading)` / `onHide(reason, loading)`, lkPopupProxy `onShow(popup, { anchor, placement })` / `onHide(reason, popup)`, lkToast `onAction(toast)` / `onClose(reason, toast)`.
- **Clicks are `onClick(event, ctx)`**: lkChip `onClick(event, { component })`; lkToolbar items `onClick(event, { item, component })`.
- **lkToolbar**: item `onChange` / `onInput` / `onSearch` are `(value, { source, item, component, control, event, detail })`; `onAction(item, { type, value, event, detail, component })`.
- **lkModal** is `lkModal(modal, { trigger, open, closeOnEscape, onOpen, onClose })` with the shared `el` / `id` / `hidden` / `enabled` properties, `toggle()` and `close(reason)`.

### Deprecated (still working, one console warning, removed in 1.0)

- lkPagination `onPageChange` → `onChange`.
- lkChip `onSelect` → `onChange` (also lkToolbar chip `options.onSelect`).
- `lkModal(trigger, modal)` argument order.

### Added

- `onChange` for lkTextbox (plus `onInput`), lkCheckbox, lkRadio and lkSwitch.
- `lkButton(el, { onClick })` with the shared `el` / `id` / `hidden` / `enabled` properties.
- `lkDate.value` can be set (silently, like every other component).
- lkTable event objects (and legacy `onSort`) and lkList `onToggle` include `component`.

## [0.2.0] — 2026-10-08

### Breaking changes

- **`lkDate` time mode is a single panel.** The separate time step (slide-over view with up/down steppers) is replaced by a time row under the calendar (hour / minute / optional second selects, AM/PM toggle) and a footer with **Now**, **Cancel** and **OK**. Removed CSS classes: `.lk-date__viewport`, `__track`, `__date-view`, `__time-view`, `__time-grid`, `__time-col`, `__time-btn`, `__time-value`, `__time-label`, `__time-date`, `__time-preview`, `__time-actions`, `__time-cancel`, `__time-ok`, `.lk-date--view-time`. **Cancel** now closes the panel (`onClose` reason `"cancel"`) instead of returning to the calendar. Seconds are hidden unless `seconds: true`.
- **Examples moved from `examples/` to `docs/`** (published to GitHub Pages).

### Added

- **Validation** for every form component (`lkTextbox`, `lkDropdown`, `lkCheckbox`, `lkRadio`, `lkSwitch`, `lkPhone`, `lkTextPop`): `rules` option, `validate` (run on blur), `.validate()`, `.validateAsync()`, `.setValidation(message)`, `.clearValidation()`, `.error`, `.hasError`, `.validating`.
  - Async rules (a rule may return a Promise) with per-value caching, `validateDebounce` and stale-result dropping.
  - `Look.lkValidation(...components)` — validate a group (`validate()`, `validateAsync()` → `{ hasError, errors }`), show server errors (`setErrors(map)`), and `submit(handler)` (validate → save → map 422 field errors; never rejects).
- **`lkPhone`** — country dropdown (flag + dial code, 60 countries) joined to a digits-only input; E.164 value.
- **`lkTextPop`** — lookup field with a searchable read-only grid in a popup; single or multiple selection (chips, `maxChips`).
- **`lkTabs`** — tabs from options or existing `<ul><li>` markup; panels in a container element; `line` / `pill` / `box` variants, horizontal or vertical; content from text, HTML, a template, a function or a URL; render modes `lazy`, `eager`, `active`; `add` / `remove` / `enable` / `disable` / `reload`, `beforeChange`.
- **`lkCarousel` async content** — `slides` option (array, function or Promise) with `url` / `html` / `content` / `template` slides, markup slides with `data-url`, lazy loading (`lazy`, `preload`), `reload()`, `setSlides()`, `ready`, `onLoad` / `onError`.
- **`lkDate`**
  - `displayFormat` + `display()`, `isoFormat` + `iso()`, `format(pattern)`; `value` stays a `Date`.
  - `input` (write the display text into an input or component) and `name` (hidden input with the ISO value).
  - `holidays`, `disabledDates`, `disabledDays`, `disableHolidays`, `allowDisabledInRange`; `setHolidays()`, `setDisabledDates()`, `isDisabled()`, `holiday()`.
  - `seconds`, `minuteStep`, `nowText`; `onChange` meta now includes `display` and `iso`.
- **`lkTable`** — component editors per column (`editor: 'dropdown' | 'phone' | …`, `{ type, options }`, `{ component, options }`, or a function); server field errors from a rejected save are shown under the matching editors.
- **`lkDropdown`** — `template`, `selectedTemplate`, `searchFields`, `panelWidth`, `panelClass`, `focus()`, `isOpen`, `panelEl`.
- **`lkDataSource`** — failed requests reject with an error carrying `status`, `body` and `errors`.
- **`lkDialog`** — `onDestroy` option.
- Floating layers (dropdown, popup proxy) stack above the dialog or popup they are opened from.
- Documentation site on GitHub Pages: quick start, interactive cookbook recipes, validation guide, custom theme file guide with a live playground and a downloadable theme template (`docs/lookui-theme.css`, regenerate with `npm run docs:theme`), logo and favicons.

### Fixed

- `lkValidation` no longer scrolls the page when it focuses a field with `scroll: false`; component `focus()` methods accept focus options.
- A dropdown inside a dialog closes on Escape without closing the dialog.
- Table editors no longer leave floating layers behind in `<body>`.

## [0.1.0] — 2026-10-04

- First public release.

[0.3.0]: https://github.com/bambangy/LookUI/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bambangy/LookUI/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bambangy/LookUI/releases/tag/v0.1.0
