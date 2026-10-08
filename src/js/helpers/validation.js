// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Field validation — shared by every validateable component (textbox, dropdown,
// checkbox, radio, switch, phone, textpop).
//
// A rule is one of:
//   (value, component) => true | string | false     — string = error message
//   'required' | 'email'                              — shorthand
//   { required, email, min, max, minLength, maxLength, pattern, message }
// Rules run in order; the first message wins. Only `required` checks empty values:
// every other rule passes while the field is empty.
//
// Async rules: a function rule may return a Promise of the same (true | 'message').
// Its result is cached per value, re-checks while typing are debounced, and a result
// that arrives after a newer validation (or a value change) is dropped.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmptyValue(v) {
  return v == null || v === '' || v === false
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'number' && Number.isNaN(v));
}

function lengthOf(v) {
  return Array.isArray(v) ? v.length : String(v ?? '').length;
}

/**
 * Turn a rule declaration into a function `(value, comp) => true | string`.
 * @param {Function|string|Object} rule
 * @param {{ label: Function, requiredMessage?: Function }} ctx
 * @returns {Function}
 */
export function compileRule(rule, ctx) {
  if (typeof rule === 'function') return rule;
  const spec = typeof rule === 'string' ? { [rule]: true } : rule;
  if (!spec || typeof spec !== 'object') return () => true;

  const label = () => ctx.label() || 'This field';
  const msg = (fallback) => spec.message || fallback;

  return (value) => {
    const empty = isEmptyValue(value);
    if (spec.required && empty) return msg(ctx.requiredMessage?.() || `${label()} is required`);
    if (empty) return true;
    if (spec.email && !EMAIL.test(String(value))) return msg('Enter a valid email address');
    if (spec.min != null && Number(value) < spec.min) return msg(`${label()} must be at least ${spec.min}`);
    if (spec.max != null && Number(value) > spec.max) return msg(`${label()} must be at most ${spec.max}`);
    if (spec.minLength != null && lengthOf(value) < spec.minLength) {
      return msg(Array.isArray(value) ? `Select at least ${spec.minLength}` : `${label()} must be at least ${spec.minLength} characters`);
    }
    if (spec.maxLength != null && lengthOf(value) > spec.maxLength) {
      return msg(Array.isArray(value) ? `Select at most ${spec.maxLength}` : `${label()} must be at most ${spec.maxLength} characters`);
    }
    if (spec.pattern) {
      const re = spec.pattern instanceof RegExp ? spec.pattern : new RegExp(spec.pattern);
      re.lastIndex = 0;
      if (!re.test(String(value))) return msg(`${label()} is not valid`);
    }
    return true;
  };
}

/** First message from a server value: 'msg' | ['msg', …] | { message }. */
export function firstMessage(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? firstMessage(v[0]) : null;
  if (typeof v === 'object') return v.message != null ? String(v.message) : null;
  return String(v);
}

/**
 * Field errors carried by a failed request, whatever wraps them:
 * `{ errors }` thrown/returned bodies, lkDataSource errors (`err.errors` / `err.body.errors`),
 * axios-style `err.response.data.errors`.
 * @returns {Object|null} — { fieldName: message | message[] }
 */
export function extractFieldErrors(err) {
  const isMap = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
  const candidates = [err?.errors, err?.body?.errors, err?.data?.errors, err?.response?.data?.errors];
  return candidates.find(isMap) || null;
}

const STALE = Symbol('stale');

function toList(rules) {
  if (rules == null) return [];
  return Array.isArray(rules) ? rules.slice() : [rules];
}

/**
 * Add validation to a component object.
 *
 * Adds: validate(), setValidation(message), clearValidation(),
 *       rules (get/set), error, hasError, validateOnBlur (get/set)
 *
 * After the first validate() / setValidation() the field is "touched" and re-checks
 * itself whenever the user changes the value; clearValidation() resets it.
 *
 * @param {Object} comp
 * @param {Object} cfg
 * @param {Object}   cfg.opts            — component options (`rules`, `validate` / `validateOnBlur`)
 * @param {Function} cfg.getValue
 * @param {Function} cfg.label           — () => current label text
 * @param {Function} cfg.required        — () => boolean (the component's required flag)
 * @param {Function} cfg.roots           — () => Element[] that count as "inside" (trigger, floating panels)
 * @param {Function} cfg.setError        — (message) => void
 * @param {Function} cfg.clearError      — () => void
 * @param {Element[]} [cfg.changeTargets] — native inputs whose input/change events mean "value changed"
 * @param {Function} [cfg.isOpen]        — () => boolean; blur is ignored while a picker is open
 * @param {Function} [cfg.requiredMessage] — default message for the required rule
 * @param {Function[]} [cfg.builtinRules] — rules the component always applies (e.g. phone format)
 * @param {Function} [cfg.labels]        — () => label Elements; a `required` rule gives them the asterisk
 * @returns {{ changed: Function, destroy: Function }}
 *
 * Also reads `opts.validateDebounce` (ms, default 400): delay before async rules re-run while the user edits.
 */
