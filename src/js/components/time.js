// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Time component — time-of-day field with a popup picker

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkPopupProxy } from '../composables/popupProxy.js';

lkI18n.define('time', {
  label: 'Time',
  placeholder: 'Select time',
  open: 'Choose time',
  hour: 'Hour',
  minute: 'Minute',
  second: 'Second',
  meridiem: 'AM or PM',
  am: 'AM',
  pm: 'PM',
  now: 'Now',
  invalid: 'Enter a valid time',
  min: 'Time must be {min} or later',
  max: 'Time must be {max} or earlier',
});

const pad2 = (n) => String(n).padStart(2, '0');
const secsOf = (t) => t.h * 3600 + t.m * 60 + t.s;

/**
 * Parse a time leniently: '14:30', '14:30:15', '930', '9', '9.30 pm', '9pm', '12am'.
 * @returns {{h:number,m:number,s:number}|null}
 */
function parseTime(input, extraAm = [], extraPm = []) {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : { h: input.getHours(), m: input.getMinutes(), s: input.getSeconds() };
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  let mer = null;
  const am = ['a', 'am', 'a.m.', 'a.m', ...extraAm.map((x) => String(x).toLowerCase())];
  const pm = ['p', 'pm', 'p.m.', 'p.m', ...extraPm.map((x) => String(x).toLowerCase())];
  const words = [...am.map((w) => ['am', w]), ...pm.map((w) => ['pm', w])].sort((a, b) => b[1].length - a[1].length);
  for (const [kind, w] of words) {
    if (s.endsWith(w) && /[\d\s.]/.test(s.charAt(s.length - w.length - 1) || '0')) { mer = kind; s = s.slice(0, s.length - w.length).trim(); break; }
  }
  const t = s.replace(/[hH]/g, ':').replace(/[^\d:.\s]/g, '');
  let parts;
  if (/^\d{3,6}$/.test(t)) {
    parts = t.length <= 4 ? [t.slice(0, -2), t.slice(-2)] : [t.slice(0, -4), t.slice(-4, -2), t.slice(-2)];
  } else {
    parts = t.split(/[:.\s]+/).filter((p) => p !== '');
  }
  if (!parts.length || parts.length > 3 || !parts.every((p) => /^\d{1,2}$/.test(p))) return null;
  let h = parseInt(parts[0], 10);
  const m = parts[1] != null ? parseInt(parts[1], 10) : 0;
  const sec = parts[2] != null ? parseInt(parts[2], 10) : 0;
  if (m > 59 || sec > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (mer === 'pm' ? 12 : 0);
  } else if (h > 23) return null;
  return { h, m, s: sec };
}

/**
 * Time-of-day field: a text input (typed entry parsed leniently) with a clock button that opens a
 * popup (hour / minute / second selects, AM/PM, Now / Cancel / OK).
 *
 *   const t = Look.lkTime('#start', { minuteStep: 5, min: '08:00', max: '18:00', onChange(v, ctx) {} });
 *   t.value;   // '14:30' ('HH:mm', or 'HH:mm:ss' with seconds: true) | null — setter silent, accepts a Date too
 *
 * A hidden input carries the 24h ISO string for form posts (the `name` moves to it).
 *
 * @param {Element|string} el — <input> element or selector
 * @param {Object} [opts]
 * @param {string|Date|null} [opts.value]
 * @param {12|24} [opts.format] — default from the locale's hour cycle (Intl)
 * @param {number} [opts.minuteStep=1]
 * @param {boolean} [opts.seconds=false] — show seconds; value becomes 'HH:mm:ss'
 * @param {string} [opts.min] [opts.max] — 'HH:mm' / 'HH:mm:ss'
 * @param {string} [opts.locale] — default Look.i18n.locale (follows locale changes)
 * @param {string} [opts.placement='bottom-left'] [opts.zIndex]
 * @param {string} [opts.label] [opts.name] [opts.placeholder] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Array}  [opts.rules] [opts.validate] — validation (invalid text, min, max are built in)
 * @param {Function} [opts.onChange]  — (value, { source: 'confirm'|'input'|'now'|'api', component, display, iso })
 * @param {Function} [opts.onConfirm] — (value, { component, display, iso }) after OK
 * @param {Function} [opts.onOpen] [opts.onClose] — (component) / (reason, component); reasons 'confirm'|'cancel'|'now'|'escape'|'outside'|'toggle'|'close'
 * @param {Function} [opts.beforeOpen]    — ({ source, component }) => false | Promise
 * @param {Function} [opts.beforeClose]   — (reason, { source, component }) => false | Promise
 * @param {Function} [opts.beforeChange]  — (value, { source, component, display, iso }) => false | Promise | string — veto or replace the value
 * @param {Function} [opts.beforeConfirm] — (value, { source: 'confirm', component }) => false | Promise | string
 * @param {Object} [opts.text] — text overrides ('time.*')
 * @returns {Object}
 */
