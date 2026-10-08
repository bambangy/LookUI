// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkValidation — validate a group of validateable components together.
 *
 *   const form = Look.lkValidation(name, email, country);     // or lkValidation([name, email], { focusFirst: false })
 *   const { hasError, errors } = form.validate();             // sync rules (+ cached async results)
 *   await form.validateAsync();                               // every rule, async ones awaited
 *   form.setErrors({ email: ['Already registered'] });         // server errors, matched by component name
 *   await form.submit(async () => { … throw 422 body … });     // validate → run → map field errors
 *
 * Disabled and hidden components are skipped (they are not submitted either).
 *
 * @param {...(Object|Object[])} args — components (any object with validate()), arrays of them,
 *                                      and optionally a trailing options object
 * @param {boolean} [options.focusFirst=true] — focus the first invalid component after validating / setErrors
 * @param {boolean} [options.scroll=true]     — scroll it into view
 * @param {Element|string} [options.loading]  — element covered by lkInnerLoading while submit() runs
 * @param {string}  [options.loadingText='Saving…']
 * @param {Object}  [options.fields]          — server key → component, for keys that differ from `component.name`
 * @returns {Object}
 */

import { lkInnerLoading } from './innerLoading.js';
import { extractFieldErrors, firstMessage } from '../helpers/validation.js';

function isValidateable(v) {
  return v != null && typeof v === 'object' && typeof v.validate === 'function';
}

function isSkipped(comp) {
  return comp.enabled === false || comp.disabled === true || comp.hidden === true;
}

export function lkValidation(...args) {
  const flat = args.flat(Infinity);
  const last = flat[flat.length - 1];
  const hasOptions = last != null && typeof last === 'object' && !isValidateable(last) && !Array.isArray(last);
  const options = {
    focusFirst: true,
    scroll: true,
    loading: null,
    loadingText: 'Saving…',
    fields: null,
    ...(hasOptions ? last : {}),
  };
  const members = new Set();
  let destroyed = false;
  let submitting = false;
  let loader = null;

  function add(...list) {
    list.flat(Infinity).forEach((c) => {
      if (!isValidateable(c)) throw new Error('Look.lkValidation: every item needs a validate() method (a validateable component).');
      members.add(c);
    });
    return api;
  }

  function remove(...list) {
    list.flat(Infinity).forEach((c) => members.delete(c));
    return api;
  }

  function collectErrors() {
    return Array.from(members)
      .filter((c) => c.hasError && !isSkipped(c))
      .map((c) => ({ component: c, message: c.error ?? null }));
  }

  // Scrolling is left to `scroll` alone: a plain focus() would jump the page even with scroll: false
  function focus(comp) {
    const target = comp.el;
    if (options.scroll && target?.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (typeof comp.focus === 'function') comp.focus({ preventScroll: true });
    else target?.focus?.({ preventScroll: true });
  }

  function result() {
    const errors = collectErrors();
    if (errors.length && options.focusFirst) focus(errors[0].component);
    return { hasError: errors.length > 0, valid: errors.length === 0, errors };
  }

  function active() {
    return Array.from(members).filter((c) => {
      if (!isSkipped(c)) return true;
      c.clearValidation?.();
      return false;
    });
  }

  function validate() {
    if (destroyed) return { hasError: false, valid: true, errors: [] };
    active().forEach((c) => c.validate());
    return result();
  }

  async function validateAsync() {
    if (destroyed) return { hasError: false, valid: true, errors: [] };
    await Promise.all(active().map((c) => (typeof c.validateAsync === 'function' ? c.validateAsync() : c.validate())));
    return result();
  }

  function clearValidation() {
    members.forEach((c) => c.clearValidation?.());
    return api;
  }

  function componentFor(key) {
    const mapped = options.fields?.[key];
    if (mapped) return mapped;
    return Array.from(members).find((c) => c.name === key || c.el?.id === key) || null;
  }

  /**
   * Show server messages on the matching components.
   * @param {Object} map — { key: 'message' | ['message', …] }, keys = component name (or `fields` alias / element id)
   * @returns {Array<{ key: string, message: string }>} entries no component matched
   */
  function setErrors(map) {
    const unmatched = [];
    let first = null;
    Object.entries(map || {}).forEach(([key, value]) => {
      const message = firstMessage(value);
      if (!message) return;
      const comp = componentFor(key);
      if (comp && typeof comp.setValidation === 'function') {
        comp.setValidation(message);
        if (!first) first = comp;
      } else {
        unmatched.push({ key, message });
      }
    });
    if (first && options.focusFirst) focus(first);
    return unmatched;
  }

  function setLoading(on) {
    if (!options.loading) return;
    if (!loader) loader = lkInnerLoading(options.loading, { open: false, text: options.loadingText });
    if (on) loader.show();
    else loader.hide();
  }

  /**
   * Validate (async rules included), then run `handler(form)`.
   * A rejection carrying field errors (`{ errors }`, lkDataSource errors, axios `response.data.errors`)
   * is mapped with setErrors().
   * @param {Function} handler — async (form) => any
   * @returns {Promise<{ ok: boolean, reason?: 'busy'|'invalid'|'error', result?: any, errors?: Array, unmatched?: Array, message?: string, error?: any }>}
   */
  async function submit(handler) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    if (submitting) return { ok: false, reason: 'busy' };
    submitting = true;
    try {
      const v = await validateAsync();
      if (v.hasError) return { ok: false, reason: 'invalid', errors: v.errors };
      setLoading(true);
      try {
        const out = await handler(api);
        return { ok: true, result: out };
      } catch (error) {
        const fieldErrors = extractFieldErrors(error);
        const unmatched = fieldErrors ? setErrors(fieldErrors) : [];
        const message = error?.message || error?.body?.message || error?.response?.data?.message
          || (unmatched.length ? unmatched.map((u) => u.message).join(' ') : null);
        return { ok: false, reason: 'error', error, errors: collectErrors(), unmatched, message };
      } finally {
        setLoading(false);
      }
    } finally {
      submitting = false;
    }
  }

  const api = {
    validate,
    validateAsync,
    clearValidation,
    setErrors,
    submit,
    add,
    remove,
    get components() { return Array.from(members); },
    get hasError() { return collectErrors().length > 0; },
    get errors() { return collectErrors(); },
    get submitting() { return submitting; },
    destroy() {
      destroyed = true;
      members.clear();
      loader?.destroy?.();
      loader = null;
    },
  };

  add(hasOptions ? flat.slice(0, -1) : flat);
  return api;
}