export function attachValidation(comp, cfg) {
  let rules = toList(cfg.opts.rules);
  let validateOnBlur = !!(cfg.opts.validate ?? cfg.opts.validateOnBlur);
  const debounceMs = Number.isFinite(cfg.opts.validateDebounce) ? cfg.opts.validateDebounce : 400;
  let message = null;
  let touched = false;
  let blurTimer = null;
  let debounceTimer = null;
  let validating = false;
  let seq = 0;                  // bumps on every validation; older async results are dropped
  let latest = Promise.resolve(true);
  let releaseDeferred = null;   // resolver of a debounced run that a newer one replaced
  const asyncCache = new Map(); // rule fn -> Map(value key -> result), newest last
  const CACHE_SIZE = 20;
  function cached(fn, key) {
    const m = asyncCache.get(fn);
    return m && m.has(key) ? { result: m.get(key) } : null;
  }
  function remember(fn, key, result) {
    let m = asyncCache.get(fn);
    if (!m) asyncCache.set(fn, (m = new Map()));
    m.delete(key);
    m.set(key, result);
    if (m.size > CACHE_SIZE) m.delete(m.keys().next().value);
  }
  const knownAsync = new WeakSet();
  const ctx = { label: cfg.label, requiredMessage: cfg.requiredMessage };
  const requiredRule = compileRule({ required: true }, ctx);
  let compiled = rules.map((r) => compileRule(r, ctx));

  function declaresRequired() {
    return rules.some((r) => r === 'required' || (r && typeof r === 'object' && r.required));
  }

  // A `required` rule marks the labels like the `required` option does
  let markedByRules = false;
  function syncRequiredMark() {
    if (!cfg.labels) return;
    const want = declaresRequired();
    if (want === markedByRules) return;
    markedByRules = want;
    cfg.labels().forEach((l) => l.classList.toggle('lk-label--required', want || cfg.required()));
  }

  function ruleList() {
    // The component's `required` flag is a rule too, unless a rule already covers it
    const list = cfg.required() && !declaresRequired() ? [requiredRule] : [];
    return list.concat(compiled, cfg.builtinRules || []);
  }

  function keyOf(value) {
    try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
  }

  function outcome(r) {
    if (r === true || r == null) return null;
    return typeof r === 'string' && r ? r : 'Invalid value';
  }

  function call(fn, value) {
    try {
      return fn(value, comp);
    } catch (err) {
      return err?.message || 'Invalid value';
    }
  }

  function isThenable(r) {
    return r != null && typeof r.then === 'function';
  }

  // Sync pass: sync rules run, async rules use their cached result for this value or are
  // queued (started now, or — with `defer` — left for the debounced pass).
  function runSync(value, key, defer) {
    const waiting = [];
    for (const fn of ruleList()) {
      const hit = cached(fn, key);
      if (hit) {
        const m = outcome(hit.result);
        if (m) return { message: m, waiting };
        continue;
      }
      if (defer && knownAsync.has(fn)) {
        waiting.push({ fn });
        continue;
      }
      const r = call(fn, value);
      if (isThenable(r)) {
        knownAsync.add(fn);
        waiting.push({ fn, promise: r });
        continue;
      }
      const m = outcome(r);
      if (m) return { message: m, waiting };
    }
    return { message: null, waiting };
  }

  // Async pass, in rule order; the first message wins
  async function settle(entries, value, key, mySeq) {
    for (const entry of entries) {
      let r = entry.promise ?? call(entry.fn, value);
      if (isThenable(r)) {
        try { r = await r; } catch (err) { r = err?.message || 'Invalid value'; }
      }
      remember(entry.fn, key, r);
      if (mySeq !== seq) return STALE;
      const m = outcome(r);
      if (m) return m;
    }
    return null;
  }

  function setBusy(on) {
    if (validating === on) return;
    validating = on;
    comp.el?.closest?.('.lk-field')?.classList.toggle('lk-field--validating', on);
    if (on) comp.el?.setAttribute?.('aria-busy', 'true');
    else comp.el?.removeAttribute?.('aria-busy');
  }

  function apply(msg) {
    message = msg || null;
    if (message) cfg.setError(message);
    else cfg.clearError();
  }

  // Cancel pending async work; a debounced run still waiting resolves with whatever replaces it
  function interrupt() {
    seq += 1;
    clearTimeout(debounceTimer);
    setBusy(false);
    const release = releaseDeferred;
    releaseDeferred = null;
    return release;
  }

  function evaluate(defer) {
    const release = interrupt();
    const mySeq = seq;
    const value = cfg.getValue();
    const key = keyOf(value);
    const { message: m, waiting } = runSync(value, key, defer);
    apply(m);

    let promise = Promise.resolve(!m);
    if (!m && waiting.length) {
      setBusy(true);
      promise = new Promise((resolve) => {
        const go = () => {
          releaseDeferred = null;
          settle(waiting, value, key, mySeq).then((res) => {
            if (res === STALE) { resolve(latest); return; }
            setBusy(false);
            apply(res);
            resolve(!res);
          });
        };
        if (defer) {
          releaseDeferred = (next) => resolve(next);
          debounceTimer = setTimeout(go, debounceMs);
        } else {
          go();
        }
      });
    }
    latest = promise;
    if (release) release(latest);
    return { valid: !m, promise };
  }

  /** Sync rules + cached async results; uncached async rules finish in the background. */
  function validate() {
    touched = true;
    return evaluate(false).valid;
  }

  /** Every rule, async ones awaited. */
  function validateAsync() {
    touched = true;
    return evaluate(false).promise;
  }

  function setValidation(msg) {
    if (msg == null || msg === '' || msg === false) {
      clearValidation();
      return comp;
    }
    const release = interrupt();
    touched = true;
    apply(String(msg));
    latest = Promise.resolve(false);
    if (release) release(latest);
    return comp;
  }

  function clearValidation() {
    const release = interrupt();
    touched = false;
    apply(null);
    latest = Promise.resolve(true);
    if (release) release(latest);
    return comp;
  }

  // User changed the value: a touched field re-checks itself (a server message set with
  // setValidation() is replaced by the local result). Async rules are debounced.
  function changed() {
    if (touched) evaluate(true);
  }

  function onFocusOut(e) {
    if (!validateOnBlur) return;
    const roots = cfg.roots().filter(Boolean);
    if (!roots.some((r) => r.contains(e.target))) return;
    clearTimeout(blurTimer);
    // Wait for focus to land: moving into the component's own panel is not a blur
    blurTimer = setTimeout(() => {
      if (cfg.isOpen?.()) return;
      const active = document.activeElement;
      if (active && roots.some((r) => r.contains(active))) return;
      validate();
    }, 0);
  }

  const targets = cfg.changeTargets || [];
  targets.forEach((t) => {
    t.addEventListener('input', changed);
    t.addEventListener('change', changed);
  });
  document.addEventListener('focusout', onFocusOut, true);

  Object.defineProperties(comp, {
    rules: {
      get() { return rules.slice(); },
      set(v) {
        rules = toList(v);
        compiled = rules.map((r) => compileRule(r, ctx));
        asyncCache.clear();
        syncRequiredMark();
      },
      enumerable: true,
      configurable: true,
    },
    error: { get() { return message; }, enumerable: true, configurable: true },
    validating: { get() { return validating; }, enumerable: true, configurable: true },
    hasError: { get() { return !!message; }, enumerable: true, configurable: true },
    validateOnBlur: {
      get() { return validateOnBlur; },
      set(v) { validateOnBlur = !!v; },
      enumerable: true,
      configurable: true,
    },
  });

  syncRequiredMark();

  comp.validate = validate;
  comp.validateAsync = validateAsync;
  comp.setValidation = setValidation;
  comp.clearValidation = clearValidation;

  return {
    changed,
    destroy() {
      interrupt();
      clearTimeout(blurTimer);
      targets.forEach((t) => {
        t.removeEventListener('input', changed);
        t.removeEventListener('change', changed);
      });
      document.removeEventListener('focusout', onFocusOut, true);
    },
  };
}
