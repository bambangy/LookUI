// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Color component — colour field: swatch + text + popup with presets and a native picker

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkPopupProxy } from '../composables/popupProxy.js';

lkI18n.define('color', {
  label: 'Color',
  placeholder: 'Pick a color',
  open: 'Choose color',
  swatches: 'Preset colors',
  custom: 'Custom…',
  alpha: 'Opacity',
  invalid: 'Enter a valid color',
});

const DEFAULT_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#6b7280', '#334155', '#000000', '#ffffff',
];

// Canvas-free map of the CSS basics
const NAMES = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff', maroon: '#800000',
  red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff', magenta: '#ff00ff', green: '#008000', lime: '#00ff00',
  olive: '#808000', yellow: '#ffff00', navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff',
  cyan: '#00ffff', orange: '#ffa500', pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', indigo: '#4b0082',
  violet: '#ee82ee', coral: '#ff7f50', salmon: '#fa8072', khaki: '#f0e68c', crimson: '#dc143c', turquoise: '#40e0d0',
  tan: '#d2b48c', beige: '#f5f5dc', lavender: '#e6e6fa', transparent: '#00000000', rebeccapurple: '#663399',
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

function rgbToHsl({ r, g, b, a }) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const mx = Math.max(R, G, B); const mn = Math.min(R, G, B);
  const l = (mx + mn) / 2; const d = mx - mn;
  let h = 0; let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100), a };
}

function hslToRgb(h, s, l, a = 1) {
  const S = s / 100; const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const f = (n) => L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a };
}

/** Parse '#rgb' '#rgba' '#rrggbb' '#rrggbbaa', names, rgb()/rgba(), hsl()/hsla() -> { r, g, b, a(0..1) } | null */
export function parseColor(input) {
  if (input == null) return null;
  if (typeof input === 'object' && 'r' in input) return { r: clamp(input.r, 0, 255), g: clamp(input.g, 0, 255), b: clamp(input.b, 0, 255), a: input.a == null ? 1 : clamp(input.a, 0, 1) };
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (NAMES[s]) s = NAMES[s];
  if (/^#?[0-9a-f]{3,4}$/.test(s) || /^#?([0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) {
    s = s.replace('#', '');
    if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
    const n = (i) => parseInt(s.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1 };
  }
  const m = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(s);
  if (!m) return null;
  const nums = m[2].split(/[\s,/]+/).filter(Boolean);
  if (nums.length < 3 || nums.length > 4) return null;
  const val = (t, scale) => (t.endsWith('%') ? (parseFloat(t) / 100) * scale : parseFloat(t));
  const alpha = nums[3] != null ? clamp(val(nums[3], 1), 0, 1) : 1;
  if (nums.some((t) => Number.isNaN(parseFloat(t)))) return null;
  if (m[1].startsWith('rgb')) return { r: Math.round(clamp(val(nums[0], 255), 0, 255)), g: Math.round(clamp(val(nums[1], 255), 0, 255)), b: Math.round(clamp(val(nums[2], 255), 0, 255)), a: alpha };
  return hslToRgb(((parseFloat(nums[0]) % 360) + 360) % 360, clamp(parseFloat(nums[1]), 0, 100), clamp(parseFloat(nums[2]), 0, 100), alpha);
}

