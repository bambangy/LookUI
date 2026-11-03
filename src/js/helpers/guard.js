// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Overridable events — the `before<Action>` guards every component / composable offers.
//
// For a user-driven action the library asks first:
//   1. option callback   before<Action>(payload, { source, component, … })   (no payload: before<Action>({ source, component, … }))
//   2. DOM event         'lk:before-<action>' (cancelable, bubbles) dispatched on the component's element,
//                        detail = { payload, source, component, … }
// Either one can take over:
//   • return false (callback) / event.preventDefault() (DOM)  → the action is cancelled
//   • return a Promise                                          → the action waits; resolves false → cancelled
//   • return another value (callback) / set event.detail.payload → that value replaces the payload,
//     for actions that carry one (new value, file list, …)
//   • undefined / true / null                                   → go ahead unchanged
//
// The after-the-fact notification stays on(Action) (onChange, onClose, …) and only fires for actions that went through.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const isThenable = (r) => r != null && typeof r.then === 'function';

/**
 * Run the guard for `name` and, when allowed, call `proceed(payload)`.
 *
 * @param {Element|null} el — element the DOM event is dispatched on (null: callback only)
 * @param {Object} opts — the component options (reads `before<Name>`)
 * @param {string} name — action name in camelCase: 'change', 'close', 'remove', …
 * @param {*} payload — what is about to happen (new value, files, …); may be undefined
 * @param {Object} ctx — { source, component, … } passed to the callback and put on event.detail
 * @param {Function} proceed — (payload) => void, runs when not cancelled (possibly later for async guards)
 * @returns {boolean|Promise<boolean>} true = proceeded now, false = cancelled now, Promise = decided later
 */
export function guard(el, opts, name, payload, ctx, proceed) {
  const hook = opts && opts[`before${cap(name)}`];

  const finish = (next) => {
    if (next === false) return false;
    const value = next === undefined || next === true || next === null ? payload : next;

    if (el && typeof CustomEvent === 'function' && typeof el.dispatchEvent === 'function') {
      const detail = { ...ctx, payload: value };
      const ev = new CustomEvent(`lk:before-${kebab(name)}`, { bubbles: true, cancelable: true, detail });
      el.dispatchEvent(ev);
      if (ev.defaultPrevented) return false;
      proceed(detail.payload);
      return true;
    }
    proceed(value);
    return true;
  };

  let result;
  if (typeof hook === 'function') {
    try {
      result = payload === undefined ? hook(ctx) : hook(payload, ctx);
    } catch (err) {
      // A throwing guard must not leave the UI half-way: treat it as a veto and surface the error
      // eslint-disable-next-line no-console
      console.error(`Look: before${cap(name)} threw`, err);
      return false;
    }
  }

  if (isThenable(result)) {
    return result.then(finish, (err) => {
      // eslint-disable-next-line no-console
      console.error(`Look: before${cap(name)} rejected`, err);
      return false;
    });
  }
  return finish(result);
}

/**
 * Synchronous variant for code that must know the answer immediately (e.g. reverting a native
 * checkbox). Async guards are not supported here: a Promise result counts as "allowed" and is ignored.
 * @returns {{ allowed: boolean, payload: * }}
 */
export function guardSync(el, opts, name, payload, ctx) {
  let out = { allowed: false, payload };
  const hook = opts && opts[`before${cap(name)}`];
  let result;
  if (typeof hook === 'function') {
    try { result = payload === undefined ? hook(ctx) : hook(payload, ctx); } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Look: before${cap(name)} threw`, err);
      return out;
    }
  }
  if (result === false) return out;
  const value = isThenable(result) || result === undefined || result === true || result === null ? payload : result;
  if (el && typeof CustomEvent === 'function' && typeof el.dispatchEvent === 'function') {
    const detail = { ...ctx, payload: value };
    const ev = new CustomEvent(`lk:before-${kebab(name)}`, { bubbles: true, cancelable: true, detail });
    el.dispatchEvent(ev);
    if (ev.defaultPrevented) return out;
    out = { allowed: true, payload: detail.payload };
  } else {
    out = { allowed: true, payload: value };
  }
  return out;
}
