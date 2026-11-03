// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Look.state (Feature.md F-01) — a lightweight reactive state container for sharing data
// between components/pages without wiring up a bespoke event bus by hand.
//
//   Look.state.set('cart', [...]);
//   Look.state.get('cart');
//   Look.state.subscribe('cart', (next, prev) => {});
//   Look.state.patch('user', { name: 'Budi' });
//   Look.state.reset();

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    Object.keys(value).forEach((k) => { out[k] = cloneValue(value[k]); });
    return out;
  }
  return value;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && value.constructor === Object;
}

/**
 * Create an independent reactive state container. `Look.state` is one default instance;
 * call this to get an isolated one (e.g. one per page/module — "namespace" below is the
 * same idea scoped as a named child of an existing container).
 * @param {Object} [initial={}] — initial key/value pairs
 * @returns {Object}
 */
export function createState(initial = {}) {
  const store = { ...initial };
  const initialSnapshot = cloneValue(store);
  const keyListeners = new Map(); // key -> Set<(next, prev, key) => void>
  const wildcardListeners = new Set(); // (key, next, prev) => void
  const namespaces = new Map();

  function notify(key, next, prev) {
    keyListeners.get(key)?.forEach((fn) => fn(next, prev, key));
    wildcardListeners.forEach((fn) => fn(key, next, prev));
  }

  // Proxy (Feature.md: "Reactive ringan pakai Proxy"): `state.data.cart = [...]` is the same
  // write as `state.set('cart', ...)` — both go through this trap, so either style notifies.
  const data = new Proxy(store, {
    set(target, key, value) {
      const prev = target[key];
      target[key] = value;
      if (prev !== value) notify(key, value, prev);
      return true;
    },
    deleteProperty(target, key) {
      const had = Object.prototype.hasOwnProperty.call(target, key);
      const prev = target[key];
      delete target[key];
      if (had) notify(key, undefined, prev);
      return true;
    },
  });

  function get(key) {
    if (key === undefined) return { ...store };
    return store[key];
  }

  function set(key, value) {
    data[key] = value;
    return api;
  }

  /**
   * Shallow-merge `partial` into the object at `key` (or pass a function for a functional
   * update, mirroring `lkDataSource.update(target, patch)`). Non-object values are replaced.
   */
  function patch(key, partial) {
    const current = store[key];
    const next = typeof partial === 'function'
      ? partial(cloneValue(current))
      : (isPlainObject(current) && isPlainObject(partial) ? { ...current, ...partial } : partial);
    return set(key, next);
  }

  /**
   * `subscribe(key, handler)` — (next, prev) for one key.
   * `subscribe(handler)` — (key, next, prev) for every key.
   * @returns {Function} unsubscribe
   */
  function subscribe(key, handler) {
    if (typeof key === 'function') {
      wildcardListeners.add(key);
      return () => wildcardListeners.delete(key);
    }
    let set_ = keyListeners.get(key);
    if (!set_) keyListeners.set(key, set_ = new Set());
    set_.add(handler);
    return () => set_.delete(handler);
  }

  function applySnapshot(target) {
    Object.keys(store).forEach((k) => { if (!(k in target)) delete data[k]; });
    Object.keys(target).forEach((k) => set(k, cloneValue(target[k])));
    return api;
  }

  /** Reset one key (or, with no argument, the whole container) back to its initial value. */
  function reset(key) {
    if (key === undefined) return applySnapshot(initialSnapshot);
    if (Object.prototype.hasOwnProperty.call(initialSnapshot, key)) set(key, cloneValue(initialSnapshot[key]));
    else delete data[key];
    return api;
  }

  /** Deep-clone the current state — pair with `restore()` (e.g. around a cancellable form wizard). */
  function snapshot() {
    return cloneValue(store);
  }

  function restore(snap) {
    return applySnapshot(snap || {});
  }

  /** A named child container, created on first access, isolated from its parent's keys. */
  function namespace(name) {
    let ns = namespaces.get(name);
    if (!ns) namespaces.set(name, ns = createState());
    return ns;
  }

  /**
   * Mirror an `lkDataSource` into one state key, kept live (Feature.md: "lkDataSource bisa
   * jadi bagian state"). The key holds the data source's snapshot (`{ items, view, total, … }`)
   * and updates on every `change` event.
   * @returns {Function} unsubscribe
   */
  function bindDataSource(key, ds) {
    return ds.subscribe((snap) => set(key, snap));
  }

  const api = {
    data,
    get,
    set,
    patch,
    subscribe,
    reset,
    snapshot,
    restore,
    namespace,
    bindDataSource,
    toJSON: get,
  };

  return api;
}

/** The default shared state container: `Look.state.set(...)` / `Look.state.get(...)`. */
export const state = createState();
