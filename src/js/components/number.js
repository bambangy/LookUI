// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Number component — numeric / currency / percent / unit input

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';

lkI18n.define('number', {
  increment: 'Increase',
  decrement: 'Decrease',
  invalid: 'Enter a valid number',
});

const decimalsOf = (n) => {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  if (s.includes('e-')) return parseInt(s.split('e-')[1], 10);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
const clean = (n) => Number(Number(n).toPrecision(12));

function safeNf(locale, o) {
  try { return new Intl.NumberFormat(locale, o); } catch {
    try { return new Intl.NumberFormat('en', { ...o, currency: o.style === 'currency' ? (o.currency || 'USD') : undefined, unit: o.style === 'unit' ? (o.unit || 'meter') : undefined }); } catch { return new Intl.NumberFormat('en'); }
  }
}

function setSlot(slot, content) {
  slot.textContent = '';
  if (content == null || content === false || content === '') { slot.hidden = true; return; }
  slot.hidden = false;
  if (content instanceof Node) slot.appendChild(content);
  else slot.appendChild(createElement('span', {}, String(content)));
}

/**
 * Enhance an <input> as a number field: locale formatting, currency / percent / unit, spinners.
 *
 *   const qty = Look.lkNumber('#qty', { min: 0, max: 99, spinners: true, onChange(v, ctx) {} });
 *   const price = Look.lkNumber('#price', { format: 'currency', currency: 'IDR', decimals: 0 });
 *   qty.value;   // number | null   (setter is silent)
 *
 * Not focused the field shows the Intl.NumberFormat text (grouping, symbol, unit); focused it shows the raw
 * editable number in the locale's decimal separator. Typing is filtered to digits, the decimal separator and a
 * leading minus; pasted text is parsed leniently. The value commits on blur / Enter / spin. A hidden input
 * carries the raw number for form posts (the `name` moves to it). For `format: 'percent'` the value is a
 * fraction (0.25 = 25%) and min / max / step are fractions too (default step 0.01).
 *
 * @param {Element|string} el — <input> element or selector
 * @param {Object} [opts]
 * @param {number|null} [opts.value] — initial value (default: the input's value)
 * @param {number} [opts.min] [opts.max]
 * @param {number} [opts.step=1]      — spin step (percent: 0.01)
 * @param {number|{min?:number,max?:number}} [opts.decimals] — fixed fraction digits, or { min, max } (default: 3 decimal/unit, the currency's own, 0 percent — at least the digits the step needs)
 * @param {'decimal'|'currency'|'percent'|'unit'} [opts.format='decimal']
 * @param {string} [opts.currency='USD'] [opts.currencyDisplay] [opts.unit] [opts.unitDisplay]
 * @param {string} [opts.locale]      — default Look.i18n.locale (re-formats live when it changes)
 * @param {Object} [opts.formatOptions] — extra Intl.NumberFormat options
 * @param {string|Node} [opts.prefix] [opts.suffix] — static affix beside the input
 * @param {boolean} [opts.spinners=false] — + / - buttons (ArrowUp/Down; PageUp/Down = 10 steps)
 * @param {boolean} [opts.wheel=false]    — mouse wheel steps the value while the input has focus
 * @param {boolean} [opts.allowEmpty=true] — false: an empty commit restores the last value
 * @param {boolean} [opts.clamp=true]     — clamp to min / max on commit
 * @param {boolean} [opts.round=true]     — round to the fraction digits on commit
 * @param {string} [opts.label] [opts.name] [opts.placeholder] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Array}  [opts.rules] [opts.validate] — validation (min / max / "not a number" are built in)
 * @param {Function} [opts.onChange] — (value, { source: 'input'|'spin'|'wheel'|'api', component, display })
 * @param {Function} [opts.beforeChange] — (value, { source, component, display }) => false | Promise | number — veto (the field reverts) or replace the new value
 * @param {Object} [opts.text] — text overrides ('number.*')
 * @returns {Object}
 */
export function lkNumber(el, opts = {}) {
  const node = resolveEl(el, 'lkNumber');
  if (node.tagName !== 'INPUT') throw new Error('Look.lkNumber: element must be an <input>');

  const original = {
    type: node.getAttribute('type'),
    name: node.getAttribute('name'),
    inputmode: node.getAttribute('inputmode'),
    autocomplete: node.getAttribute('autocomplete'),
    role: node.getAttribute('role'),
    value: node.value,
  };

  let format = ['currency', 'percent', 'unit'].includes(opts.format) ? opts.format : 'decimal';
  let min = Number.isFinite(opts.min) ? opts.min : null;
  let max = Number.isFinite(opts.max) ? opts.max : null;
  let step = Number.isFinite(opts.step) && opts.step > 0 ? opts.step : (format === 'percent' ? 0.01 : 1);
  const allowEmpty = opts.allowEmpty !== false;
  const doClamp = opts.clamp !== false;
  const doRound = opts.round !== false;
  const dense = !!opts.dense;
  let readonly = !!opts.readonly;
  let committed = null;
  let focused = false;
  let nf; let editNf; let sep = { decimal: '.', group: ',' };
  let maxFD = 3;
  let gone = false;
  const comp = {};

  const tx = bindText('number', opts.text, () => { if (typeof render === 'function') relocale(); });
  const locale = () => opts.locale || lkI18n.locale;

  // --- Formatting ------------------------------------------------------------

  function buildFormats() {
    const o = { style: format };
    if (format === 'currency') { o.currency = opts.currency || 'USD'; if (opts.currencyDisplay) o.currencyDisplay = opts.currencyDisplay; }
    if (format === 'unit') { o.unit = opts.unit || 'meter'; if (opts.unitDisplay) o.unitDisplay = opts.unitDisplay; }
    const base = safeNf(locale(), o).resolvedOptions();
    const stepDigits = decimalsOf(format === 'percent' ? clean(step * 100) : step);
    let lo; let hi;
    const d = opts.decimals;
    if (typeof d === 'number') { lo = d; hi = d; } else if (d && typeof d === 'object') {
      lo = d.min ?? 0; hi = Math.max(lo, d.max ?? Math.max(lo, base.maximumFractionDigits));
    } else { lo = Math.min(base.minimumFractionDigits, Math.max(base.maximumFractionDigits, stepDigits)); hi = Math.max(base.maximumFractionDigits, stepDigits); }
    lo = Math.max(0, Math.min(20, lo)); hi = Math.max(lo, Math.min(20, hi));
    nf = safeNf(locale(), { ...o, minimumFractionDigits: lo, maximumFractionDigits: hi, ...(opts.formatOptions || {}) });
    maxFD = hi;
    editNf = safeNf(locale(), { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 20 });
    const parts = safeNf(locale(), { useGrouping: true, minimumFractionDigits: 1 }).formatToParts(12345.6);
    sep = {
      decimal: parts.find((p) => p.type === 'decimal')?.value || '.',
      group: parts.find((p) => p.type === 'group')?.value || ',',
    };
  }

  const toFraction = (n) => (format === 'percent' ? clean(n / 100) : n);
  const toShown = (n) => (format === 'percent' ? clean(n * 100) : n);
  const roundVal = (n) => {
    if (!doRound) return n;
    return toFraction(Number(toShown(n).toFixed(maxFD)));
  };
  const clampVal = (n) => {
    if (!doClamp) return n;
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };

  const displayOf = (v) => (v == null ? '' : nf.format(v));
  const editOf = (v) => (v == null ? '' : editNf.format(clean(toShown(v))));

  // Text typed by the user -> number | null | NaN
  function parseText(text) {
    let s = String(text ?? '').trim();
    if (!s) return null;
    const neg = /^[-−(]/.test(s) || /^[^\d]*[-−]\s*\d/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return NaN;
    const hasDot = s.includes('.'); const hasComma = s.includes(',');
    let dec = null;
    if (hasDot && hasComma) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    else if (hasDot || hasComma) {
      const ch = hasDot ? '.' : ',';
      const count = s.split(ch).length - 1;
      const tail = s.length - s.lastIndexOf(ch) - 1;
      if (ch === sep.decimal) dec = ch;
      else if (ch === sep.group) dec = count === 1 && tail !== 3 ? ch : null;
      else dec = count === 1 && tail !== 3 ? ch : null;
    }
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c >= '0' && c <= '9') out += c;
      else if (c === dec && !out.includes('.')) out += '.';
    }
    if (out.startsWith('.')) out = `0${out}`;
    const n = Number(out);
    if (!Number.isFinite(n)) return NaN;
    return toFraction(neg ? -n : n);
  }

  // --- DOM ---------------------------------------------------------------------

  node.setAttribute('type', 'text');
  node.setAttribute('inputmode', 'decimal');
  node.setAttribute('autocomplete', 'off');
  node.setAttribute('role', 'spinbutton');
  node.removeAttribute('name');
  node.classList.add('lk-input', 'lk-input--affixed', 'lk-number__input');
  if (dense) node.classList.add('lk-input--dense');
  if (opts.placeholder != null) node.setAttribute('placeholder', opts.placeholder);

  const field = wrapField(node, {
    label: opts.label, required: opts.required ?? opts.mandatory, requiredMark: opts.requiredMark,
  });

  const root = createElement('div', { class: `lk-number lk-input-affix${dense ? ' lk-number--dense' : ''}` });
  const prefixEl = createElement('span', { class: 'lk-input-affix__prepend lk-number__prefix' });
  const suffixEl = createElement('span', { class: 'lk-input-affix__append lk-number__suffix' });
  prefixEl.hidden = true; suffixEl.hidden = true;
  setSlot(prefixEl, opts.prefix); setSlot(suffixEl, opts.suffix);
  node.parentNode.insertBefore(root, node);
  root.append(prefixEl, node, suffixEl);

  let upBtn = null; let downBtn = null; let spin = null;
  if (opts.spinners) {
    root.classList.add('lk-number--spinners');
    spin = createElement('span', { class: 'lk-number__spin' });
    upBtn = createElement('button', { type: 'button', class: 'lk-number__btn lk-number__btn--up', tabindex: '-1' });
    downBtn = createElement('button', { type: 'button', class: 'lk-number__btn lk-number__btn--down', tabindex: '-1' });
    upBtn.appendChild(lkIcon('plus', { size: 'xs' }));
    downBtn.appendChild(lkIcon('minus', { size: 'xs' }));
    spin.append(upBtn, downBtn);
    root.appendChild(spin);
  }

  const hidden = createElement('input', { type: 'hidden' });
  const hiddenName = opts.name ?? original.name;
  if (hiddenName) hidden.name = hiddenName;
  root.after(hidden);

  // --- Rendering -----------------------------------------------------------------

  function renderAria() {
    node.setAttribute('aria-valuemin', min == null ? '' : String(min));
    node.setAttribute('aria-valuemax', max == null ? '' : String(max));
    if (min == null) node.removeAttribute('aria-valuemin');
    if (max == null) node.removeAttribute('aria-valuemax');
    if (committed == null) { node.removeAttribute('aria-valuenow'); node.removeAttribute('aria-valuetext'); } else {
      node.setAttribute('aria-valuenow', String(committed));
      node.setAttribute('aria-valuetext', displayOf(committed));
    }
    if (upBtn) {
      upBtn.setAttribute('aria-label', tx.t('increment'));
      downBtn.setAttribute('aria-label', tx.t('decrement'));
      upBtn.disabled = !canEdit() || (max != null && committed != null && committed >= max);
      downBtn.disabled = !canEdit() || (min != null && committed != null && committed <= min);
    }
  }

  function render() {
    node.value = focused ? editOf(committed) : displayOf(committed);
    hidden.value = committed == null ? '' : String(committed);
    renderAria();
  }
  function relocale() {
    if (gone) return;
    buildFormats();
    render();
  }

  const canEdit = () => !node.disabled && !readonly;

  // --- Commit --------------------------------------------------------------------

  let validation = null;

  function applyValue(v, source) {
    committed = v;
    render();
    validation?.changed();
    if (typeof opts.onChange === 'function') opts.onChange(v, { source, component: comp, display: displayOf(v) });
  }

  // Normalise (clamp / round) then guard + apply. `n` may be null / NaN.
  function commitValue(n, source) {
    let v = n;
    if (v == null || Number.isNaN(v)) {
      if (!allowEmpty) v = committed; else if (Number.isNaN(v)) v = null;
    }
    if (v != null) v = roundVal(clampVal(v));
    if (v === committed) { render(); return; }
    const ctx = { source, component: comp, display: displayOf(v) };
    const out = guard(root, opts, 'change', v, ctx, (next) => {
      const nv = next === null || (typeof next === 'number' && Number.isFinite(next)) ? next : v;
      applyValue(nv == null ? null : roundVal(clampVal(nv)), source);
    });
    const revert = (ok) => { if (ok === false && !gone) render(); };
    if (out && typeof out.then === 'function') out.then(revert); else revert(out);
  }

  function pending() { return focused ? parseText(node.value) : committed; }

  function stepBy(dir, mult, source) {
    if (!canEdit()) return;
    let base = pending();
    if (base == null || Number.isNaN(base)) base = committed;
    let next;
    if (base == null) next = dir > 0 ? (min ?? 0) : (max != null && min == null ? max : (min ?? 0));
    else next = clean(base + dir * step * mult);
    next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
    if (!doClamp && base != null) next = clean(base + dir * step * mult);
    commitValue(next, source);
    if (focused) { node.value = editOf(committed); try { node.select(); } catch { /* noop */ } }
  }

  // --- Events ----------------------------------------------------------------------

  const allowedRe = () => {
    const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`[^0-9${esc(sep.decimal)}-]`, 'g');
  };

  function onInput() {
    const raw = node.value;
    const pos = node.selectionStart ?? raw.length;
    let s = raw.replace(/−/g, '-').replace(allowedRe(), '');
    // minus only first, only when negatives are possible
    const canNeg = min == null || min < 0;
    s = s.replace(/-/g, (m, i) => (i === 0 && canNeg ? m : ''));
    // single decimal separator, limited fraction digits
    const di = s.indexOf(sep.decimal);
    if (maxFD === 0) s = s.split(sep.decimal).join('');
    else if (di >= 0) {
      const head = s.slice(0, di + 1);
      const tail = s.slice(di + 1).split(sep.decimal).join('').slice(0, Math.max(maxFD, 0));
      s = head + tail;
    }
    if (s !== raw) {
      const kept = raw.slice(0, pos).replace(/−/g, '-').replace(allowedRe(), '').length;
      node.value = s;
      const p = Math.min(kept, s.length);
      try { node.setSelectionRange(p, p); } catch { /* noop */ }
    }
  }

  function onFocus() {
    focused = true;
    if (committed != null) { node.value = editOf(committed); }
    else node.value = '';
    setTimeout(() => { if (focused && !gone && document.activeElement === node) { try { node.select(); } catch { /* noop */ } } }, 0);
  }
  function onBlur() {
    if (!focused) return;
    const n = parseText(node.value);
    focused = false;
    if (Number.isNaN(n)) { commitValue(null, 'input'); } else commitValue(n, 'input');
    render();
  }
  function onKeydown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepBy(e.key === 'ArrowUp' ? 1 : -1, 1, 'spin'); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); stepBy(e.key === 'PageUp' ? 1 : -1, 10, 'spin'); }
    else if (e.key === 'Home' && min != null && canEdit()) { e.preventDefault(); commitValue(min, 'spin'); node.value = editOf(committed); }
    else if (e.key === 'End' && max != null && canEdit()) { e.preventDefault(); commitValue(max, 'spin'); node.value = editOf(committed); }
    else if (e.key === 'Enter') {
      const n = parseText(node.value);
      commitValue(Number.isNaN(n) ? null : n, 'input');
      node.value = focused ? editOf(committed) : displayOf(committed);
    } else if (e.key === 'Escape' && focused) { node.value = editOf(committed); }
  }
  function onPaste(e) {
    const text = e.clipboardData?.getData('text');
    if (text == null) return;
    const n = parseText(text);
    if (Number.isNaN(n) || n == null) return;
    e.preventDefault();
    node.value = editOf(n);
  }
  function onWheel(e) {
    if (document.activeElement !== node || !canEdit() || !e.deltaY) return;
    e.preventDefault();
    stepBy(e.deltaY < 0 ? 1 : -1, 1, 'wheel');
  }

  // Spinner buttons: press = one step, hold = repeat
  let holdTimer = null; let holdRepeat = null;
  const stopHold = () => { clearTimeout(holdTimer); clearInterval(holdRepeat); holdTimer = null; holdRepeat = null; };
  function onSpinDown(e) {
    const btn = e.target.closest('.lk-number__btn');
    if (!btn || e.button !== 0 || btn.disabled) return;
    e.preventDefault(); // keep focus (and the caret) in the input
    const dir = btn === upBtn ? 1 : -1;
    if (!focused) node.focus();
    stepBy(dir, 1, 'spin');
    stopHold();
    holdTimer = setTimeout(() => { holdRepeat = setInterval(() => stepBy(dir, 1, 'spin'), 70); }, 420);
  }
  function onSpinClick(e) {
    const btn = e.target.closest('.lk-number__btn');
    if (!btn || e.detail !== 0 || btn.disabled) return; // keyboard / assistive activation
    stepBy(btn === upBtn ? 1 : -1, 1, 'spin');
  }

  node.addEventListener('input', onInput);
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', onBlur);
  node.addEventListener('keydown', onKeydown);
  node.addEventListener('paste', onPaste);
  if (opts.wheel) node.addEventListener('wheel', onWheel, { passive: false });
  if (spin) {
    spin.addEventListener('pointerdown', onSpinDown);
    spin.addEventListener('click', onSpinClick);
    document.addEventListener('pointerup', stopHold);
    document.addEventListener('pointercancel', stopHold);
  }
  const form = node.form;
  const onReset = () => setTimeout(() => { if (gone) return; committed = initial(); render(); validation?.clearValidation(); }, 0);
  form?.addEventListener('reset', onReset);

  // --- API -------------------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || root });

  function coerce(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseText(String(v));
    if (n == null || Number.isNaN(n) || !Number.isFinite(n)) return null;
    return n;
  }
  function setDisabled(v) {
    node.disabled = !!v;
    hidden.disabled = !!v;
    root.classList.toggle('lk-number--disabled', !!v);
    renderAria();
  }
  function setReadonly(v) {
    readonly = !!v;
    node.readOnly = readonly;
    node.setAttribute('aria-readonly', String(readonly));
    if (!readonly) node.removeAttribute('aria-readonly');
    root.classList.toggle('lk-number--readonly', readonly);
    renderAria();
  }

  Object.defineProperties(comp, {
    value: {
      get() { return committed; },
      set(v) { const n = coerce(v); committed = n == null ? null : roundVal(n); render(); },
      enumerable: true,
    },
    display: { get() { return displayOf(committed); }, enumerable: true },
    min: { get() { return min; }, set(v) { min = Number.isFinite(v) ? v : null; renderAria(); }, enumerable: true },
    max: { get() { return max; }, set(v) { max = Number.isFinite(v) ? v : null; renderAria(); }, enumerable: true },
    step: { get() { return step; }, set(v) { if (Number.isFinite(v) && v > 0) { step = v; relocale(); } }, enumerable: true },
    locale: { get() { return locale(); }, set(v) { opts.locale = v || undefined; relocale(); }, enumerable: true },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true, configurable: true },
    name: { get() { return hidden.name; }, set(v) { hidden.name = v || ''; }, enumerable: true },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); }, enumerable: true },
    labels: { get() { return field.labels; }, enumerable: true },
    required: { get() { return node.required; }, set(v) { field.setRequired(v); }, enumerable: true },
    mandatory: { get() { return node.required; }, set(v) { field.setRequired(v); } },
    readonly: { get() { return readonly; }, set: setReadonly, enumerable: true },
    disabled: { get() { return node.disabled; }, set: setDisabled, enumerable: true },
    rootEl: { value: root, enumerable: true },
    inputEl: { value: node, enumerable: true },
    hiddenEl: { value: hidden, enumerable: true },
  });
  Object.defineProperty(comp, 'enabled', {
    get() { return !node.disabled; },
    set(v) { setDisabled(!v); },
    enumerable: true,
    configurable: true,
  });

  comp.setError = (m) => { field.setError(m); root.classList.add('lk-number--error'); };
  comp.clearError = () => { field.clearError(); root.classList.remove('lk-number--error'); };
  comp.refreshLabels = field.refreshLabels;
  comp.focus = (o) => node.focus(o);
  comp.setValue = (v, source = 'api') => commitValue(coerce(v), source);
  comp.stepUp = (n = 1) => stepBy(1, n, 'api');
  comp.stepDown = (n = 1) => stepBy(-1, n, 'api');
  comp.clear = () => commitValue(null, 'api');
  Object.defineProperties(comp, {
    prefix: { get() { return prefixEl.hidden ? null : prefixEl; }, set(v) { setSlot(prefixEl, v); }, enumerable: true },
    suffix: { get() { return suffixEl.hidden ? null : suffixEl; }, set(v) { setSlot(suffixEl, v); }, enumerable: true },
  });

  function initial() {
    if (opts.value !== undefined) return coerce(opts.value);
    const raw = original.value;
    if (raw === '' || raw == null) return null;
    return /^-?\d*\.?\d+$/.test(raw.trim()) ? Number(raw) : coerce(raw);
  }

  buildFormats();
  const first = initial();
  committed = first == null ? null : roundVal(first);
  render();
  if (opts.disabled || node.disabled) setDisabled(true);
  if (readonly) setReadonly(true);

  validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => { const p = pending(); return Number.isNaN(p) ? String(node.value) : p; },
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    roots: () => [root],
    setError: comp.setError,
    clearError: comp.clearError,
    builtinRules: [
      (v) => (typeof v === 'string' ? tx.t('invalid') : true),
      (v) => (typeof v === 'number' && min != null && v < min ? tx.tf('validation.min', { label: field.getLabel() || tx.tf('validation.field'), min: nf.format(min) }) : true),
      (v) => (typeof v === 'number' && max != null && v > max ? tx.tf('validation.max', { label: field.getLabel() || tx.tf('validation.field'), max: nf.format(max) }) : true),
    ],
  });
  // while typing (focused) re-check on the pending text
  const onTyping = () => validation.changed();
  node.addEventListener('input', onTyping);

  comp.destroy = function () {
    gone = true;
    stopHold();
    tx.destroy();
    validation.destroy();
    node.removeEventListener('input', onTyping);
    node.removeEventListener('input', onInput);
    node.removeEventListener('focus', onFocus);
    node.removeEventListener('blur', onBlur);
    node.removeEventListener('keydown', onKeydown);
    node.removeEventListener('paste', onPaste);
    node.removeEventListener('wheel', onWheel);
    if (spin) {
      spin.removeEventListener('pointerdown', onSpinDown);
      spin.removeEventListener('click', onSpinClick);
      document.removeEventListener('pointerup', stopHold);
      document.removeEventListener('pointercancel', stopHold);
    }
    form?.removeEventListener('reset', onReset);
    comp.clearError();
    root.parentNode?.insertBefore(node, root);
    root.remove();
    hidden.remove();
    node.classList.remove('lk-input', 'lk-input--affixed', 'lk-number__input', 'lk-input--dense');
    if (!node.getAttribute('class')) node.removeAttribute('class');
    node.disabled = false;
    node.readOnly = false;
    ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-readonly'].forEach((a) => node.removeAttribute(a));
    const restore = (n, v) => (v == null ? node.removeAttribute(n) : node.setAttribute(n, v));
    restore('type', original.type); restore('name', original.name); restore('inputmode', original.inputmode);
    restore('autocomplete', original.autocomplete); restore('role', original.role);
    node.value = original.value;
    field.destroyField();
  };

  return comp;
}
