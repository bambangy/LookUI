// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Localization — one registry for every user-facing string in the library.
//
//   Look.i18n.set('id', { 'upload.placeholder.single': 'Pilih berkas…' });
//   Look.i18n.use('id');                       // live: mounted components re-render their texts
//   Look.lkUpload(el, { text: { 'placeholder.single': 'Choose your CV' } });   // per instance
//
// Lookup order for a key:  instance `text` option  →  active locale (and its base language:
// 'id-ID' → 'id')  →  the fallback locale ('en')  →  the English defaults the components
// register  →  the key itself.
//
// A message is a string with {name} placeholders, a plural object ({ zero, one, few, many,
// other, '=3': … } picked with Intl.PluralRules from params.count), or a function (params) => string.
// Keys are flat and dotted: '<component>.<key>', e.g. 'table.filter.apply'.

const defaults = Object.create(null);   // English source strings, registered by each component
const dictionaries = new Map();         // locale -> { key: message }
const listeners = new Set();
let current = 'en';
let fallback = 'en';
const missing = new Set();

function chain(locale) {
  const out = [locale];
  const base = String(locale).split('-')[0];
  if (base && base !== locale) out.push(base);
  return out;
}

function interpolate(text, params) {
  return String(text).replace(/\{([\w.]+)\}/g, (m, k) => (params && params[k] != null ? String(params[k]) : m));
}

function render(message, params, locale) {
  if (typeof message === 'function') return String(message(params || {}));
  if (message && typeof message === 'object') {
    const n = params ? params.count : undefined;
    let form = message.other;
    if (n != null) {
      let rule = 'other';
      try { rule = new Intl.PluralRules(locale).select(Number(n)); } catch { /* unknown locale */ }
      form = message[`=${n}`] ?? message[rule] ?? message.other;
    }
    return interpolate(form ?? '', params);
  }
  return interpolate(message, params);
}

function notify() {
  listeners.forEach((fn) => { try { fn(current); } catch (e) { /* a broken listener must not block the others */ } });
}

export const lkI18n = {
  /** Active locale, e.g. 'en', 'id', 'id-ID'. */
  get locale() { return current; },

  /** Locale used when the active one lacks a key (default 'en'). */
  get fallback() { return fallback; },
  set fallback(v) { fallback = String(v || 'en'); },

  /**
   * Switch the active locale. Mounted components re-render their texts.
   * @param {string} locale
   */
  use(locale) {
    const next = String(locale || 'en');
    if (next === current) return lkI18n;
    current = next;
    notify();
    return lkI18n;
  },

  /**
   * Add / replace messages of a locale (merged into what is already there).
   * @param {string} locale
   * @param {Object} messages — flat { 'component.key': message }
   */
  set(locale, messages) {
    const loc = String(locale);
    const dict = dictionaries.get(loc) || {};
    Object.assign(dict, messages || {});
    dictionaries.set(loc, dict);
    if (chain(current).includes(loc) || chain(fallback).includes(loc)) notify();
    return lkI18n;
  },

  /** Shorthand for set(<active locale>, messages). */
  extend(messages) {
    return lkI18n.set(current, messages);
  },

  /**
   * Register the English source strings of a component (done by the library itself;
   * also for your own components built on lkI18n).
   * @param {string} namespace — e.g. 'upload'
   * @param {Object} messages  — relative keys: { 'placeholder.single': 'Choose a file…' }
   */
  define(namespace, messages) {
    for (const [k, v] of Object.entries(messages)) defaults[`${namespace}.${k}`] = v;
    return lkI18n;
  },

  /**
   * Translate a key.
   * @param {string} key — 'upload.placeholder.single'
   * @param {Object} [params] — placeholder values, and `count` for plurals
   * @param {Object} [own] — instance overrides, same keys (used by components for their `text` option)
   * @returns {string}
   */
  t(key, params, own) {
    let message;
    let locale = current;
    if (own && Object.prototype.hasOwnProperty.call(own, key)) {
      message = own[key];
    } else {
      for (const loc of [...chain(current), ...chain(fallback)]) {
        const dict = dictionaries.get(loc);
        if (dict && Object.prototype.hasOwnProperty.call(dict, key)) { message = dict[key]; locale = loc; break; }
      }
      if (message === undefined) { message = defaults[key]; locale = 'en'; }
    }
    if (message === undefined) {
      if (!missing.has(key)) {
        missing.add(key);
        // eslint-disable-next-line no-console
        if (typeof console !== 'undefined') console.warn(`Look.i18n: no text for "${key}"`);
      }
      return key;
    }
    return render(message, params, locale);
  },

  /** True when the key has a text in the active locale, the fallback or the defaults. */
  has(key) {
    return key in defaults || [...chain(current), ...chain(fallback)].some((l) => dictionaries.get(l) && key in dictionaries.get(l));
  },

  /** Every registered key (English defaults), sorted; or only one namespace. */
  keys(namespace) {
    const all = Object.keys(defaults).sort();
    return namespace ? all.filter((k) => k.startsWith(`${namespace}.`)) : all;
  },

  /** The English defaults as { key: message } (optionally one namespace) — a ready translation template. */
  defaults(namespace) {
    const out = {};
    lkI18n.keys(namespace).forEach((k) => { out[k] = defaults[k]; });
    return out;
  },

  /** Locales that have a dictionary. */
  locales() { return Array.from(dictionaries.keys()); },

  /** Subscribe to locale / dictionary changes. Returns the unsubscribe function. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Drop every dictionary and go back to 'en' (the English defaults stay). */
  reset() {
    dictionaries.clear();
    missing.clear();
    current = 'en';
    fallback = 'en';
    notify();
    return lkI18n;
  },
};

