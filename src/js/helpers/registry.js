// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Auto-dispose registry (Feature.md F-03) — tracks element-bound component instances
// (registered by applyBase) so they can be destroyed automatically once their root
// element is removed from the DOM, instead of leaking when a page swaps markup via AJAX.

// Element -> Set<component>. A plain Map (not WeakMap) on purpose: entries exist only
// for instances that have NOT been destroyed yet, so it stays bounded by live components —
// the same set disposeAll()/the unload warning need to be able to enumerate.
const registry = new Map();
let enabled = false;
let observer = null;

export function registerInstance(node, comp) {
  if (!node) return;
  let set = registry.get(node);
  if (!set) registry.set(node, set = new Set());
  set.add(comp);
}

export function unregisterInstance(node, comp) {
  if (!node) return;
  const set = registry.get(node);
  if (!set) return;
  set.delete(comp);
  if (!set.size) registry.delete(node);
}

function instancesIn(root) {
  const found = [];
  const own = registry.get(root);
  if (own) found.push(...own);
  if (typeof root.querySelectorAll === 'function') {
    root.querySelectorAll('*').forEach((el) => {
      const set = registry.get(el);
      if (set) found.push(...set);
    });
  }
  return found;
}

function destroySafely(comp) {
  try {
    comp.destroy?.();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Look: error auto-disposing a component', err);
  }
}

function onMutations(mutations) {
  mutations.forEach((m) => {
    m.removedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      instancesIn(node).forEach(destroySafely);
    });
  });
}

/**
 * Toggle global auto-dispose (Feature.md F-03): when enabled, a component registered via
 * applyBase is destroyed automatically as soon as its root element is removed from the DOM
 * (e.g. a container's innerHTML is replaced after an AJAX reload).
 * @param {boolean} [on=true]
 * @returns {boolean} the resulting enabled state
 */
export function autoDispose(on = true) {
  enabled = !!on;
  if (enabled && !observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } else if (!enabled && observer) {
    observer.disconnect();
    observer = null;
  }
  return enabled;
}

/** Destroy every currently tracked, not-yet-destroyed component instance. */
export function disposeAll() {
  const all = [];
  registry.forEach((set) => all.push(...set));
  all.forEach(destroySafely);
}

/**
 * Destroy every tracked instance rooted at `target` or one of its descendants.
 * @param {Element|string} target — element or selector
 */
export function disposeWithin(target) {
  const root = typeof target === 'string' ? document.querySelector(target) : target;
  if (!root) return;
  instancesIn(root).forEach(destroySafely);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (registry.size) {
      // eslint-disable-next-line no-console
      console.warn(`Look: ${registry.size} component root(s) were never destroy()ed — call destroy() or Look.autoDispose(true).`);
    }
  });
}
