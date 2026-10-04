// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Component registry — factory functions for each UI component

import { qs } from '../core/index.js';
import { lkFocusTrap } from '../behaviors/index.js';
import { readDurationMs } from '../helpers/motion.js';

// --- Button ---

/**
 * Enhance a button element with Look behavior.
 * @param {Element|string} el  — element or CSS selector
 * @returns {{ el: Element, destroy: Function }}
 */
export function lkButton(el) {
  const node = typeof el === 'string' ? qs(el) : el;
  if (!node) throw new Error(`Look.lkButton: element not found — "${el}"`);

  node.classList.add('lk-btn');

  return {
    el: node,
    destroy() {
      node.classList.remove('lk-btn');
    },
  };
}

// --- Modal ---

/**
 * Create and manage a modal dialog.
 * @param {Element|string} triggerEl  — element or selector for the open trigger
 * @param {Element|string} modalEl    — element or selector for the modal container
 * @returns {{ open: Function, close: Function, isOpen: boolean, destroy: Function }}
 */
export function lkModal(triggerEl, modalEl) {
  const trigger = typeof triggerEl === 'string' ? qs(triggerEl) : triggerEl;
  const modal   = typeof modalEl   === 'string' ? qs(modalEl)   : modalEl;
  if (!trigger || !modal) throw new Error('Look.lkModal: trigger or modal element not found.');

  // Fallback for the exit timer; the real value is --lk-modal-exit-duration.
  const EXIT_MS = 180;

  const trap = lkFocusTrap(modal);
  const dialog = modal.querySelector('.lk-modal') || modal;
  const addedTabindex = !dialog.hasAttribute('tabindex');
  if (addedTabindex) dialog.setAttribute('tabindex', '-1');

  let isOpen = modal.classList.contains('lk-modal--open');
  let closeTimer = null;
  let previousFocus = null;

  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    clearCloseTimer();
    previousFocus = document.activeElement;
    modal.classList.remove('lk-modal--closing');
    modal.classList.add('lk-modal--open');
    trigger.setAttribute('aria-expanded', 'true');
    if (typeof dialog.focus === 'function') dialog.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearCloseTimer();
    modal.classList.remove('lk-modal--open');
    modal.classList.add('lk-modal--closing');
    trigger.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      modal.classList.remove('lk-modal--closing');
    }, readDurationMs(modal, '--lk-modal-exit-duration', EXIT_MS) + 20);

    if (modal.contains(document.activeElement) && previousFocus && previousFocus.isConnected
      && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  function onTriggerClick() {
    if (isOpen) close();
    else open();
  }

  function onKeydown(e) {
    if (isOpen && e.key === 'Escape') close();
  }

  trigger.addEventListener('click', onTriggerClick);
  document.addEventListener('keydown', onKeydown);

  return {
    open,
    close,
    get isOpen() { return isOpen; },
    destroy() {
      clearCloseTimer();
      trigger.removeEventListener('click', onTriggerClick);
      document.removeEventListener('keydown', onKeydown);
      modal.classList.remove('lk-modal--closing');
      if (addedTabindex) dialog.removeAttribute('tabindex');
      trap.destroy();
    },
  };
}

// --- Form components ---
export { lkTextbox, lkCheckbox, lkRadio, lkSwitch } from './form.js';
export { lkDropdown } from './dropdown.js';

// --- Icon utility ---
export { lkIcon, lkIcons, lkIcons as icons } from './icon.js';

// --- Interactive components ---
export { lkCarousel }   from './carousel.js';
export { lkSlider }     from './slider.js';
export { lkTooltip }    from './tooltip.js';
export { lkRating }     from './rating.js';
export { lkChip }       from './chip.js';
export { lkList }       from './list.js';
export { lkPagination } from './pagination.js';
export { lkProgress }   from './progress.js';
export { lkSplitter }   from './splitter.js';

