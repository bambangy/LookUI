// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// lkClipboard — copy-to-clipboard trigger with feedback

import { resolveEl } from '../helpers/base.js';
import { guard } from '../helpers/guard.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { lkToast } from './toast.js';

lkI18n.define('clipboard', {
  copied: 'Copied',
  failed: 'Copy failed',
});

const isThenable = (r) => r != null && typeof r.then === 'function';

/** execCommand fallback for non-secure contexts / old browsers. */
function legacyCopy(text) {
  if (typeof document === 'undefined' || !document.body) return false;
  const prev = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = !!document.execCommand('copy');
  } catch { ok = false; }
  document.body.removeChild(ta);
  if (prev && typeof prev.focus === 'function') { try { prev.focus({ preventScroll: true }); } catch { /* gone */ } }
  return ok;
}

/**
 * Copy text: navigator.clipboard where available, execCommand otherwise.
 * @param {string} text
 * @returns {Promise<boolean>} true when copied
 */
function copyText(text) {
  const value = String(text == null ? '' : text);
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && (typeof isSecureContext === 'undefined' || isSecureContext)) {
    return navigator.clipboard.writeText(value).then(() => true, () => legacyCopy(value));
  }
  return Promise.resolve(legacyCopy(value));
}

/**
 * Read the clipboard text (needs permission and a secure context).
 * @returns {Promise<string|null>} null when unavailable or denied
 */
function readText() {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return Promise.resolve(null);
    return navigator.clipboard.readText().then((t) => (typeof t === 'string' ? t : null), () => null);
  } catch { return Promise.resolve(null); }
}

function sourceText(node) {
  if (!node) return null;
  if ('value' in node && typeof node.value === 'string') return node.value;
  return (node.textContent || '').trim();
}

/**
 * Turn an element into a "copy" button.
 *
 * @param {Element|string} el — the trigger (usually a button)
 * @param {Object} [opts]
 * @param {string|Function} [opts.text] — text to copy, or `() => string | Promise<string>`. (An object here is treated as per-instance text overrides, like `opts.labels`.)
 * @param {Element|string|Object} [opts.target] — element / selector whose value (inputs) or textContent is copied; an lk component with `.value` works too
 * @param {'tip'|'toast'|'none'} [opts.feedback='tip'] — "Copied" label next to the trigger, an lkToast, or nothing
 * @param {boolean|Object} [opts.toast] — shorthand for `feedback: 'toast'`; an object is passed to lkToast
 * @param {number} [opts.feedbackDuration=1500] — ms the label / `is-copied` state stay
 * @param {string} [opts.position='top'] — where the label shows: 'top' | 'bottom'
 * @param {Function} [opts.onCopy] — (text, { source: 'click'|'api', component })
 * @param {Function} [opts.onError] — (error, { source, component })
 * @param {Function} [opts.beforeCopy] — guard (text, { source, component }); false cancels, a string replaces the text (e.g. mask a secret), a Promise waits
 * @param {Object} [opts.labels] — per-instance texts ('copied', 'failed')
 * @returns {{ el: Element, copy: Function, text: Object, destroy: Function }}
 */
