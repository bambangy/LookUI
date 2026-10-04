// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Behavioral mixins — reusable imperative behaviors applied to existing elements

/**
 * Apply toggle behavior: clicking `triggerEl` toggles `activeClass` on `targetEl`.
 * @param {Element} triggerEl
 * @param {Element} targetEl
 * @param {string} [activeClass='is-active']
 * @returns {{ destroy: Function }}
 */
export function lkToggleable(triggerEl, targetEl, activeClass = 'is-active') {
  function onClick() {
    targetEl.classList.toggle(activeClass);
    const isActive = targetEl.classList.contains(activeClass);
    triggerEl.setAttribute('aria-expanded', String(isActive));
  }

  triggerEl.addEventListener('click', onClick);

  return {
    destroy() {
      triggerEl.removeEventListener('click', onClick);
    },
  };
}

/**
 * Trap focus within a container element (for modals, dialogs).
 * @param {Element} containerEl
 * @returns {{ destroy: Function }}
 */
export function lkFocusTrap(containerEl) {
  const focusable = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function getNodes() {
    return Array.from(containerEl.querySelectorAll(focusable))
      .filter((n) => !n.closest('[hidden], [inert]') && n.getClientRects().length > 0);
  }

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const nodes = getNodes();
    if (!nodes.length) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last  = nodes[nodes.length - 1];
    const active = document.activeElement;
    // Wrap at the edges, and also when focus sits on the container itself
    // (e.g. a tabindex="-1" dialog) or on something not in the tab list.
    const outside = !nodes.includes(active);
    if (e.shiftKey ? (active === first || outside) : (active === last || outside)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }

  containerEl.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      containerEl.removeEventListener('keydown', onKeydown);
    },
  };
}
