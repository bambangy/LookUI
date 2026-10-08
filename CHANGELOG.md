# Changelog

All notable changes to `@lookui/core` are documented here.
The project follows [Semantic Versioning](https://semver.org/); while the version is `0.x`, minor releases may contain breaking changes — they are listed under **Breaking changes**.

Documentation: https://bambangy.github.io/LookUI/docs/

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