export function lkClipboard(el, opts = {}) {
  const node = resolveEl(el, 'lkClipboard');
  const options = { feedbackDuration: 1500, position: 'top', ...opts };
  const own = opts.labels || (opts.text && typeof opts.text === 'object' && typeof opts.text !== 'function' ? opts.text : undefined);
  const tx = bindText('clipboard', own, null);
  const comp = {};
  let destroyed = false;
  let liveEl = null;
  let tipEl = null;
  let tipTimer = 0;
  let stateTimer = 0;
  let toastRef = null;

  const mode = () => {
    if (options.feedback) return options.feedback;
    return options.toast ? 'toast' : 'tip';
  };

  function resolveText() {
    const t = options.text;
    if (typeof t === 'function') return t();
    if (typeof t === 'string') return t;
    if (options.target) {
      const tg = options.target;
      const n = typeof tg === 'string' ? document.querySelector(tg) : (tg && tg.el) || tg;
      if (n && n.nodeType === 1) return sourceText(n);
      if (tg && 'value' in tg) return String(tg.value == null ? '' : tg.value);
      return null;
    }
    return null;
  }

  function announce(message) {
    if (!liveEl) {
      liveEl = document.createElement('div');
      liveEl.className = 'lk-sr-only';
      liveEl.setAttribute('role', 'status');
      liveEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(liveEl);
    }
    liveEl.textContent = '';
    liveEl.textContent = message;
  }

  function removeTip() {
    clearTimeout(tipTimer);
    if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
    tipEl = null;
  }

  function showTip(message, isError) {
    removeTip();
    const tip = document.createElement('div');
    tip.className = `lk-clipboard-tip${isError ? ' lk-clipboard-tip--error' : ''}`;
    tip.setAttribute('aria-hidden', 'true');
    tip.textContent = message;
    const r = node.getBoundingClientRect();
    const below = options.position === 'bottom';
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${below ? r.bottom + 28 : r.top - 6}px`;
    document.body.appendChild(tip);
    tipEl = tip;
    requestAnimationFrame(() => { if (tipEl === tip) tip.classList.add('is-visible'); });
    tipTimer = setTimeout(() => {
      tip.classList.remove('is-visible');
      tipTimer = setTimeout(() => { if (tipEl === tip) removeTip(); }, 300);
    }, options.feedbackDuration);
  }

  function feedback(ok, error) {
    const message = ok ? tx.t('copied') : tx.t('failed');
    announce(message);
    node.classList.toggle('is-copied', ok);
    clearTimeout(stateTimer);
    if (ok) stateTimer = setTimeout(() => node.classList.remove('is-copied'), options.feedbackDuration);
    const m = mode();
    if (m === 'toast') {
      const base = options.toast && typeof options.toast === 'object' ? options.toast : {};
      toastRef = lkToast({ message, type: ok ? 'positive' : 'negative', duration: 1800, ...base });
    } else if (m !== 'none') {
      showTip(message, !ok);
    }
    return error;
  }

  async function perform(text, source) {
    let ok = false;
    let error = null;
    try { ok = await copyText(text); } catch (e) { error = e; }
    if (destroyed) return ok;
    if (!ok) {
      error = error || new Error('Look.lkClipboard: copy failed');
      feedback(false, error);
      if (typeof options.onError === 'function') options.onError(error, { source, component: comp });
      return false;
    }
    feedback(true);
    if (typeof options.onCopy === 'function') options.onCopy(text, { source, component: comp });
    return true;
  }

  function run(explicit, source) {
    return new Promise((resolve) => {
      const fail = (e) => {
        if (destroyed) { resolve(false); return; }
        feedback(false, e);
        if (typeof options.onError === 'function') options.onError(e, { source, component: comp });
        resolve(false);
      };
      let raw;
      try { raw = explicit !== undefined ? explicit : resolveText(); } catch (e) { fail(e); return; }
      Promise.resolve(raw).then((text) => {
        if (destroyed) { resolve(false); return; }
        if (text == null) { fail(new Error('Look.lkClipboard: nothing to copy')); return; }
        const r = guard(node, options, 'copy', String(text), { source, component: comp }, (t) => {
          perform(String(t), source).then(resolve);
        });
        if (r === false) resolve(false);
        else if (isThenable(r)) r.then((ok) => { if (ok === false) resolve(false); });
      }, fail);
    });
  }

  const onClick = (e) => {
    if (node.disabled || node.getAttribute('aria-disabled') === 'true') return;
    if (node.tagName === 'A') e.preventDefault();
    run(undefined, 'click');
  };
  node.addEventListener('click', onClick);

  Object.defineProperties(comp, {
    el: { value: node, enumerable: true },
    text: { get: () => tx.get(), set: (v) => tx.set(v), enumerable: true },
  });
  /**
   * Copy now. Goes through `beforeCopy` and fires `onCopy` with source 'api'.
   * @param {string} [text] — defaults to the configured source
   * @returns {Promise<boolean>}
   */
  comp.copy = (text) => run(text, 'api');
  comp.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    node.removeEventListener('click', onClick);
    clearTimeout(stateTimer);
    node.classList.remove('is-copied');
    if (!node.getAttribute('class')) node.removeAttribute('class');
    removeTip();
    if (liveEl && liveEl.parentNode) liveEl.parentNode.removeChild(liveEl);
    liveEl = null;
    if (toastRef && typeof toastRef.close === 'function') { try { toastRef.close('destroy'); } catch { /* already gone */ } }
    tx.destroy();
  };
  return comp;
}

/** Static: copy text without a trigger. @param {string} text @returns {Promise<boolean>} */
lkClipboard.copy = copyText;
/** Static: read the clipboard (permission aware). @returns {Promise<string|null>} */
lkClipboard.read = readText;
