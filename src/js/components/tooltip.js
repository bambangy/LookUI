// Tooltip component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs } from '../core/index.js';

/**
 * Enhance a tooltip container with show/hide behavior.
 * @param {Element|string} el — .lk-tooltip container
 * @param {Object} [opts]
 * @param {string}  [opts.content]  — tooltip text
 * @param {string}  [opts.position] — top|bottom|left|right (default 'top')
 * @returns {Object}
 */
export function lkTooltip(el, opts = {}) {
  const node = resolveEl(el, 'lkTooltip');
  node.classList.add('lk-tooltip');

  let contentEl = qs('.lk-tooltip__content', node);

  // Auto-create content element if it doesn't exist
  if (!contentEl && opts.content) {
    contentEl = document.createElement('span');
    contentEl.className = 'lk-tooltip__content';
    node.appendChild(contentEl);
  }

  const position = opts.position || 'top';
  if (contentEl) {
    contentEl.classList.add('lk-tooltip__content--' + position);
    if (opts.content) contentEl.textContent = opts.content;
  }

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    content: {
      get() { return contentEl ? contentEl.textContent : ''; },
      set(v) { if (contentEl) contentEl.textContent = v; },
      enumerable: true,
    },
    position: {
      get() { return position; },
      enumerable: true,
    },
  });

  comp.show = function () { node.classList.add('lk-tooltip--open'); };
  comp.hide = function () { node.classList.remove('lk-tooltip--open'); };

  comp.destroy = function () {
    node.classList.remove('lk-tooltip', 'lk-tooltip--open');
  };

  return comp;
}