export function lkTime(el, opts = {}) {
  const node = resolveEl(el, 'lkTime');
  if (node.tagName !== 'INPUT') throw new Error('Look.lkTime: element must be an <input>');

  const original = {
    type: node.getAttribute('type'), name: node.getAttribute('name'), autocomplete: node.getAttribute('autocomplete'),
    placeholder: node.getAttribute('placeholder'), value: node.value, role: node.getAttribute('role'),
  };

  const comp = {};
  let gone = false;
  let seconds = !!opts.seconds;
  let minuteStep = Math.max(1, Math.min(30, Math.floor(opts.minuteStep) || 1));
  let fmtOpt = opts.format === 12 || opts.format === 24 ? opts.format : null;
  let committed = null;
  let draft = null;
  let badText = false;
  let readonly = !!opts.readonly;
  let validation = null;
  const dense = !!opts.dense;

  const tx = bindText('time', opts.text, () => { if (typeof relocale === 'function') relocale(); });
  const locale = () => opts.locale || lkI18n.locale;

  // --- Formatting ----------------------------------------------------------------

  let dtf; let nf2; let hourCycle12 = false;
  function buildFormats() {
    let cycle = 'h23';
    try { cycle = new Intl.DateTimeFormat(locale(), { hour: 'numeric' }).resolvedOptions().hourCycle || 'h23'; } catch { /* default */ }
    hourCycle12 = cycle === 'h12' || cycle === 'h11';
    const o = { hour: 'numeric', minute: '2-digit', hourCycle: format() === 12 ? 'h12' : 'h23' };
    if (seconds) o.second = '2-digit';
    try { dtf = new Intl.DateTimeFormat(locale(), o); } catch { dtf = new Intl.DateTimeFormat('en', o); }
    try { nf2 = new Intl.NumberFormat(locale(), { minimumIntegerDigits: 2, useGrouping: false }); } catch { nf2 = new Intl.NumberFormat('en', { minimumIntegerDigits: 2 }); }
  }
  function format() { return fmtOpt || (hourCycle12 ? 12 : 24); }
  const fmtDate = (t) => dtf.format(new Date(1970, 0, 1, t.h, t.m, t.s));
  const toIso = (t) => (t ? `${pad2(t.h)}:${pad2(t.m)}${seconds ? `:${pad2(t.s)}` : ''}` : null);
  const displayOf = (t) => (t ? fmtDate(t) : '');
  const parse = (v) => parseTime(v, [tx.t('am')], [tx.t('pm')]);

  let minT = parseTime(opts.min); let maxT = parseTime(opts.max);
  const inRange = (t) => (!minT || secsOf(t) >= secsOf(minT)) && (!maxT || secsOf(t) <= secsOf(maxT));

  // --- DOM -----------------------------------------------------------------------

  node.setAttribute('type', 'text');
  node.setAttribute('autocomplete', 'off');
  node.setAttribute('aria-haspopup', 'dialog');
  node.setAttribute('aria-expanded', 'false');
  node.removeAttribute('name');
  node.classList.add('lk-input', 'lk-input--affixed', 'lk-time__input');
  if (dense) node.classList.add('lk-input--dense');

  const field = wrapField(node, { label: opts.label, required: opts.required ?? opts.mandatory, requiredMark: opts.requiredMark });

  const root = createElement('div', { class: `lk-time lk-input-affix${dense ? ' lk-time--dense' : ''}` });
  node.parentNode.insertBefore(root, node);
  const btn = createElement('button', { type: 'button', class: 'lk-time__btn' });
  btn.appendChild(lkIcon('clock'));
  root.append(node, btn);

  const hidden = createElement('input', { type: 'hidden' });
  const hiddenName = opts.name ?? original.name;
  if (hiddenName) hidden.name = hiddenName;
  root.after(hidden);

  const canEdit = () => !node.disabled && !readonly;

  // Popup content (live DOM inside the proxy panel)
  const panelRoot = createElement('div', { class: `lk-time-panel${dense ? ' lk-time-panel--dense' : ''}`, role: 'dialog' });
  const row = createElement('div', { class: 'lk-time-panel__row' });
  const clockIcon = createElement('span', { class: 'lk-time-panel__icon' });
  clockIcon.appendChild(lkIcon('clock', { size: 'sm' }));
  const hourSel = createElement('select', { class: 'lk-time-panel__select', 'data-part': 'hour' });
  const minSel = createElement('select', { class: 'lk-time-panel__select', 'data-part': 'minute' });
  const secSel = createElement('select', { class: 'lk-time-panel__select', 'data-part': 'second' });
  const sepA = createElement('span', { class: 'lk-time-panel__sep', 'aria-hidden': 'true' }, ':');
  const sepB = createElement('span', { class: 'lk-time-panel__sep', 'aria-hidden': 'true' }, ':');
  const ampm = createElement('div', { class: 'lk-time-panel__ampm', role: 'group' });
  const amBtn = createElement('button', { type: 'button', class: 'lk-time-panel__ampm-btn', 'data-meridiem': 'am' });
  const pmBtn = createElement('button', { type: 'button', class: 'lk-time-panel__ampm-btn', 'data-meridiem': 'pm' });
  ampm.append(amBtn, pmBtn);
  row.append(clockIcon, hourSel, sepA, minSel, sepB, secSel, ampm);
  const footer = createElement('div', { class: 'lk-time-panel__footer' });
  const summary = createElement('div', { class: 'lk-time-panel__summary', 'aria-live': 'polite' });
  const actions = createElement('div', { class: 'lk-time-panel__actions' });
  const nowBtn = createElement('button', { type: 'button', class: 'lk-btn lk-btn--ghost lk-btn--sm' });
  const cancelBtn = createElement('button', { type: 'button', class: 'lk-btn lk-btn--secondary lk-btn--sm' });
  const okBtn = createElement('button', { type: 'button', class: 'lk-btn lk-btn--primary lk-btn--sm' });
  actions.append(nowBtn, cancelBtn, okBtn);
  footer.append(summary, actions);
  panelRoot.append(row, footer);

  function bridge(name, payload, ctx) {
    const out = guard(btn, opts, name, payload, { source: ctx?.source || 'api', component: comp }, () => {});
    if (out === false) return false;
    if (out && typeof out.then === 'function') return out.then((v) => (v === false ? false : undefined));
    return undefined;
  }

  const proxy = lkPopupProxy(btn, {
    content: '',
    placement: opts.placement || 'bottom-left',
    className: 'lk-time-proxy',
    zIndex: opts.zIndex,
    beforeShow: (p, ctx) => (canEdit() ? bridge('open', undefined, ctx) : false),
    beforeHide: (reason, ctx) => bridge('close', reason, ctx),
    onShow() {
      draft = committed ? { ...committed } : nowRounded();
      paintPanel();
      proxy.updatePosition(root);
      node.setAttribute('aria-expanded', 'true');
      setTimeout(() => { if (!gone && proxy.isOpen) hourSel.focus(); }, 0);
      if (typeof opts.onOpen === 'function') opts.onOpen(comp);
    },
    onHide(reason) {
      node.setAttribute('aria-expanded', 'false');
      const hadFocus = panelRoot.contains(document.activeElement);
      draft = null;
      if (hadFocus && reason !== 'outside' && !gone) node.focus();
      if (typeof opts.onClose === 'function') opts.onClose(reason, comp);
    },
  });
  proxy.panelEl.textContent = '';
  proxy.panelEl.appendChild(panelRoot);
  const ariaBtn = () => { btn.setAttribute('aria-label', `${field.getLabel() || tx.t('label')}: ${tx.t('open')}`); };

  // --- Panel painting --------------------------------------------------------------

  function nowRounded() {
    const d = new Date();
    return { h: d.getHours(), m: Math.min(59, Math.round(d.getMinutes() / minuteStep) * minuteStep) % 60, s: 0 };
  }

  const opt = (value, text, disabled) => {
    const o = createElement('option', { value: String(value) }, text);
    if (disabled) o.disabled = true;
    return o;
  };

  function buildSelects() {
    const is12 = format() === 12;
    hourSel.replaceChildren();
    const pm = !!(draft && draft.h >= 12);
    for (let h = is12 ? 1 : 0; h <= (is12 ? 12 : 23); h++) {
      const h24 = is12 ? (h % 12) + (pm ? 12 : 0) : h;
      const blocked = (minT && h24 * 3600 + 3599 < secsOf(minT)) || (maxT && h24 * 3600 > secsOf(maxT));
      hourSel.appendChild(opt(h, nf2.format(h), !!blocked));
    }
    minSel.replaceChildren();
    const mins = [];
    for (let m = 0; m < 60; m += minuteStep) mins.push(m);
    if (draft && !mins.includes(draft.m)) { mins.push(draft.m); mins.sort((a, b) => a - b); }
    mins.forEach((m) => minSel.appendChild(opt(m, nf2.format(m))));
    secSel.replaceChildren();
    for (let s = 0; s < 60; s++) secSel.appendChild(opt(s, nf2.format(s)));
  }

  function paintPanel() {
    const is12 = format() === 12;
    panelRoot.setAttribute('aria-label', field.getLabel() || tx.t('label'));
    hourSel.setAttribute('aria-label', tx.t('hour'));
    minSel.setAttribute('aria-label', tx.t('minute'));
    secSel.setAttribute('aria-label', tx.t('second'));
    ampm.setAttribute('aria-label', tx.t('meridiem'));
    amBtn.textContent = tx.t('am');
    pmBtn.textContent = tx.t('pm');
    nowBtn.textContent = tx.t('now');
    cancelBtn.textContent = tx.tf('common.cancel');
    okBtn.textContent = tx.tf('common.ok');
    secSel.hidden = !seconds; sepB.hidden = !seconds; ampm.hidden = !is12;
    if (!draft) { summary.textContent = ''; return; }
    buildSelects();
    hourSel.value = String(is12 ? draft.h % 12 || 12 : draft.h);
    minSel.value = String(draft.m);
    secSel.value = String(draft.s);
    const pm = draft.h >= 12;
    amBtn.setAttribute('aria-pressed', String(!pm));
    pmBtn.setAttribute('aria-pressed', String(pm));
    amBtn.classList.toggle('lk-time-panel__ampm-btn--on', !pm);
    pmBtn.classList.toggle('lk-time-panel__ampm-btn--on', pm);
    summary.textContent = displayOf(draft);
    okBtn.disabled = !inRange(draft);
  }

  function readDraft() {
    const is12 = format() === 12;
    let h = parseInt(hourSel.value, 10);
    if (is12) h = (h % 12) + (draft.h >= 12 ? 12 : 0);
    draft = { h, m: parseInt(minSel.value, 10), s: seconds ? parseInt(secSel.value, 10) : 0 };
    paintPanel();
  }
  function onSel() { if (draft) readDraft(); }
  function onAmPm(e) {
    const b = e.target.closest('[data-meridiem]');
    if (!b || !draft) return;
    const pm = b.dataset.meridiem === 'pm';
    draft = { ...draft, h: (draft.h % 12) + (pm ? 12 : 0) };
    paintPanel();
  }

  // --- Commit ------------------------------------------------------------------------

  const ctxOf = (source, t) => ({ source, component: comp, display: displayOf(t), iso: toIso(t) });

  function applyValue(t, source) {
    committed = t;
    badText = false;
    render();
    validation?.changed();
    if (typeof opts.onChange === 'function') opts.onChange(toIso(t), ctxOf(source, t));
  }

  // returns true (applied or unchanged) | false (vetoed) | Promise<boolean>
  function commit(t, source) {
    if (toIso(t) === toIso(committed)) { badText = false; render(); return true; }
    const out = guard(root, opts, 'change', toIso(t), ctxOf(source, t), (next) => {
      let nt = t;
      if (next !== toIso(t)) { const p = next == null ? null : parse(next); if (p || next === null) nt = p; }
      applyValue(nt, source);
    });
    const revert = (ok) => { if (ok === false && !gone) render(); };
    if (out && typeof out.then === 'function') out.then(revert); else revert(out);
    return out;
  }

  function commitText(source = 'input') {
    const raw = node.value.trim();
    if (!raw) { badText = false; return commit(null, source); }
    if (!badText && committed && raw === displayOf(committed)) return true;
    const t = parse(raw);
    if (!t) {
      badText = true;
      comp.validate();
      return false;
    }
    return commit(t, source);
  }

  function render() {
    if (!badText) node.value = displayOf(committed);
    hidden.value = toIso(committed) || '';
    node.setAttribute('placeholder', opts.placeholder ?? original.placeholder ?? tx.t('placeholder'));
    ariaBtn();
  }

  const closeThen = (reason) => { proxy.hide(reason, 'user'); };

  function confirm() {
    if (!draft || !inRange(draft)) return;
    const t = { ...draft };
    const out = guard(root, opts, 'confirm', toIso(t), { source: 'confirm', component: comp }, (next) => {
      const nt = typeof next === 'string' && next !== toIso(t) ? (parse(next) || t) : t;
      const done = (ok) => {
        if (gone) return;
        closeThen('confirm');
        if (ok !== false && typeof opts.onConfirm === 'function') opts.onConfirm(toIso(nt), { component: comp, display: displayOf(nt), iso: toIso(nt) });
      };
      const r = commit(nt, 'confirm');
      if (r && typeof r.then === 'function') r.then(done); else done(r);
    });
    void out;
  }
  function onNow() {
    const d = new Date();
    const t = { h: d.getHours(), m: d.getMinutes(), s: seconds ? d.getSeconds() : 0 };
    const r = commit(t, 'now');
    const done = () => { if (!gone) closeThen('now'); };
    if (r && typeof r.then === 'function') r.then(done); else done();
  }

  // --- Events ----------------------------------------------------------------------

  function onInputChange() { commitText('input'); }
  function onInputKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = commitText('input');
      if (r !== false && proxy.isOpen) proxy.hide('confirm', 'user');
    } else if ((e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') {
      e.preventDefault();
      if (!proxy.isOpen) proxy.show(root, 'user');
    }
  }
  function onPanelKey(e) {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); confirm(); }
  }
  const onCancel = () => closeThen('cancel');
  const onInputFocus = () => { badText = badText && !!node.value.trim(); };
  const onReset = () => setTimeout(() => { if (gone) return; committed = parse(original.value); badText = false; render(); validation?.clearValidation(); }, 0);

  node.addEventListener('change', onInputChange);
  node.addEventListener('keydown', onInputKey);
  node.addEventListener('focus', onInputFocus);
  hourSel.addEventListener('change', onSel);
  minSel.addEventListener('change', onSel);
  secSel.addEventListener('change', onSel);
  ampm.addEventListener('click', onAmPm);
  nowBtn.addEventListener('click', onNow);
  cancelBtn.addEventListener('click', onCancel);
  okBtn.addEventListener('click', confirm);
  panelRoot.addEventListener('keydown', onPanelKey);
  const form = node.form;
  form?.addEventListener('reset', onReset);

  // --- API ---------------------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || root });

  function relocale() {
    if (gone) return;
    buildFormats();
    render();
    if (draft) paintPanel();
  }

  function setDisabled(v) {
    node.disabled = !!v; btn.disabled = !!v; hidden.disabled = !!v;
    root.classList.toggle('lk-time--disabled', !!v);
    if (v) proxy.hide('disabled');
  }
  function setReadonly(v) {
    readonly = !!v;
    node.readOnly = readonly;
    btn.disabled = readonly || node.disabled;
    root.classList.toggle('lk-time--readonly', readonly);
    if (readonly) proxy.hide('readonly');
  }

  Object.defineProperties(comp, {
    value: {
      get() { return toIso(committed); },
      set(v) { committed = parse(v); badText = false; render(); },
      enumerable: true,
    },
    display: { get() { return displayOf(committed); }, enumerable: true },
    iso: { get() { return toIso(committed); }, enumerable: true },
    date: { get() { return committed ? new Date(1970, 0, 1, committed.h, committed.m, committed.s) : null; }, enumerable: true },
    format: { get() { return format(); }, set(v) { fmtOpt = v === 12 || v === 24 ? v : null; relocale(); }, enumerable: true },
    minuteStep: { get() { return minuteStep; }, set(v) { minuteStep = Math.max(1, Math.min(30, Math.floor(v) || 1)); if (draft) paintPanel(); }, enumerable: true },
    seconds: { get() { return seconds; }, set(v) { seconds = !!v; relocale(); }, enumerable: true },
    min: { get() { return minT ? toIso(minT) : null; }, set(v) { minT = parseTime(v); if (draft) paintPanel(); }, enumerable: true },
    max: { get() { return maxT ? toIso(maxT) : null; }, set(v) { maxT = parseTime(v); if (draft) paintPanel(); }, enumerable: true },
    locale: { get() { return locale(); }, set(v) { opts.locale = v || undefined; relocale(); }, enumerable: true },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true, configurable: true },
    name: { get() { return hidden.name; }, set(v) { hidden.name = v || ''; }, enumerable: true },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); ariaBtn(); }, enumerable: true },
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

  comp.setError = (m) => { field.setError(m); root.classList.add('lk-time--error'); };
  comp.clearError = () => { field.clearError(); root.classList.remove('lk-time--error'); };
  comp.refreshLabels = () => { field.refreshLabels(); ariaBtn(); };
  comp.focus = (o) => node.focus(o);
  comp.open = () => { proxy.show(root, 'api'); return comp; };
  comp.close = (reason = 'close') => { proxy.hide(reason, 'api'); return comp; };
  comp.toggle = () => { if (proxy.isOpen) comp.close('toggle'); else comp.open(); return comp; };
  comp.setValue = (v, source = 'api') => commit(parse(v), source);
  comp.clear = () => commit(null, 'api');

  buildFormats();
  committed = opts.value !== undefined ? parse(opts.value) : parse(original.value);
  render();
  if (opts.disabled || node.disabled) setDisabled(true);
  if (readonly) setReadonly(true);

  validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => toIso(committed),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    roots: () => [root, proxy.panelEl],
    isOpen: () => proxy.isOpen,
    setError: comp.setError,
    clearError: comp.clearError,
    builtinRules: [
      () => (badText ? tx.t('invalid') : true),
      () => (committed && minT && secsOf(committed) < secsOf(minT) ? tx.t('min', { min: displayOf(minT) }) : true),
      () => (committed && maxT && secsOf(committed) > secsOf(maxT) ? tx.t('max', { max: displayOf(maxT) }) : true),
    ],
  });

  comp.destroy = function () {
    gone = true;
    tx.destroy();
    validation.destroy();
    node.removeEventListener('change', onInputChange);
    node.removeEventListener('keydown', onInputKey);
    node.removeEventListener('focus', onInputFocus);
    cancelBtn.removeEventListener('click', onCancel);
    hourSel.removeEventListener('change', onSel);
    minSel.removeEventListener('change', onSel);
    secSel.removeEventListener('change', onSel);
    ampm.removeEventListener('click', onAmPm);
    nowBtn.removeEventListener('click', onNow);
    okBtn.removeEventListener('click', confirm);
    panelRoot.removeEventListener('keydown', onPanelKey);
    form?.removeEventListener('reset', onReset);
    proxy.destroy();
    comp.clearError();
    root.parentNode?.insertBefore(node, root);
    root.remove();
    hidden.remove();
    node.classList.remove('lk-input', 'lk-input--affixed', 'lk-time__input', 'lk-input--dense');
    if (!node.getAttribute('class')) node.removeAttribute('class');
    node.disabled = false;
    node.readOnly = false;
    node.removeAttribute('aria-haspopup');
    node.removeAttribute('aria-expanded');
    const restore = (n, v) => (v == null ? node.removeAttribute(n) : node.setAttribute(n, v));
    restore('type', original.type); restore('name', original.name); restore('autocomplete', original.autocomplete);
    restore('placeholder', original.placeholder); restore('role', original.role);
    node.value = original.value;
    field.destroyField();
  };

  return comp;
}
