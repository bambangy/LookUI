// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkForm — a NON-reactive form helper: a field registry on top of a <form>.
 *
 *   const form = Look.lkForm('#signup', {
 *     fields: { email: emailBox, country: countryDd },         // components, matched by key
 *     onChange(values, { name, source }) { … },                // fires for user edits
 *     onSubmit(values, { component, event }) { return api.save(values); },
 *   });
 *   form.getValues();            // { email, country, newsletter: true, tags: ['a','b'] }
 *   form.setValues({ email: 'a@b.c' });      // silent
 *   form.dirty; form.changes(); form.commit(); form.reset();
 *
 * Native controls inside the form that are not part of a registered component are handled by
 * `name` (text, number, checkbox, radio, select, textarea, file, date …). There is no state of
 * its own: values are read from the fields every time, `dirty` deep-compares them with the
 * baseline taken at creation (or the last `commit()`).
 *
 * `onChange` is driven by the bubbling native `input` / `change` events of the form. Components
 * whose value is not backed by a native input event can call `form.notify(name)`.
 *
 * @param {HTMLFormElement|string} form
 * @param {Object} [opts]
 * @param {Object}  [opts.fields]       — { name: component } registered at creation
 * @param {boolean} [opts.native=false] — do not take over submit: validate only (sync) and let the browser post
 * @param {boolean} [opts.novalidate=true] — add `novalidate` to the form (components own the validation UI)
 * @param {boolean} [opts.warnOnLeave=false] — ask before the page is left while the form is dirty
 * @param {boolean} [opts.focusFirst=true]  — focus the first invalid component
 * @param {boolean} [opts.scroll=true]
 * @param {Element|string} [opts.loading]   — element covered by lkInnerLoading while a submit handler runs
 * @param {string}  [opts.loadingText]
 * @param {Function} [opts.onChange]    — (values, { source:'input'|'change'|'notify'|'api', name, component })
 * @param {Function} [opts.onSubmit]    — (values, { source, component, event }) => any | Promise; throw / reject to report a server error (422 bodies map onto fields)
 * @param {Function} [opts.onSubmitted] — (result, { values, component }) after submit settled ({ ok, reason, … })
 * @param {Function} [opts.onReset]     — ({ source, component }) after a reset
 * @param {Function} [opts.beforeSubmit] — guard (values, { source, component, event }) before validation; false cancels, an object replaces the values
 * @param {Function} [opts.beforeReset]  — guard ({ source, component })
 * @returns {Object}
 */

import { resolveEl } from '../helpers/base.js';
import { guard, guardSync } from '../helpers/guard.js';
import { lkValidation } from './validation.js';

const SKIP_TYPES = ['submit', 'button', 'reset', 'image'];

function isNode(v) { return typeof Node !== 'undefined' && v instanceof Node; }

function deepEqual(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof File !== 'undefined' && (a instanceof File || b instanceof File)) return false;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b) && !isNode(a)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function snapshot(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(snapshot);
  if (typeof File !== 'undefined' && v instanceof File) return v;
  if (v && typeof v === 'object' && !isNode(v) && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    Object.keys(v).forEach((k) => { out[k] = snapshot(v[k]); });
    return out;
  }
  return v;
}

function emptyLike(v) {
  if (Array.isArray(v)) return [];
  if (typeof v === 'boolean') return false;
  if (typeof v === 'string') return '';
  return null;
}