/**
 * Colour field: a swatch button + text input; the popup offers preset swatches, a native
 * <input type="color"> ("Custom…") and an optional opacity slider.
 *
 *   const c = Look.lkColor('#brand', { alpha: true, clearable: true, onChange(v, ctx) {} });
 *   c.value;   // '#3b82f6' | '#3b82f680' | null   (setter silent, lenient: 'red', '#f00', 'rgb(…)', 'hsl(…)')
 *
 * The value is normalised lower-case hex: '#rrggbb', or '#rrggbbaa' when `alpha` is on and the colour is not
 * fully opaque. A hidden input carries it for form posts (the `name` moves to it).
 *
 * @param {Element|string} el — <input> element or selector
 * @param {Object} [opts]
 * @param {string|null} [opts.value]
 * @param {Array<string|{value:string,label?:string}>} [opts.swatches] — presets (default palette); [] hides the grid
 * @param {boolean} [opts.alpha=false] — opacity slider + 8-digit hex
 * @param {'hex'|'rgb'|'hsl'} [opts.format='hex'] — text shown in the input
 * @param {boolean} [opts.custom=true] — native "Custom…" picker
 * @param {boolean} [opts.clearable=false] — clear button
 * @param {string} [opts.placement='bottom-left'] [opts.zIndex]
 * @param {string} [opts.label] [opts.name] [opts.placeholder] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Array}  [opts.rules] [opts.validate] — validation (an unparsable text is a built-in error)
 * @param {Function} [opts.onChange] — (value, { source: 'swatch'|'custom'|'input'|'clear'|'api', component, rgb, hsl, display })
 * @param {Function} [opts.onOpen] [opts.onClose] — (component) / (reason, component)
 * @param {Function} [opts.beforeOpen] — ({ source, component }) => false | Promise
 * @param {Function} [opts.beforeClose] — (reason, { source, component }) => false | Promise
 * @param {Function} [opts.beforeChange] — (value, { source, component, rgb, hsl, display }) => false | Promise | string — veto or replace
 * @param {Object} [opts.text] — text overrides ('color.*')
 * @returns {Object}
 */
