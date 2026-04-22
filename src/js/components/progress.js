// Progress component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs } from '../core/index.js';

/**
 * Enhance a progress bar with imperative value control.
 * @param {Element|string} el — .lk-progress container
 * @param {Object} [opts]
 * @param {number}  [opts.value]         — initial value (default 0)
 * @param {number}  [opts.max]           — max value (default 100)
 * @param {boolean} [opts.indeterminate] — indeterminate loading state
 * @returns {Object}
 */
export function lkProgress(el, opts = {}) {
  const node = resolveEl(el, 'lkProgress');
  node.classList.add('lk-progress');

  const bar   = qs('.lk-progress__bar', node);
  const label = qs('.lk-progress__label', node);

  let value          = opts.value ?? 0;
  let max            = opts.max ?? 100;
  let indeterminate  = opts.indeterminate ?? false;

  function updateView() {
    node.setAttribute('role', 'progressbar');

    if (indeterminate) {
      node.classList.add('lk-progress--indeterminate');
      if (bar) bar.style.width = '';
      node.removeAttribute('aria-valuenow');
      node.removeAttribute('aria-valuemin');
      node.removeAttribute('aria-valuemax');
    } else {
      node.classList.remove('lk-progress--indeterminate');
      const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = Math.round(pct) + '%';
      node.setAttribute('aria-valuenow', value);
      node.setAttribute('aria-valuemin', 0);
      node.setAttribute('aria-valuemax', max);
    }
  }

  updateView();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    value: {
      get() { return value; },
      set(v) { value = Math.max(0, Math.min(max, v)); updateView(); },
      enumerable: true,
    },
    max: {
      get() { return max; },
      set(v) { max = Math.max(0, v); value = Math.min(value, max); updateView(); },
      enumerable: true,
    },
    indeterminate: {
      get() { return indeterminate; },
      set(v) { indeterminate = !!v; updateView(); },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    node.classList.remove('lk-progress', 'lk-progress--indeterminate');
    node.removeAttribute('role');
    node.removeAttribute('aria-valuenow');
    node.removeAttribute('aria-valuemin');
    node.removeAttribute('aria-valuemax');
  };

  return comp;
}