export function lkForm(form, opts = {}) {
  const node = resolveEl(form, 'lkForm');
  if (node.tagName !== 'FORM') throw new Error('Look.lkForm: element must be a <form>.');

  const options = { native: false, novalidate: true, warnOnLeave: false, focusFirst: true, scroll: true, ...opts };
  const registry = new Map();      // name -> component
  const fieldMap = {};             // live copy handed to lkValidation (server key -> component)
  let baseline = {};
  let last = {};                   // last value seen per name (dedupes input + change)
  let destroyed = false;
  let submitting = false;
  let leaveBound = false;

  const hadNovalidate = node.hasAttribute('novalidate');
  if (options.novalidate && !options.native && !hadNovalidate) node.setAttribute('novalidate', '');

  // --- Field discovery -----------------------------------------------------------

  const compEls = () => Array.from(registry.values()).map((c) => c.el).filter(isNode);

  function owned(ctl) {
    return compEls().some((el) => el === ctl || el.contains(ctl));
  }

  /** Native controls not owned by a registered component, grouped by name. */
  function nativeGroups() {
    const groups = new Map();
    node.querySelectorAll('input, select, textarea').forEach((ctl) => {
      if (!ctl.name || SKIP_TYPES.includes(ctl.type) || registry.has(ctl.name) || owned(ctl)) return;
      if (!groups.has(ctl.name)) groups.set(ctl.name, []);
      groups.get(ctl.name).push(ctl);
    });
    return groups;
  }

  function readNative(list) {
    const first = list[0];
    const type = first.type;
    if (type === 'checkbox') {
      if (list.length === 1 && !first.hasAttribute('value')) return first.checked;
      const vals = list.filter((c) => c.checked).map((c) => c.value);
      return list.length === 1 ? (first.checked ? first.value : null) : vals;
    }
    if (type === 'radio') {
      const on = list.find((c) => c.checked);
      return on ? on.value : null;
    }
    if (first.tagName === 'SELECT' && first.multiple) return Array.from(first.selectedOptions).map((o) => o.value);
    if (type === 'file') {
      const files = Array.from(first.files || []);
      return first.multiple ? files : (files[0] || null);
    }
    if (type === 'number' || type === 'range') return first.value === '' ? null : Number(first.value);
    return first.value;
  }

  function writeNative(list, v) {
    const first = list[0];
    const type = first.type;
    if (type === 'checkbox') {
      if (list.length === 1 && !first.hasAttribute('value')) first.checked = !!v;
      else {
        const set = new Set((Array.isArray(v) ? v : v == null ? [] : [v]).map(String));
        list.forEach((c) => { c.checked = set.has(c.value); });
      }
    } else if (type === 'radio') {
      list.forEach((c) => { c.checked = v != null && String(c.value) === String(v); });
    } else if (first.tagName === 'SELECT' && first.multiple) {
      const set = new Set((Array.isArray(v) ? v : v == null ? [] : [v]).map(String));
      Array.from(first.options).forEach((o) => { o.selected = set.has(o.value); });
    } else if (type === 'file') {
      if (v == null || (Array.isArray(v) && !v.length)) first.value = '';
      else if (typeof DataTransfer === 'function') {
        const dt = new DataTransfer();
        (Array.isArray(v) ? v : [v]).forEach((f) => { if (f instanceof File) dt.items.add(f); });
        first.files = dt.files;
      }
    } else {
      first.value = v == null ? '' : String(v);
    }
  }

  // --- Registry ------------------------------------------------------------------

  function register(name, component) {
    if (destroyed) return api;
    if (!name || component == null || typeof component !== 'object') throw new Error('Look.lkForm.register: a name and a component are required.');
    registry.set(name, component);
    fieldMap[name] = component;
    const v = readComponent(component);
    baseline[name] = snapshot(v);
    last[name] = snapshot(v);
    return api;
  }

  function unregister(name) {
    registry.delete(name);
    delete fieldMap[name];
    delete baseline[name];
    delete last[name];
    return api;
  }

  function readComponent(c) {
    return c.value;
  }

  function nameOf(target) {
    for (const [name, c] of registry) {
      if (isNode(c.el) && (c.el === target || c.el.contains(target))) return name;
    }
    if (target && target.name && !SKIP_TYPES.includes(target.type)) return target.name;
    return null;
  }

  // --- Values --------------------------------------------------------------------

  function getValues() {
    const out = {};
    registry.forEach((c, name) => { out[name] = snapshot(readComponent(c)); });
    nativeGroups().forEach((list, name) => { out[name] = readNative(list); });
    return out;
  }

  function setValues(values, o = {}) {
    if (destroyed || !values) return api;
    const silent = o.silent !== false;
    const groups = nativeGroups();
    Object.keys(values).forEach((name) => {
      if (registry.has(name)) registry.get(name).value = values[name];
      else if (groups.has(name)) writeNative(groups.get(name), values[name]);
      else return;
      if (!silent) emitChange(name, 'api');
      else last[name] = snapshot(values[name]);
    });
    return api;
  }

  function emptyValues() {
    const cur = getValues();
    const groups = nativeGroups();
    registry.forEach((c, name) => {
      if (typeof c.clear === 'function') c.clear();
      else c.value = emptyLike(cur[name]);
    });
    groups.forEach((list, name) => {
      const first = list[0];
      if (first.type === 'checkbox' || first.type === 'radio') writeNative(list, first.type === 'checkbox' && list.length === 1 && !first.hasAttribute('value') ? false : null);
      else if (first.tagName === 'SELECT') first.selectedIndex = first.multiple ? -1 : 0;
      else writeNative(list, first.type === 'file' ? null : '');
    });
  }

  function clearValidation() {
    registry.forEach((c) => c.clearValidation?.());
  }

  function changes() {
    const now = getValues();
    const out = {};
    new Set([...Object.keys(baseline), ...Object.keys(now)]).forEach((k) => {
      if (!deepEqual(baseline[k], now[k])) out[k] = { from: baseline[k], to: now[k] };
    });
    return out;
  }

  function emitChange(name, source, comp) {
    const values = getValues();
    last[name] = snapshot(values[name]);
    options.onChange?.(values, { source, name, component: comp || registry.get(name) || null, form: api });
  }

  // --- Native events --------------------------------------------------------------

  function onFieldEvent(e) {
    if (destroyed) return;
    const name = nameOf(e.target);
    if (!name) return;
    const now = name in getValues() ? getValues()[name] : undefined;
    if (deepEqual(last[name], now)) return;
    emitChange(name, e.type === 'input' ? 'input' : 'change');
  }

  function notify(name) {
    if (destroyed || !(name in getValues())) return api;
    emitChange(name, 'notify');
    return api;
  }

  function members() {
    return Array.from(registry.values()).filter((c) => typeof c.validate === 'function');
  }

  function validation(extra = {}) {
    return lkValidation(members(), {
      focusFirst: options.focusFirst,
      scroll: options.scroll,
      fields: fieldMap,
      loading: options.loading || null,
      loadingText: options.loadingText || null,
      ...extra,
    });
  }

  function validate(o = {}) {
    const v = validation(o);
    const res = v.validate();
    v.destroy();
    return res;
  }

  async function validateAsync(o = {}) {
    const v = validation(o);
    const res = await v.validateAsync();
    v.destroy();
    return res;
  }

  function setErrors(map, o = {}) {
    const v = validation(o);
    const unmatched = v.setErrors(map);
    v.destroy();
    return unmatched;
  }

  /**
   * Guard → validate → handler(values) → server errors onto fields. Never rejects.
   * @returns {Promise<{ ok: boolean, reason?: string, result?: any, errors?: Array, unmatched?: Array, message?: string, error?: any }>}
   */
  async function submit(handler, o = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    if (submitting) return { ok: false, reason: 'busy' };
    const source = o.source || 'api';
    const ctx = { source, component: api, event: o.event || null };
    const fn = handler || options.onSubmit;
    let values = getValues();
    submitting = true;
    node.setAttribute('aria-busy', 'true');
    let result;
    try {
      const outcome = await new Promise((resolve) => {
        const r = guard(node, options, 'submit', values, ctx, (next) => resolve({ values: next }));
        if (r === false) resolve(null);
        else if (r && typeof r.then === 'function') r.then((v) => { if (v === false) resolve(null); }, () => resolve(null));
      });
      if (!outcome) {
        result = { ok: false, reason: 'cancelled' };
      } else {
        values = outcome.values && typeof outcome.values === 'object' ? outcome.values : values;
        const v = validation({ focusFirst: o.focusFirst ?? options.focusFirst, scroll: o.scroll ?? options.scroll });
        try {
          result = await v.submit(async () => (typeof fn === 'function' ? fn(values, ctx) : undefined));
        } finally {
          v.destroy();
        }
      }
    } finally {
      submitting = false;
      node.removeAttribute('aria-busy');
    }
    if (!destroyed) options.onSubmitted?.(result, { values, component: api });
    return result;
  }

  function onSubmitEvent(e) {
    if (destroyed) return;
    if (options.native) {
      const g = guardSync(node, options, 'submit', getValues(), { source: 'user', component: api, event: e });
      if (!g.allowed || validate().hasError) e.preventDefault();
      return;
    }
    e.preventDefault();
    submit(options.onSubmit, { source: 'user', event: e });
  }

  // --- Reset / clear ---------------------------------------------------------------

  function applyBaseline() {
    const groups = nativeGroups();
    Object.keys(baseline).forEach((name) => {
      if (registry.has(name)) registry.get(name).value = snapshot(baseline[name]);
      else if (groups.has(name)) writeNative(groups.get(name), baseline[name]);
    });
    clearValidation();
    last = snapshot(baseline);
  }

  function reset(o = {}) {
    if (destroyed) return api;
    const source = o.source || 'api';
    guard(node, options, 'reset', undefined, { source, component: api }, () => {
      if (destroyed) return;
      applyBaseline();
      options.onReset?.({ source, component: api });
    });
    return api;
  }

  function onResetEvent(e) {
    if (destroyed) return;
    e.preventDefault();   // the baseline, not the markup defaults, is what "reset" means here
    reset({ source: 'user' });
  }

  function commit() {
    baseline = snapshot(getValues());
    last = snapshot(baseline);
    return api;
  }

  function clear() {
    if (destroyed) return api;
    emptyValues();
    clearValidation();
    last = snapshot(getValues());
    return api;
  }

  // --- State -----------------------------------------------------------------------

  function setDisabled(on) {
    registry.forEach((c) => { c.enabled = !on; });
    nativeGroups().forEach((list) => list.forEach((ctl) => { ctl.disabled = on; }));
    return api;
  }

  function setReadonly(on = true) {
    registry.forEach((c) => { if ('readonly' in c) c.readonly = !!on; });
    nativeGroups().forEach((list) => list.forEach((ctl) => {
      if (ctl.tagName === 'TEXTAREA' || (ctl.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'range', 'color'].includes(ctl.type))) ctl.readOnly = !!on;
      else ctl.disabled = !!on;
    }));
    return api;
  }

  function serialize() {
    const fd = new FormData();
    const add = (name, v, c) => {
      if (v == null || v === false) return;
      if (Array.isArray(v)) { v.forEach((x) => add(name, x, c)); return; }
      if (typeof File !== 'undefined' && v instanceof File) fd.append(name, v, v.name);
      else if (v instanceof Date) fd.append(name, typeof c?.iso === 'function' ? c.iso() : v.toISOString());
      else if (v === true) fd.append(name, (c?.el && c.el.value && c.el.value !== 'on' ? c.el.value : 'on'));
      else if (typeof v === 'object') fd.append(name, JSON.stringify(v));
      else fd.append(name, String(v));
    };
    registry.forEach((c, name) => {
      if (c.enabled === false || c.disabled === true) return;
      add(name, readComponent(c), c);
    });
    nativeGroups().forEach((list, name) => {
      if (list.every((c) => c.disabled)) return;
      add(name, readNative(list));
    });
    return fd;
  }

  // --- Leave warning ------------------------------------------------------------------

  function onBeforeUnload(e) {
    if (!api.dirty) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  function bindLeave(on) {
    if (on && !leaveBound) { window.addEventListener('beforeunload', onBeforeUnload); leaveBound = true; }
    else if (!on && leaveBound) { window.removeEventListener('beforeunload', onBeforeUnload); leaveBound = false; }
  }

  // --- API -------------------------------------------------------------------------

  const api = {
    el: node,
    register,
    unregister,
    get(name) {
      if (registry.has(name)) return registry.get(name);
      const list = nativeGroups().get(name);
      return list ? (list.length === 1 ? list[0] : list) : null;
    },
    get names() { return Array.from(new Set([...registry.keys(), ...nativeGroups().keys()])); },
    getValues,
    setValues,
    reset,
    commit,
    markPristine: commit,
    clear,
    changes,
    get dirty() { return Object.keys(changes()).length > 0; },
    get submitting() { return submitting; },
    get warnOnLeave() { return leaveBound; },
    set warnOnLeave(v) { bindLeave(!!v && !destroyed); },
    validate,
    validateAsync,
    setErrors,
    clearValidation() { clearValidation(); return api; },
    submit,
    notify,
    serialize,
    toJSON: getValues,
    disable() { return setDisabled(true); },
    enable() { return setDisabled(false); },
    readonly: setReadonly,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      bindLeave(false);
      node.removeEventListener('input', onFieldEvent);
      node.removeEventListener('change', onFieldEvent);
      node.removeEventListener('submit', onSubmitEvent);
      node.removeEventListener('reset', onResetEvent);
      node.removeAttribute('aria-busy');
      if (options.novalidate && !options.native && !hadNovalidate) node.removeAttribute('novalidate');
      registry.clear();
      Object.keys(fieldMap).forEach((k) => delete fieldMap[k]);
      baseline = {};
      last = {};
    },
  };

  node.addEventListener('input', onFieldEvent);
  node.addEventListener('change', onFieldEvent);
  node.addEventListener('submit', onSubmitEvent);
  node.addEventListener('reset', onResetEvent);

  Object.entries(options.fields || {}).forEach(([name, comp]) => register(name, comp));
  // Baseline = everything present now (registered and native)
  baseline = snapshot(getValues());
  last = snapshot(baseline);
  if (options.warnOnLeave) bindLeave(true);

  return api;
}
