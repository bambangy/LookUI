// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
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
  const addedRootClass = !node.classList.contains('lk-tooltip');
  node.classList.add('lk-tooltip');

  let contentEl = qs('.lk-tooltip__content', node);
  let autoCreated = false;

  // Auto-create content element if it doesn't exist
  if (!contentEl && opts.content) {
    contentEl = document.createElement('span');
    contentEl.className = 'lk-tooltip__content';
    node.appendChild(contentEl);
    autoCreated = true;
  }

  const POSITIONS = ['top', 'bottom', 'left', 'right'];
  const normalizePosition = (v) => (POSITIONS.includes(v) ? v : 'top');

  let position = normalizePosition(opts.position);
  const originalText = contentEl && !autoCreated ? contentEl.textContent : null;
  const added = { role: false, id: false, describedBy: null };

  if (contentEl) {
    contentEl.classList.add('lk-tooltip__content--' + position);
    if (opts.content) contentEl.textContent = opts.content;

    // Accessibility: link the trigger to the tip text.
    if (!contentEl.hasAttribute('role')) {
      contentEl.setAttribute('role', 'tooltip');
      added.role = true;
    }
    if (!contentEl.id) {
      contentEl.id = 'lk-tooltip-' + Math.random().toString(36).slice(2, 9);
      added.id = true;
    }
    const trigger = Array.from(node.children).find((c) => c !== contentEl) || node;
    const describedBy = (trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!describedBy.includes(contentEl.id)) {
      trigger.setAttribute('aria-describedby', describedBy.concat(contentEl.id).join(' '));
      added.describedBy = trigger;
    }
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
      set(v) {
        if (contentEl) {
          contentEl.classList.remove('lk-tooltip__content--' + position);
          position = normalizePosition(v);
          contentEl.classList.add('lk-tooltip__content--' + position);
        }
      },
      enumerable: true,
    },
  });

  comp.show = function () { node.classList.add('lk-tooltip--open'); };
  comp.hide = function () { node.classList.remove('lk-tooltip--open'); };

  comp.destroy = function () {
    node.classList.remove('lk-tooltip--open');
    if (addedRootClass) node.classList.remove('lk-tooltip');
    if (contentEl) {
      contentEl.classList.remove('lk-tooltip__content--' + position);
      if (added.describedBy) {
        const rest = (added.describedBy.getAttribute('aria-describedby') || '')
          .split(/\s+/).filter((id) => id && id !== contentEl.id);
        if (rest.length) added.describedBy.setAttribute('aria-describedby', rest.join(' '));
        else added.describedBy.removeAttribute('aria-describedby');
      }
      if (autoCreated) {
        contentEl.remove();
      } else {
        if (added.role) contentEl.removeAttribute('role');
        if (added.id) contentEl.removeAttribute('id');
        if (originalText != null) contentEl.textContent = originalText;
      }
    }
  };

  return comp;
}