/**
 * Per-component text binding: instance overrides + live locale updates.
 *
 *   const tx = bindText('upload', opts.text, () => render());
 *   tx.t('placeholder.single')          // 'upload.placeholder.single'
 *   tx.tf('validation.required', { label })   // absolute key (shared texts)
 *   comp.text = …  → tx.set(next)  (+ re-render)     tx.destroy() on component destroy
 *
 * Instance `text` keys are relative to the namespace ('placeholder.single') or absolute
 * ('upload.placeholder.single', 'common.remove', 'validation.required'); a function value receives the params.
 *
 * @param {string} ns
 * @param {Object} [own] — opts.text
 * @param {Function} [refresh] — called when the locale or a dictionary changes
 */
export function bindText(ns, own, refresh) {
  let overrides = own && typeof own === 'object' ? { ...own } : {};
  const prefix = `${ns}.`;

  // Overrides are looked up by the absolute key: relative entries get the namespace prefix,
  // the shared 'common.' / 'validation.' texts are already absolute.
  const SHARED = /^(common|validation)\./;
  const absolute = () => {
    const out = {};
    for (const [k, v] of Object.entries(overrides)) out[k.startsWith(prefix) || SHARED.test(k) ? k : prefix + k] = v;
    return out;
  };
  let resolved = absolute();

  const off = typeof refresh === 'function' ? lkI18n.onChange(() => refresh()) : null;

  return {
    t: (key, params) => lkI18n.t(prefix + key, params, resolved),
    tf: (key, params) => lkI18n.t(key, params, resolved),
    get: () => ({ ...overrides }),
    set(next) {
      overrides = next && typeof next === 'object' ? { ...next } : {};
      resolved = absolute();
      if (typeof refresh === 'function') refresh();
    },
    destroy() { if (off) off(); },
  };
}

// Generic words shared by many components (override once, applies everywhere that uses them).
lkI18n.define('common', {
  ok: 'OK',
  cancel: 'Cancel',
  close: 'Close',
  remove: 'Remove',
  clear: 'Clear',
  search: 'Search',
  loading: 'Loading…',
  retry: 'Retry',
  save: 'Save',
  delete: 'Delete',
  edit: 'Edit',
  add: 'Add',
  apply: 'Apply',
  reset: 'Reset',
  yes: 'Yes',
  no: 'No',
  confirm: 'Confirm',
  select: 'Select',
  previous: 'Previous',
  next: 'Next',
  noResults: 'No results',
});
