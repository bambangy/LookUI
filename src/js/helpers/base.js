// Base widget mixin — shared imperative properties for all components

import { qs } from '../core/index.js';

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
 * @returns {Object} target with base properties defined
 */
export function applyBase(target, node) {
  Object.defineProperties(target, {
    el: { value: node, enumerable: true },

    id: {
      get() { return node.id; },
      set(v) { node.id = v; },
      enumerable: true,
    },

    hidden: {
      get() { return node.classList.contains('lk-hidden'); },
      set(v) {
        if (v) node.classList.add('lk-hidden');
        else node.classList.remove('lk-hidden');
      },
      enumerable: true,
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
    },
  });

  return target;
}
