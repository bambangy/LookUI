// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Base widget mixin — shared imperative properties for all components

import { qs } from '../core/index.js';
import { registerInstance, unregisterInstance } from './registry.js';

/**
 * Resolve an element reference from a selector string or Element.
 * @param {Element|string} el
 * @param {string} caller — name for error messages
 * @returns {Element}
 */
export function resolveEl(el, caller) {
  const node = typeof el === 'string' ? qs(el) : el;
  if (!node) throw new Error(`Look.${caller}: element not found — "${el}"`);
  return node;
}

/**
 * Apply base widget properties onto a component object.
 * Mutates `target` in place and returns it.
 *
 * Provides: el, id (get/set), hidden (get/set), enabled (get/set)
 *
 * @param {Object} target — the component object to enhance
 * @param {Element} node  — the underlying DOM element
 * @param {Object}  [opts] — optional overrides
 * @param {Element} [opts.hiddenTarget] — element to toggle lk-hidden on (default: node)
 * @returns {Object} target with base properties defined
 */
export function applyBase(target, node, opts) {
  const hiddenTarget = opts?.hiddenTarget || node;

  // Auto-dispose (Feature.md F-03): track the instance against its root element so
  // Look.autoDispose(true) / disposeAll() / disposeWithin() can destroy() it later.
  // `destroy` is an accessor so the factory's own `comp.destroy = fn` (assigned after
  // this call) still works transparently — the setter wraps it with unregistration.
  let userDestroy = null;
  let destroyed = false;
  registerInstance(node, target);
  const wrappedDestroy = function (...args) {
    if (destroyed) return undefined;
    destroyed = true;
    unregisterInstance(node, target);
    return userDestroy?.apply(this, args);
  };

  // Configurable so composite components can specialize them (e.g. enabled toggling inner controls)
  Object.defineProperties(target, {
    el: { value: node, enumerable: true },

    destroy: {
      get() { return userDestroy ? wrappedDestroy : undefined; },
      set(fn) { userDestroy = fn; },
      enumerable: true,
      configurable: true,
    },

    id: {
      get() { return node.id; },
      set(v) { node.id = v; },
      enumerable: true,
      configurable: true,
    },

    hidden: {
      get() { return hiddenTarget.classList.contains('lk-hidden'); },
      set(v) {
        if (v) hiddenTarget.classList.add('lk-hidden');
        else hiddenTarget.classList.remove('lk-hidden');
      },
      enumerable: true,
      configurable: true,
    },

    enabled: {
      get() { return !node.disabled && !node.classList.contains('lk-disabled'); },
      set(v) {
        if (v) {
          node.removeAttribute('disabled');
          node.classList.remove('lk-disabled');
          node.removeAttribute('aria-disabled');
        } else {
          node.setAttribute('disabled', '');
          node.classList.add('lk-disabled');
          node.setAttribute('aria-disabled', 'true');
        }
      },
      enumerable: true,
      configurable: true,
    },
  });

  return target;
}

const warned = new Set();

/**
 * Warn once per page about a deprecated API.
 * @param {string} key — unique id, e.g. 'lkPagination.onPageChange'
 * @param {string} message
 */
export function deprecate(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`Look: ${message} (deprecated, will be removed in a future major version)`);
}

/**
 * Read a callback option that was renamed: returns `opts[name]`, or the old option
 * (with a one-time deprecation warning) when only that one is given.
 * @param {Object} opts
 * @param {string} name     — current option name
 * @param {string} oldName  — deprecated option name
 * @param {string} caller   — factory name for the message
 * @returns {*}
 */
export function renamedOption(opts, name, oldName, caller) {
  if (opts[name] != null || opts[oldName] == null) return opts[name];
  deprecate(`${caller}.${oldName}`, `${caller}: option "${oldName}" is now "${name}"`);
  return opts[oldName];
}
