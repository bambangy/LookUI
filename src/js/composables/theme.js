// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// lkTheme — light / dark / system theming

import { guard } from '../helpers/guard.js';

const DEFAULT_MODES = ['light', 'dark', 'system'];

function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode / blocked */ }
}

/**
 * Light / dark / system theming. Sets the RESOLVED theme ('light' | 'dark') as an attribute on the
 * target (default `<html data-theme="…">`) and the matching `color-scheme`, which the built-in dark
 * tokens (`:root[data-theme="dark"]`) react to.
 *
 * @param {Object} [opts]
 * @param {string} [opts.attribute='data-theme']
 * @param {Element|string} [opts.target=document.documentElement]
 * @param {string} [opts.default='system'] — mode used when nothing is stored
 * @param {string} [opts.storageKey='lk-theme'] — localStorage key
 * @param {boolean} [opts.persist=true] — `false` disables storing (and cross-tab sync)
 * @param {string[]} [opts.modes=['light','dark','system']] — modes `cycle()` goes through
 * @param {Function} [opts.onChange] — (mode, { source: 'user'|'system'|'api', resolved, component }); 'system' = OS preference or another tab changed it
 * @param {Function} [opts.beforeChange] — guard (mode, { source, resolved, component }); false cancels, a mode string replaces
 * @returns {{ mode: string, resolved: string, set: Function, toggle: Function, cycle: Function, destroy: Function }}
 */
export function lkTheme(opts = {}) {
  const options = {
    attribute: 'data-theme', default: 'system', storageKey: 'lk-theme', persist: true, modes: DEFAULT_MODES, ...opts,
  };
  const target = typeof options.target === 'string' ? document.querySelector(options.target) : options.target || document.documentElement;
  if (!target) throw new Error('Look.lkTheme: target not found');
  const modes = options.modes && options.modes.length ? options.modes.slice() : DEFAULT_MODES;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const comp = {};
  const prev = { attr: target.getAttribute(options.attribute), scheme: target.style.colorScheme };
  let destroyed = false;
  let mode;
  let resolved;

  const valid = (m) => modes.includes(m) || m === 'light' || m === 'dark' || m === 'system';
  const resolve = (m) => (m === 'system' ? (mq && mq.matches ? 'dark' : 'light') : m);

  function apply() {
    resolved = resolve(mode);
    target.setAttribute(options.attribute, resolved);
    target.style.colorScheme = resolved;
  }

  function commit(next, source, persist) {
    const before = { mode, resolved };
    mode = next;
    apply();
    if (persist && options.persist) writeStore(options.storageKey, mode);
    if (before.mode === mode && before.resolved === resolved) return;
    target.dispatchEvent(new CustomEvent('lk:theme-change', { bubbles: true, detail: { mode, resolved, source } }));
    if (typeof options.onChange === 'function') options.onChange(mode, { source, resolved, component: comp });
  }

  const stored = options.persist ? readStore(options.storageKey) : null;
  mode = stored && valid(stored) ? stored : valid(options.default) ? options.default : 'system';
  apply();

  function set(next, source = 'api') {
    if (destroyed) return Promise.resolve(false);
    if (!valid(next)) throw new Error(`Look.lkTheme: unknown mode "${next}"`);
    if (next === mode) return Promise.resolve(false);
    return new Promise((resolve2) => {
      const r = guard(target, options, 'change', next, { source, resolved: resolve(next), component: comp }, (m) => {
        if (destroyed) { resolve2(false); return; }
        commit(valid(m) ? m : next, source, true);
        resolve2(true);
      });
      if (r === false) resolve2(false);
      else if (r && typeof r.then === 'function') r.then((ok) => { if (ok === false) resolve2(false); });
    });
  }

  const onSystem = () => { if (!destroyed && mode === 'system') commit('system', 'system', false); };
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onSystem);
    else if (mq.addListener) mq.addListener(onSystem);
  }

  const onStorage = (e) => {
    if (destroyed || !options.persist || e.key !== options.storageKey) return;
    const next = e.newValue && valid(e.newValue) ? e.newValue : options.default;
    if (next !== mode) commit(next, 'system', false);
  };
  window.addEventListener('storage', onStorage);

  Object.defineProperties(comp, {
    mode: {
      get: () => mode,
      set: (v) => {   // silent by convention: no guard, no onChange
        if (!valid(v) || v === mode) return;
        mode = v;
        apply();
        if (options.persist) writeStore(options.storageKey, mode);
      },
      enumerable: true,
    },
    resolved: { get: () => resolved, enumerable: true },
    modes: { value: modes, enumerable: true },
    el: { value: target, enumerable: true },
  });
  /** Choose a mode. Guarded; `source` is reported to onChange ('api' by default). @returns {Promise<boolean>} */
  comp.set = set;
  /** Flip light <-> dark based on what is currently shown (leaves 'system'). @returns {Promise<boolean>} */
  comp.toggle = (source = 'user') => set(resolved === 'dark' ? 'light' : 'dark', source);
  /** Next mode of `modes`. @returns {Promise<boolean>} */
  comp.cycle = (source = 'user') => set(modes[(modes.indexOf(mode) + 1) % modes.length], source);
  comp.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (mq) {
      if (mq.removeEventListener) mq.removeEventListener('change', onSystem);
      else if (mq.removeListener) mq.removeListener(onSystem);
    }
    window.removeEventListener('storage', onStorage);
    if (prev.attr == null) target.removeAttribute(options.attribute); else target.setAttribute(options.attribute, prev.attr);
    target.style.colorScheme = prev.scheme;
    if (!target.getAttribute('style')) target.removeAttribute('style');
  };
  return comp;
}

/**
 * The tiny script to inline in `<head>` so the stored theme is applied before first paint (no flash).
 * @param {{ attribute?: string, storageKey?: string, default?: string }} [o]
 * @returns {string} JavaScript source (without the <script> tags)
 */
lkTheme.inlineScript = (o = {}) => {
  const a = o.attribute || 'data-theme';
  const k = o.storageKey || 'lk-theme';
  const d = o.default || 'system';
  return `(function(){try{var m=localStorage.getItem(${JSON.stringify(k)})||${JSON.stringify(d)};`
    + `var r=m==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;`
    + `var e=document.documentElement;e.setAttribute(${JSON.stringify(a)},r);e.style.colorScheme=r;}catch(e){}})();`;
};