export function lkColor(el, opts = {}) {
  const node = resolveEl(el, 'lkColor');
  if (node.tagName !== 'INPUT') throw new Error('Look.lkColor: element must be an <input>');

  const original = {
    type: node.getAttribute('type'), name: node.getAttribute('name'), autocomplete: node.getAttribute('autocomplete'),
    placeholder: node.getAttribute('placeholder'), value: node.value, spellcheck: node.getAttribute('spellcheck'),
  };

  const comp = {};
  let gone = false;
  let alpha = !!opts.alpha;
  let displayFormat = ['rgb', 'hsl'].includes(opts.format) ? opts.format : 'hex';
  let committed = null;
  let badText = false;
  let readonly = !!opts.readonly;
  let clearable = !!opts.clearable;
  let validation = null;
  const dense = !!opts.dense;
  const showCustom = opts.custom !== false;

  const tx = bindText('color', opts.text, () => { if (typeof refreshTexts === 'function') refreshTexts(); });

  // --- Colour helpers ----------------------------------------------------------------

  const normalize = (c) => (c ? (alpha ? c : { ...c, a: 1 }) : null);
  const hexOf = (c) => (c ? `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${alpha && c.a < 1 ? hex2(c.a * 255) : ''}` : null);
  const round2 = (n) => Math.round(n * 100) / 100;
  function displayOf(c) {
    if (!c) return '';
    if (displayFormat === 'rgb') return c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${round2(c.a)})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
    if (displayFormat === 'hsl') { const h = rgbToHsl(c); return c.a < 1 ? `hsla(${h.h}, ${h.s}%, ${h.l}%, ${round2(c.a)})` : `hsl(${h.h}, ${h.s}%, ${h.l}%)`; }
    return hexOf(c);
  }
  const cssOf = (c) => (c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : '');

  // --- DOM ---------------------------------------------------------------------------------

  node.setAttribute('type', 'text');
  node.setAttribute('autocomplete', 'off');
  node.setAttribute('spellcheck', 'false');
  node.removeAttribute('name');
  node.classList.add('lk-input', 'lk-input--affixed', 'lk-color__input');
  if (dense) node.classList.add('lk-input--dense');

  const field = wrapField(node, { label: opts.label, required: opts.required ?? opts.mandatory, requiredMark: opts.requiredMark });

  const root = createElement('div', { class: `lk-color lk-input-affix${dense ? ' lk-color--dense' : ''}` });
  node.parentNode.insertBefore(root, node);
  const swatchBtn = createElement('button', { type: 'button', class: 'lk-color__swatch' });
  const swatchFill = createElement('span', { class: 'lk-color__fill' });
  swatchBtn.appendChild(swatchFill);
  const clearBtn = createElement('button', { type: 'button', class: 'lk-color__clear' });
  clearBtn.appendChild(lkIcon('close', { size: 'xs' }));
  clearBtn.hidden = true;
  root.append(swatchBtn, node, clearBtn);

  const hidden = createElement('input', { type: 'hidden' });
  const hiddenName = opts.name ?? original.name;
  if (hiddenName) hidden.name = hiddenName;
  root.after(hidden);

  const canEdit = () => !node.disabled && !readonly;

  // Popup (live DOM)
  const panelRoot = createElement('div', { class: `lk-color-panel${dense ? ' lk-color-panel--dense' : ''}`, role: 'dialog' });
  const grid = createElement('div', { class: 'lk-color-panel__grid', role: 'radiogroup' });
  const customRow = createElement('div', { class: 'lk-color-panel__custom' });
  const nativeLabel = createElement('label', { class: 'lk-color-panel__native' });
  const native = createElement('input', { type: 'color', class: 'lk-color-panel__picker' });
  const nativeText = createElement('span', { class: 'lk-color-panel__native-text' });
  nativeLabel.append(native, nativeText);
  customRow.appendChild(nativeLabel);
  const alphaRow = createElement('div', { class: 'lk-color-panel__alpha' });
  const alphaLabel = createElement('span', { class: 'lk-color-panel__alpha-label' });
  const alphaRange = createElement('input', { type: 'range', min: '0', max: '100', step: '1', class: 'lk-color-panel__range' });
  const alphaOut = createElement('output', { class: 'lk-color-panel__alpha-out' });
  alphaRow.append(alphaLabel, alphaRange, alphaOut);
  panelRoot.append(grid, customRow, alphaRow);

  function bridge(name, payload, ctx) {
    const out = guard(swatchBtn, opts, name, payload, { source: ctx?.source || 'api', component: comp }, () => {});
    if (out === false) return false;
    if (out && typeof out.then === 'function') return out.then((v) => (v === false ? false : undefined));
    return undefined;
  }

  const proxy = lkPopupProxy(swatchBtn, {
    content: '',
    placement: opts.placement || 'bottom-left',
    className: 'lk-color-proxy',
    zIndex: opts.zIndex,
    beforeShow: (p, ctx) => (canEdit() ? bridge('open', undefined, ctx) : false),
    beforeHide: (reason, ctx) => bridge('close', reason, ctx),
    onShow() {
      paintPanel();
      proxy.updatePosition(root);
      node.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        if (gone || !proxy.isOpen) return;
        (grid.querySelector('[tabindex="0"]') || native).focus();
      }, 0);
      if (typeof opts.onOpen === 'function') opts.onOpen(comp);
    },
    onHide(reason) {
      node.setAttribute('aria-expanded', 'false');
      const hadFocus = panelRoot.contains(document.activeElement);
      if (hadFocus && reason !== 'outside' && !gone) node.focus();
      if (typeof opts.onClose === 'function') opts.onClose(reason, comp);
    },
  });
  proxy.panelEl.textContent = '';
  proxy.panelEl.appendChild(panelRoot);

  node.setAttribute('aria-haspopup', 'dialog');
  node.setAttribute('aria-expanded', 'false');

  // --- Swatches ------------------------------------------------------------------------------

  let swatchList = [];
  function setSwatches(list) {
    swatchList = (Array.isArray(list) ? list : DEFAULT_SWATCHES).map((s) => {
      const spec = typeof s === 'string' ? { value: s } : s;
      const c = parseColor(spec.value);
      return c ? { c, hex: hexOf({ ...c, a: c.a }), label: spec.label } : null;
    }).filter(Boolean);
  }

  function buildGrid() {
    grid.replaceChildren();
    grid.hidden = !swatchList.length;
    grid.setAttribute('aria-label', tx.t('swatches'));
    const current = hexOf(committed);
    const activeIdx = swatchList.findIndex((s) => hexOf(normalize(s.c)) === current);
    swatchList.forEach((s, i) => {
      const b = createElement('button', {
        type: 'button', class: 'lk-color-panel__swatch', role: 'radio', 'aria-label': s.label || s.hex,
        title: s.label || s.hex, 'data-index': String(i),
      });
      b.style.setProperty('--lk-color-value', cssOf(normalize(s.c)));
      const on = i === activeIdx;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on || (activeIdx < 0 && i === 0) ? 0 : -1;
      if (on) b.classList.add('lk-color-panel__swatch--on');
      grid.appendChild(b);
    });
  }

  function paintPanel() {
    buildGrid();
    customRow.hidden = !showCustom;
    nativeText.textContent = tx.t('custom');
    native.value = committed ? `#${hex2(committed.r)}${hex2(committed.g)}${hex2(committed.b)}` : '#000000';
    native.setAttribute('aria-label', tx.t('custom'));
    alphaRow.hidden = !alpha;
    alphaLabel.textContent = tx.t('alpha');
    alphaRange.setAttribute('aria-label', tx.t('alpha'));
    const a = committed ? Math.round(committed.a * 100) : 100;
    alphaRange.value = String(a);
    alphaOut.textContent = `${a}%`;
    const base = committed ? `${committed.r}, ${committed.g}, ${committed.b}` : '0, 0, 0';
    alphaRange.style.setProperty('--lk-color-base', `rgb(${base})`);
    panelRoot.setAttribute('aria-label', field.getLabel() || tx.t('label'));
  }

  // --- Commit ----------------------------------------------------------------------------------

  const ctxOf = (source, c) => ({ source, component: comp, rgb: c ? { r: c.r, g: c.g, b: c.b, a: c.a } : null, hsl: c ? rgbToHsl(c) : null, display: displayOf(c) });

  function applyValue(c, source) {
    committed = c;
    badText = false;
    render();
    validation?.changed();
    if (proxy.isOpen) paintPanel();
    if (typeof opts.onChange === 'function') opts.onChange(hexOf(c), ctxOf(source, c));
  }

  function commit(c, source) {
    const next = normalize(c);
    if (hexOf(next) === hexOf(committed)) { badText = false; render(); return true; }
    const out = guard(root, opts, 'change', hexOf(next), ctxOf(source, next), (p) => {
      let nc = next;
      if (p !== hexOf(next)) { const q = p == null ? null : normalize(parseColor(p)); if (q || p === null) nc = q; }
      applyValue(nc, source);
    });
    const revert = (ok) => { if (ok === false && !gone) { render(); if (proxy.isOpen) paintPanel(); } };
    if (out && typeof out.then === 'function') out.then(revert); else revert(out);
    return out;
  }

  function commitText() {
    const raw = node.value.trim();
    if (!raw) { badText = false; return commit(null, 'input'); }
    if (!badText && committed && raw === displayOf(committed)) return true;
    const c = parseColor(raw);
    if (!c) { badText = true; comp.validate(); return false; }
    return commit(c, 'input');
  }

  function render() {
    if (!badText) node.value = displayOf(committed);
    hidden.value = hexOf(committed) || '';
    swatchBtn.style.setProperty('--lk-color-value', cssOf(committed));
    swatchBtn.classList.toggle('lk-color__swatch--empty', !committed);
    clearBtn.hidden = !(clearable && committed);
    node.setAttribute('placeholder', opts.placeholder ?? original.placeholder ?? tx.t('placeholder'));
    swatchBtn.setAttribute('aria-label', `${field.getLabel() || tx.t('label')}: ${tx.t('open')}${committed ? ` (${hexOf(committed)})` : ''}`);
    clearBtn.setAttribute('aria-label', tx.tf('common.clear'));
  }
  function refreshTexts() {
    if (gone) return;
    render();
    if (proxy.isOpen) paintPanel();
  }

  // --- Events ------------------------------------------------------------------------------------

  const onInputChange = () => commitText();
  function onInputKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitText(); } else if ((e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') {
      e.preventDefault();
      if (!proxy.isOpen) proxy.show(root, 'user');
    }
  }
  function onGridClick(e) {
    const b = e.target.closest('.lk-color-panel__swatch');
    if (!b || !canEdit()) return;
    const s = swatchList[Number(b.dataset.index)];
    if (!s) return;
    const keepAlpha = alpha && committed && s.c.a === 1 ? { ...s.c, a: committed.a } : s.c;
    const r = commit(keepAlpha, 'swatch');
    const done = () => { if (!gone) proxy.hide('select', 'user'); };
    if (r && typeof r.then === 'function') r.then(done); else done();
  }
  function onGridKey(e) {
    const items = Array.from(grid.querySelectorAll('.lk-color-panel__swatch'));
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    let cols = items.findIndex((b) => b.offsetTop > items[0].offsetTop);
    if (cols < 0) cols = items.length;
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: items.length - 1 - i }[e.key];
    if (move == null) return;
    e.preventDefault();
    const n = items[clamp(i + move, 0, items.length - 1)];
    items.forEach((b) => { b.tabIndex = b === n ? 0 : -1; });
    n.focus();
  }
  function onNativeInput() {
    const c = parseColor(native.value);
    if (!c) return;
    swatchBtn.style.setProperty('--lk-color-value', cssOf({ ...c, a: committed && alpha ? committed.a : 1 }));
  }
  function onNativeChange() {
    const c = parseColor(native.value);
    if (!c || !canEdit()) return;
    commit({ ...c, a: committed && alpha ? committed.a : 1 }, 'custom');
  }
  function onAlphaInput() {
    alphaOut.textContent = `${alphaRange.value}%`;
  }
  function onAlphaChange() {
    if (!canEdit()) return;
    const base = committed || parseColor(native.value) || { r: 0, g: 0, b: 0 };
    commit({ r: base.r, g: base.g, b: base.b, a: Number(alphaRange.value) / 100 }, 'custom');
  }
  function onClear() {
    if (!canEdit()) return;
    commit(null, 'clear');
    node.focus();
  }
  function onPanelKey(e) {
    if (e.key === 'Enter' && e.target === native) { e.preventDefault(); proxy.hide('select', 'user'); }
  }
  const onReset = () => setTimeout(() => { if (gone) return; committed = normalize(parseColor(original.value)); badText = false; render(); validation?.clearValidation(); }, 0);

  node.addEventListener('change', onInputChange);
  node.addEventListener('keydown', onInputKey);
  grid.addEventListener('click', onGridClick);
  grid.addEventListener('keydown', onGridKey);
  native.addEventListener('input', onNativeInput);
  native.addEventListener('change', onNativeChange);
  alphaRange.addEventListener('input', onAlphaInput);
  alphaRange.addEventListener('change', onAlphaChange);
  clearBtn.addEventListener('click', onClear);
  panelRoot.addEventListener('keydown', onPanelKey);
  const form = node.form;
  form?.addEventListener('reset', onReset);

  // --- API ---------------------------------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || root });

  function setDisabled(v) {
    node.disabled = !!v; swatchBtn.disabled = !!v; clearBtn.disabled = !!v; hidden.disabled = !!v;
    root.classList.toggle('lk-color--disabled', !!v);
    if (v) proxy.hide('disabled');
  }
  function setReadonly(v) {
    readonly = !!v;
    node.readOnly = readonly;
    swatchBtn.disabled = readonly || node.disabled;
    clearBtn.disabled = readonly || node.disabled;
    root.classList.toggle('lk-color--readonly', readonly);
    if (readonly) proxy.hide('readonly');
  }

  Object.defineProperties(comp, {
    value: {
      get() { return hexOf(committed); },
      set(v) { committed = normalize(parseColor(v)); badText = false; render(); if (proxy.isOpen) paintPanel(); },
      enumerable: true,
    },
    rgb: { get() { return committed ? { r: committed.r, g: committed.g, b: committed.b, a: committed.a } : null; }, enumerable: true },
    hsl: { get() { return committed ? rgbToHsl(committed) : null; }, enumerable: true },
    display: { get() { return displayOf(committed); }, enumerable: true },
    format: { get() { return displayFormat; }, set(v) { displayFormat = ['rgb', 'hsl'].includes(v) ? v : 'hex'; render(); }, enumerable: true },
    alpha: { get() { return alpha; }, set(v) { alpha = !!v; committed = normalize(committed); render(); if (proxy.isOpen) paintPanel(); }, enumerable: true },
    clearable: { get() { return clearable; }, set(v) { clearable = !!v; render(); }, enumerable: true },
    swatches: { get() { return swatchList.map((s) => s.hex); }, set(v) { setSwatches(v); if (proxy.isOpen) paintPanel(); }, enumerable: true },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true, configurable: true },
    name: { get() { return hidden.name; }, set(v) { hidden.name = v || ''; }, enumerable: true },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); render(); }, enumerable: true },
    labels: { get() { return field.labels; }, enumerable: true },
    required: { get() { return node.required; }, set(v) { field.setRequired(v); }, enumerable: true },
    mandatory: { get() { return node.required; }, set(v) { field.setRequired(v); } },
    readonly: { get() { return readonly; }, set: setReadonly, enumerable: true },
    disabled: { get() { return node.disabled; }, set: setDisabled, enumerable: true },
    isOpen: { get() { return proxy.isOpen; }, enumerable: true },
    rootEl: { value: root, enumerable: true },
    panelEl: { value: proxy.panelEl, enumerable: true },
    inputEl: { value: node, enumerable: true },
    hiddenEl: { value: hidden, enumerable: true },
  });
  Object.defineProperty(comp, 'enabled', {
    get() { return !node.disabled; },
    set(v) { setDisabled(!v); },
    enumerable: true,
    configurable: true,
  });

  comp.setError = (m) => { field.setError(m); root.classList.add('lk-color--error'); };
  comp.clearError = () => { field.clearError(); root.classList.remove('lk-color--error'); };
  comp.refreshLabels = () => { field.refreshLabels(); render(); };
  comp.focus = (o) => node.focus(o);
  comp.open = () => { proxy.show(root, 'api'); return comp; };
  comp.close = (reason = 'close') => { proxy.hide(reason, 'api'); return comp; };
  comp.toggle = () => { if (proxy.isOpen) comp.close('toggle'); else comp.open(); return comp; };
  comp.setValue = (v, source = 'api') => commit(parseColor(v), source);
  comp.clear = () => commit(null, 'api');

  setSwatches(opts.swatches);
  committed = normalize(parseColor(opts.value !== undefined ? opts.value : original.value));
  render();
  if (opts.disabled || node.disabled) setDisabled(true);
  if (readonly) setReadonly(true);

  validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => hexOf(committed),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    roots: () => [root, proxy.panelEl],
    isOpen: () => proxy.isOpen,
    setError: comp.setError,
    clearError: comp.clearError,
    builtinRules: [() => (badText ? tx.t('invalid') : true)],
  });

  comp.destroy = function () {
    gone = true;
    tx.destroy();
    validation.destroy();
    node.removeEventListener('change', onInputChange);
    node.removeEventListener('keydown', onInputKey);
    grid.removeEventListener('click', onGridClick);
    grid.removeEventListener('keydown', onGridKey);
    native.removeEventListener('input', onNativeInput);
    native.removeEventListener('change', onNativeChange);
    alphaRange.removeEventListener('input', onAlphaInput);
    alphaRange.removeEventListener('change', onAlphaChange);
    clearBtn.removeEventListener('click', onClear);
    panelRoot.removeEventListener('keydown', onPanelKey);
    form?.removeEventListener('reset', onReset);
    proxy.destroy();
    comp.clearError();
    root.parentNode?.insertBefore(node, root);
    root.remove();
    hidden.remove();
    node.classList.remove('lk-input', 'lk-input--affixed', 'lk-color__input', 'lk-input--dense');
    if (!node.getAttribute('class')) node.removeAttribute('class');
    node.disabled = false;
    node.readOnly = false;
    node.removeAttribute('aria-haspopup');
    node.removeAttribute('aria-expanded');
    const restore = (n, v) => (v == null ? node.removeAttribute(n) : node.setAttribute(n, v));
    restore('type', original.type); restore('name', original.name); restore('autocomplete', original.autocomplete);
    restore('placeholder', original.placeholder); restore('spellcheck', original.spellcheck);
    node.value = original.value;
    field.destroyField();
  };

  return comp;
}
