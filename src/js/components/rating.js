// Rating component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qsa, createElement } from '../core/index.js';

/**
 * Enhance a rating container with click-to-rate behavior.
 * @param {Element|string} el — .lk-rating container
 * @param {Object} [opts]
 * @param {number}  [opts.max]      — number of stars (default 5)
 * @param {number}  [opts.value]    — initial value (default 0)
 * @param {boolean} [opts.readonly] — disable interaction
 * @param {string}  [opts.symbol]   — star character (default '★')
 * @param {Function} [opts.onChange] — callback(value)
 * @returns {Object}
 */
export function lkRating(el, opts = {}) {
  const node = resolveEl(el, 'lkRating');
  node.classList.add('lk-rating');

  const maxVal   = opts.max ?? 5;
  const symbol   = opts.symbol ?? '★';
  let value      = opts.value ?? 0;
  let isReadonly = opts.readonly ?? false;
  let items      = qsa('.lk-rating__item', node);

  // Auto-create star items if empty
  if (items.length === 0) {
    for (let i = 1; i <= maxVal; i++) {
      const btn = createElement('button', {
        class: 'lk-rating__item',
        type: 'button',
        'data-value': String(i),
        'aria-label': `${i} of ${maxVal}`,
      }, symbol);
      node.appendChild(btn);
    }
    items = qsa('.lk-rating__item', node);
  }

  function updateView() {
    items.forEach((item, i) => {
      item.classList.toggle('lk-rating__item--active', i < value);
    });
    node.setAttribute('aria-valuenow', value);
    node.setAttribute('aria-valuemax', maxVal);

    if (isReadonly) node.classList.add('lk-rating--readonly');
    else node.classList.remove('lk-rating--readonly');
  }

  function onClick(e) {
    if (isReadonly) return;
    const item = e.target.closest('.lk-rating__item');
    if (!item) return;
    const idx = items.indexOf(item);
    if (idx >= 0) {
      value = idx + 1;
      updateView();
      if (opts.onChange) opts.onChange(value);
    }
  }

  node.addEventListener('click', onClick);
  updateView();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    value: {
      get() { return value; },
      set(v) { value = Math.max(0, Math.min(maxVal, v)); updateView(); },
      enumerable: true,
    },
    max: {
      get() { return maxVal; },
      enumerable: true,
    },
    readonly: {
      get() { return isReadonly; },
      set(v) { isReadonly = !!v; updateView(); },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    node.removeEventListener('click', onClick);
    node.classList.remove('lk-rating', 'lk-rating--readonly');
    node.removeAttribute('aria-valuenow');
    node.removeAttribute('aria-valuemax');
  };

  return comp;
}
