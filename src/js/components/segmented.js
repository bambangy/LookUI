// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Segmented component — segmented button group (single / multiple)

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';

lkI18n.define('segmented', {
  required: 'Select an option',
  'required.multiple': 'Select at least one option',
});

const same = (a, b) => String(a) === String(b);

/**
 * Segmented button group.
 *
 *   // from items
 *   const seg = Look.lkSegmented('#view', { items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }], value: 'day' });
 *   // from markup: <div id="view"><button data-value="day">Day</button><button data-value="week">Week</button></div>
 *   // or radios:   <div id="view"><label><input type="radio" name="v" value="day"> Day</label>…</div>
 *
 * Single mode is a radio group (arrow keys move and select, roving tabindex) with a sliding indicator;
 * `multiple` makes toggle buttons and `value` becomes an array.
 *
 * @param {Element|string} el — container (items / markup) element or selector
 * @param {Object} [opts]
 * @param {Array<{value:*,label?:string,icon?:string,disabled?:boolean,title?:string}>} [opts.items]
 * @param {boolean} [opts.multiple=false]
 * @param {*} [opts.value] — initial value (array when multiple)
 * @param {string} [opts.name] — hidden input name(s) (radio / checkbox markup keeps its native inputs)
 * @param {'sm'|'md'|'lg'} [opts.size] [opts.dense] [opts.block] — compact / full-width
 * @param {string} [opts.label] [opts.required] [opts.readonly] [opts.disabled]
 * @param {Array}  [opts.rules] [opts.validate] — validation
 * @param {Function} [opts.onChange] — (value, { source: 'click'|'keyboard'|'api', component, item })
 * @param {Function} [opts.beforeChange] — (value, { source, component, item }) => false | Promise | value — veto (selection and indicator stay) or replace
 * @param {Object} [opts.text] — text overrides ('segmented.*')
 * @returns {Object}
 */
export function lkSegmented(el, opts = {}) {
  const node = resolveEl(el, 'lkSegmented');
  const multiple = !!opts.multiple;
  const comp = {};
  let gone = false;
  let readonly = !!opts.readonly;
  let disabled = !!opts.disabled;
  let validation = null;
  let selected = []; // item objects
  const items = [];
  const snaps = new Map();

  const tx = bindText('segmented', opts.text, () => {});

  const orig = {
    role: node.getAttribute('role'), labelledby: node.getAttribute('aria-labelledby'),
    ariaDisabled: node.getAttribute('aria-disabled'), ariaReadonly: node.getAttribute('aria-readonly'),
    cls: node.getAttribute('class'), tabindex: node.getAttribute('tabindex'), orientation: node.getAttribute('aria-orientation'),
  };
  const hadChildren = node.children.length > 0;

  const field = wrapField(node, { label: opts.label, required: opts.required ?? opts.mandatory, requiredMark: opts.requiredMark });
  if (field.labelEl) {
    if (!field.labelEl.id) field.labelEl.id = `lk-seg-${Math.random().toString(36).slice(2, 8)}`;
    node.setAttribute('aria-labelledby', field.labelEl.id);
  }

  node.classList.add('lk-segmented');
  if (multiple) node.classList.add('lk-segmented--multiple');
  if (opts.dense) node.classList.add('lk-segmented--dense');
  if (opts.block) node.classList.add('lk-segmented--block');
  if (opts.size === 'sm' || opts.size === 'lg') node.classList.add(`lk-segmented--${opts.size}`);
  node.setAttribute('role', multiple ? 'group' : 'radiogroup');

  const indicator = createElement('span', { class: 'lk-segmented__indicator', 'aria-hidden': 'true' });
  if (!multiple) node.appendChild(indicator);

  // --- Items ------------------------------------------------------------------------

  const effDisabled = (it) => disabled || it.disabled;

  function snapshot(elm) {
    if (snaps.has(elm)) return;
    snaps.set(elm, {
      cls: elm.getAttribute('class'), role: elm.getAttribute('role'), checked: elm.getAttribute('aria-checked'),
      pressed: elm.getAttribute('aria-pressed'), tabindex: elm.getAttribute('tabindex'), type: elm.getAttribute('type'),
      disabled: elm.hasAttribute('disabled'), title: elm.getAttribute('title'),
    });
  }

  function makeItem(spec, elm, input) {
    const it = { value: spec.value, el: elm, input: input || null, disabled: !!spec.disabled, spec };
    return it;
  }

  function buildButton(spec) {
    const b = createElement('button', { type: 'button', class: 'lk-segmented__item' });
    if (spec.title) b.title = spec.title;
    if (spec.icon) b.appendChild(lkIcon(spec.icon, { size: 'sm' }));
    if (spec.label != null && spec.label !== '') b.appendChild(createElement('span', { class: 'lk-segmented__label' }, String(spec.label)));
    return makeItem(spec, b, null);
  }

  function adoptMarkup() {
    Array.from(node.children).forEach((child) => {
      if (child === indicator) return;
      if (child.matches('label') && child.querySelector('input[type="radio"], input[type="checkbox"]')) {
        const input = child.querySelector('input');
        snapshot(child); snapshot(input);
        const it = makeItem({ value: input.value, disabled: input.disabled }, child, input);
        input.classList.add('lk-segmented__input');
        child.classList.add('lk-segmented__item');
        if (opts.name != null) input.name = opts.name;
        items.push(it);
        it.checkedAtStart = input.checked;
      } else if (child.hasAttribute('data-value')) {
        snapshot(child);
        if (child.tagName === 'BUTTON' && !child.getAttribute('type')) child.setAttribute('type', 'button');
        child.classList.add('lk-segmented__item');
        const it = makeItem({ value: child.getAttribute('data-value'), disabled: child.disabled || child.hasAttribute('data-disabled') }, child, null);
        it.checkedAtStart = child.hasAttribute('data-selected') || child.getAttribute('aria-checked') === 'true' || child.classList.contains('lk-segmented__item--on');
        items.push(it);
      }
    });
  }

  if (Array.isArray(opts.items)) {
    opts.items.forEach((spec) => {
      const it = buildButton(spec);
      node.insertBefore(it.el, multiple ? null : indicator);
      it.built = true;
      items.push(it);
    });
  } else {
    adoptMarkup();
  }

  // --- Hidden inputs (button markup) -----------------------------------------------------

  const hiddenInputs = [];
  const hasRadios = () => items.some((i) => i.input);
  function syncHidden() {
    if (opts.name == null || hasRadios()) return;
    const vals = selected.map((i) => i.value);
    while (hiddenInputs.length > Math.max(vals.length, multiple ? 0 : 1)) hiddenInputs.pop().remove();
    if (!multiple && !hiddenInputs.length) { const h = createElement('input', { type: 'hidden', name: opts.name }); node.after(h); hiddenInputs.push(h); }
    if (multiple) {
      while (hiddenInputs.length < vals.length) { const h = createElement('input', { type: 'hidden', name: opts.name }); node.after(h); hiddenInputs.push(h); }
    }
    if (multiple) hiddenInputs.forEach((h, i) => { h.value = String(vals[i]); });
    else hiddenInputs[0].value = vals.length ? String(vals[0]) : '';
    hiddenInputs.forEach((h) => { h.disabled = disabled; });
  }

  // --- Painting ----------------------------------------------------------------------------

  const find = (v) => items.find((i) => same(i.value, v));
  const isOn = (it) => selected.includes(it);

  function paint() {
    const firstFocusable = items.find((i) => !effDisabled(i));
    items.forEach((it) => {
      const on = isOn(it);
      it.el.classList.toggle('lk-segmented__item--on', on);
      it.el.classList.toggle('lk-segmented__item--disabled', effDisabled(it));
      if (it.input) {
        it.input.checked = on;
        it.input.disabled = effDisabled(it);
        it.el.classList.toggle('lk-segmented__item--disabled', effDisabled(it));
        if (!multiple) it.input.tabIndex = on || (!selected.length && it === firstFocusable) ? 0 : -1;
      } else {
        it.el.setAttribute('role', multiple ? 'button' : 'radio');
        it.el.setAttribute(multiple ? 'aria-pressed' : 'aria-checked', String(on));
        it.el.removeAttribute(multiple ? 'aria-checked' : 'aria-pressed');
        if (it.el.tagName === 'BUTTON') it.el.disabled = effDisabled(it);
        else it.el.setAttribute('aria-disabled', String(effDisabled(it)));
        if (!multiple) it.el.tabIndex = on || (!selected.length && it === firstFocusable) ? 0 : -1;
      }
    });
    syncHidden();
    placeIndicator();
  }

  let ready = false;
  function placeIndicator() {
    if (multiple || gone) return;
    const it = selected[0];
    if (!it || !node.isConnected || !it.el.offsetWidth) { indicator.hidden = true; return; }
    indicator.hidden = false;
    const s = indicator.style;
    s.setProperty('--lk-seg-x', `${it.el.offsetLeft}px`);
    s.setProperty('--lk-seg-y', `${it.el.offsetTop}px`);
    s.setProperty('--lk-seg-w', `${it.el.offsetWidth}px`);
    s.setProperty('--lk-seg-h', `${it.el.offsetHeight}px`);
    if (!ready) { ready = true; requestAnimationFrame(() => { if (!gone) node.classList.add('lk-segmented--ready'); }); }
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => placeIndicator()); ro.observe(node); }
  const onWinResize = () => placeIndicator();
  window.addEventListener('resize', onWinResize);

  // --- Selection ---------------------------------------------------------------------------------

  const valueOf = () => (multiple ? selected.map((i) => i.value) : (selected[0] ? selected[0].value : null));

  function coerce(v) {
    if (v == null) return [];
    const arr = multiple ? (Array.isArray(v) ? v : [v]) : [Array.isArray(v) ? v[0] : v];
    return arr.map(find).filter(Boolean).filter((it, i, a) => a.indexOf(it) === i);
  }

  // Ask the guard, then apply. `next` = array of items.
  function change(next, source, item) {
    const payload = multiple ? next.map((i) => i.value) : (next[0] ? next[0].value : null);
    const out = guard(node, opts, 'change', payload, { source, component: comp, item: item || null }, (p) => {
      const list = p === payload ? next : coerce(p);
      selected = list;
      paint();
      validation?.changed();
      if (typeof opts.onChange === 'function') opts.onChange(valueOf(), { source, component: comp, item: item || null });
    });
    const revert = (ok) => { if (ok === false && !gone) paint(); };
    if (out && typeof out.then === 'function') out.then(revert); else revert(out);
    return out;
  }

  function choose(it, source) {
    if (readonly || effDisabled(it)) { paint(); return; }
    if (multiple) {
      change(isOn(it) ? selected.filter((x) => x !== it) : [...selected, it], source, it);
    } else if (!isOn(it)) {
      change([it], source, it);
    } else paint();
  }

  // --- Events ---------------------------------------------------------------------------------------

  const itemFrom = (target) => items.find((i) => i.el === target || i.el.contains(target));

  function onClick(e) {
    const it = itemFrom(e.target);
    if (!it) return;
    if (it.input) return; // radios / checkboxes go through the change handler
    e.preventDefault();
    choose(it, e.detail === 0 ? 'keyboard' : 'click');
  }
  function onInputChange(e) {
    const it = items.find((i) => i.input === e.target);
    if (!it) return;
    e.stopImmediatePropagation();
    // The native state changed first: put it back, then ask
    it.input.checked = isOn(it);
    choose(it, 'click');
  }
  function onKeydown(e) {
    if (multiple) return;
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const enabled = items.filter((i) => !effDisabled(i));
    const cur = enabled.findIndex((i) => i.el === document.activeElement || i.el.contains(document.activeElement));
    if (cur < 0 && !enabled.length) return;
    e.preventDefault();
    const rtl = getComputedStyle(node).direction === 'rtl';
    let dir = 0;
    if (e.key === 'ArrowRight') dir = rtl ? -1 : 1; else if (e.key === 'ArrowLeft') dir = rtl ? 1 : -1;
    else if (e.key === 'ArrowDown') dir = 1; else if (e.key === 'ArrowUp') dir = -1;
    let n;
    if (e.key === 'Home') n = enabled[0]; else if (e.key === 'End') n = enabled[enabled.length - 1];
    else n = enabled[(Math.max(cur, 0) + dir + enabled.length) % enabled.length];
    if (!n) return;
    (n.input || n.el).focus();
    choose(n, 'keyboard');
  }
  function onLabelClick() { (items.find((i) => isOn(i) && !effDisabled(i)) || items.find((i) => !effDisabled(i)))?.el.focus(); }
  field.labelEl?.addEventListener('click', onLabelClick);
  const onReset = () => setTimeout(() => { if (gone) return; selected = items.filter((i) => i.checkedAtStart); if (!multiple) selected = selected.slice(0, 1); paint(); validation?.clearValidation(); }, 0);

  node.addEventListener('click', onClick);
  node.addEventListener('change', onInputChange, true);
  node.addEventListener('keydown', onKeydown);
  const form = node.closest('form');
  form?.addEventListener('reset', onReset);

  // --- API ------------------------------------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || node });

  Object.defineProperties(comp, {
    value: {
      get() { return valueOf(); },
      set(v) { selected = coerce(v); paint(); },
      enumerable: true,
    },
    item: { get() { return selected[0] ? { ...selected[0].spec, value: selected[0].value } : null; }, enumerable: true },
    items: { get() { return items.map((i) => ({ ...i.spec, value: i.value, disabled: i.disabled })); }, enumerable: true },
    multiple: { value: multiple, enumerable: true },
    name: {
      get() { return opts.name ?? ''; },
      set(v) { opts.name = v || undefined; hiddenInputs.forEach((h) => { h.name = v || ''; }); items.forEach((i) => { if (i.input) i.input.name = v || ''; }); if (v) syncHidden(); },
      enumerable: true,
    },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); }, enumerable: true },
    labels: { get() { return field.labels; }, enumerable: true },
    required: { get() { return !!node.required; }, set(v) { field.setRequired(v); }, enumerable: true },
    mandatory: { get() { return !!node.required; }, set(v) { field.setRequired(v); } },
    readonly: {
      get() { return readonly; },
      set(v) { readonly = !!v; node.classList.toggle('lk-segmented--readonly', readonly); if (readonly) node.setAttribute('aria-readonly', 'true'); else node.removeAttribute('aria-readonly'); },
      enumerable: true,
    },
    disabled: {
      get() { return disabled; },
      set(v) {
        disabled = !!v;
        node.classList.toggle('lk-segmented--disabled', disabled);
        if (disabled) node.setAttribute('aria-disabled', 'true'); else node.removeAttribute('aria-disabled');
        paint();
      },
      enumerable: true,
    },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true, configurable: true },
    indicatorEl: { value: indicator, enumerable: true },
  });
  Object.defineProperty(comp, 'enabled', {
    get() { return !disabled; },
    set(v) { comp.disabled = !v; },
    enumerable: true,
    configurable: true,
  });

  comp.setError = (m) => { field.setError(m); node.classList.add('lk-segmented--error'); };
  comp.clearError = () => { field.clearError(); node.classList.remove('lk-segmented--error'); };
  comp.refreshLabels = field.refreshLabels;
  comp.focus = (o) => { (items.find((i) => isOn(i) && !effDisabled(i)) || items.find((i) => !effDisabled(i)))?.el.focus(o); };
  comp.setValue = (v, source = 'api') => change(coerce(v), source, null);
  comp.get = (value) => { const it = find(value); return it ? it.el : null; };

  comp.add = (spec, index) => {
    const it = buildButton(spec);
    const ref = index != null && items[index] ? items[index].el : (multiple ? null : indicator);
    node.insertBefore(it.el, ref);
    it.built = true;
    items.splice(index != null && items[index] ? index : items.length, 0, it);
    paint();
    return comp;
  };
  comp.remove = (value) => {
    const it = find(value);
    if (!it) return comp;
    items.splice(items.indexOf(it), 1);
    selected = selected.filter((x) => x !== it);
    if (it.built) it.el.remove();
    else {
      // enhanced markup: put the element back as it was and leave the group
      const s = snaps.get(it.el);
      it.el.classList.remove('lk-segmented__item', 'lk-segmented__item--on', 'lk-segmented__item--disabled');
      if (s) { /* original attributes are restored on destroy */ }
      it.el.remove();
    }
    paint();
    return comp;
  };
  comp.enable = (value) => { const it = find(value); if (it) { it.disabled = false; paint(); } return comp; };
  comp.disable = (value) => {
    const it = find(value);
    if (it) { it.disabled = true; if (!multiple && isOn(it)) selected = []; selected = selected.filter((x) => x !== it); paint(); }
    return comp;
  };

  // initial value
  if (opts.value !== undefined) selected = coerce(opts.value);
  else selected = items.filter((i) => i.checkedAtStart || i.input?.checked);
  if (!multiple) selected = selected.slice(0, 1);
  if (disabled) comp.disabled = true;
  if (readonly) comp.readonly = true;
  paint();
  requestAnimationFrame(() => { if (!gone) placeIndicator(); });

  validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => valueOf(),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => !!node.required,
    requiredMessage: () => tx.t(multiple ? 'required.multiple' : 'required'),
    roots: () => [field.wrapper || node],
    setError: comp.setError,
    clearError: comp.clearError,
  });

  comp.destroy = function () {
    gone = true;
    tx.destroy();
    validation.destroy();
    ro?.disconnect();
    window.removeEventListener('resize', onWinResize);
    node.removeEventListener('click', onClick);
    node.removeEventListener('change', onInputChange, true);
    node.removeEventListener('keydown', onKeydown);
    field.labelEl?.removeEventListener('click', onLabelClick);
    form?.removeEventListener('reset', onReset);
    comp.clearError();
    hiddenInputs.splice(0).forEach((h) => h.remove());
    indicator.remove();
    items.forEach((it) => { if (it.built) it.el.remove(); });
    snaps.forEach((s, elm) => {
      const r = (n, v) => (v == null ? elm.removeAttribute(n) : elm.setAttribute(n, v));
      r('class', s.cls); r('role', s.role); r('aria-checked', s.checked); r('aria-pressed', s.pressed);
      r('tabindex', s.tabindex); r('type', s.type); r('title', s.title);
      if ('disabled' in elm) elm.disabled = s.disabled;
      if (!elm.getAttribute('class')) elm.removeAttribute('class');
    });
    node.classList.remove('lk-segmented', 'lk-segmented--multiple', 'lk-segmented--dense', 'lk-segmented--block', 'lk-segmented--sm', 'lk-segmented--lg',
      'lk-segmented--ready', 'lk-segmented--readonly', 'lk-segmented--disabled', 'lk-segmented--error');
    if (!node.getAttribute('class')) node.removeAttribute('class');
    const r = (n, v) => (v == null ? node.removeAttribute(n) : node.setAttribute(n, v));
    r('role', orig.role); r('aria-labelledby', orig.labelledby); r('aria-disabled', orig.ariaDisabled); r('aria-readonly', orig.ariaReadonly);
    node.removeAttribute('aria-invalid');
    void hadChildren;
    field.destroyField();
  };

  return comp;
}
