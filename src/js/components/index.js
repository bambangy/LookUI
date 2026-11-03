// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Component registry — factory functions for each UI component

import { resolveEl, applyBase } from '../helpers/base.js';
import { lkFocusTrap } from '../behaviors/index.js';
import { readDurationMs } from '../helpers/motion.js';
import { guard } from '../helpers/guard.js';
import { lkI18n, bindText } from '../helpers/i18n.js';

lkI18n.define('modal', { 'close.label': 'Close' });

// --- Button ---

/**
 * Enhance a button element with Look behavior.
 * @param {Element|string} el  — element or CSS selector
 * @param {Object}   [opts]
 * @param {Function} [opts.beforeClick] — (event, { source, component }) => false | Promise — veto the onClick callback (native listeners still fire; DOM event 'lk:before-click')
 * @param {Function} [opts.onClick] — (event, { component }) on click (not called while disabled)
 * @returns {{ el: Element, id: string, hidden: boolean, enabled: boolean, destroy: Function }}
 */
export function lkButton(el, opts = {}) {
  const node = resolveEl(el, 'lkButton');
  const addedClass = !node.classList.contains('lk-btn');
  node.classList.add('lk-btn');

  const comp = {};
  applyBase(comp, node);

  function onClick(event) {
    if (!comp.enabled) return;
    guard(node, opts, 'click', event, { source: 'user', component: comp }, () => {
      if (typeof opts.onClick === 'function') opts.onClick(event, { component: comp });
    });
  }
  if (typeof opts.onClick === 'function' || typeof opts.beforeClick === 'function') node.addEventListener('click', onClick);

  comp.destroy = function () {
    node.removeEventListener('click', onClick);
    if (addedClass) node.classList.remove('lk-btn');
  };

  return comp;
}

// --- Modal ---

/**
 * Manage a modal dialog built from markup.
 *
 *   const modal = Look.lkModal('#modal-container', { trigger: '#open-btn', onClose: (reason) => {} });
 *
 * @param {Element|string} modalEl — the modal container (.lk-modal-backdrop / wrapper holding .lk-modal)
 * @param {Object}   [opts]
 * @param {Element|string} [opts.trigger] — element that toggles the modal on click
 * @param {boolean}  [opts.open]          — open immediately
 * @param {boolean}  [opts.closeOnEscape] — default true
 * @param {Object}   [opts.text]          — text overrides (modal.close.label)
 * @param {Function} [opts.beforeOpen]    — ({ source, component }) => false | Promise — veto opening (DOM event 'lk:before-open')
 * @param {Function} [opts.beforeClose]   — (reason, { source, component }) => false | Promise — veto closing (DOM event 'lk:before-close')
 * @param {Function} [opts.onOpen]        — (component)
 * @param {Function} [opts.onClose]       — (reason, component); reason 'close' | 'escape' | 'toggle' | custom
 * @returns {Object}
 */
export function lkModal(modalEl, opts = {}) {
  const modal = resolveEl(modalEl, 'lkModal');
  const trigger = opts.trigger != null ? resolveEl(opts.trigger, 'lkModal') : null;
  const closeOnEscape = opts.closeOnEscape !== false;

  // Fallback for the exit timer; the real value is --lk-modal-exit-duration.
  const EXIT_MS = 180;

  const trap = lkFocusTrap(modal);
  const dialog = modal.querySelector('.lk-modal') || modal;
  const addedTabindex = !dialog.hasAttribute('tabindex');
  if (addedTabindex) dialog.setAttribute('tabindex', '-1');

  let isOpen = modal.classList.contains('lk-modal--open');
  let closeTimer = null;
  let previousFocus = null;

  const comp = {};
  applyBase(comp, modal);

  // Close buttons without their own aria-label get a localized one
  const labelled = new Set();
  function applyLabels() {
    modal.querySelectorAll('.lk-modal__close').forEach((b) => {
      if (!b.hasAttribute('aria-label') || labelled.has(b)) {
        b.setAttribute('aria-label', tx.tf('modal.close.label'));
        labelled.add(b);
      }
    });
  }
  const tx = bindText('modal', opts.text, applyLabels);
  applyLabels();

  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function open(source) {
    if (isOpen) return comp;
    guard(modal, opts, 'open', undefined, { source: source === 'user' ? 'user' : 'api', component: comp }, doOpen);
    return comp;
  }

  function doOpen() {
    if (isOpen) return comp;
    isOpen = true;
    clearCloseTimer();
    previousFocus = document.activeElement;
    modal.classList.remove('lk-modal--closing');
    modal.classList.add('lk-modal--open');
    trigger?.setAttribute('aria-expanded', 'true');
    if (typeof dialog.focus === 'function') dialog.focus({ preventScroll: true });
    if (typeof opts.onOpen === 'function') opts.onOpen(comp);
    return comp;
  }

  function close(reason = 'close') {
    if (!isOpen) return comp;
    const source = reason === 'escape' || reason === 'toggle' ? 'user' : 'api';
    guard(modal, opts, 'close', reason, { source, component: comp }, doClose);
    return comp;
  }

  function doClose(reason) {
    if (!isOpen) return comp;
    isOpen = false;
    clearCloseTimer();
    modal.classList.remove('lk-modal--open');
    modal.classList.add('lk-modal--closing');
    trigger?.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      modal.classList.remove('lk-modal--closing');
    }, readDurationMs(modal, '--lk-modal-exit-duration', EXIT_MS) + 20);

    if (modal.contains(document.activeElement) && previousFocus && previousFocus.isConnected
      && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
    if (typeof opts.onClose === 'function') opts.onClose(reason, comp);
    return comp;
  }

  function toggle() {
    return isOpen ? close('toggle') : open('user');
  }

  function onTriggerClick() {
    toggle();
  }

  function onKeydown(e) {
    if (isOpen && closeOnEscape && e.key === 'Escape') close('escape');
  }

  trigger?.addEventListener('click', onTriggerClick);
  document.addEventListener('keydown', onKeydown);

  comp.open = open;
  comp.close = close;
  comp.toggle = toggle;
  Object.defineProperty(comp, 'text', { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true });
  Object.defineProperty(comp, 'isOpen', { get() { return isOpen; }, enumerable: true });
  Object.defineProperty(comp, 'trigger', { value: trigger, enumerable: true });
  comp.destroy = function () {
    clearCloseTimer();
    trigger?.removeEventListener('click', onTriggerClick);
    document.removeEventListener('keydown', onKeydown);
    tx.destroy();
    labelled.forEach((b) => b.removeAttribute('aria-label'));
    modal.classList.remove('lk-modal--closing');
    if (addedTabindex) dialog.removeAttribute('tabindex');
    trap.destroy();
  };

  if (opts.open) open('api');
  return comp;
}

// --- Form components ---
export { lkTextbox, lkCheckbox, lkRadio, lkSwitch } from './form.js';
export { lkDropdown } from './dropdown.js';
export { lkPhone } from './phone.js';
export { lkTextPop } from './textPop.js';
export { lkUpload } from './upload.js';
export { lkNumber } from './number.js';
export { lkTime } from './time.js';
export { lkColor } from './color.js';
export { lkSegmented } from './segmented.js';
export { lkAutocomplete } from './autocomplete.js';
export { lkTagInput } from './tagInput.js';
export { lkEditor } from './editor.js';

// --- Icon utility ---
export { lkIcon, lkIcons, lkIcons as icons } from './icon.js';

// --- Interactive components ---
export { lkCarousel }   from './carousel.js';
export { lkSlider }     from './slider.js';
export { lkTooltip }    from './tooltip.js';
export { lkRating }     from './rating.js';
export { lkChip }       from './chip.js';
export { lkCard }       from './card.js';
export { lkAccordion }  from './accordion.js';
export { lkList }       from './list.js';
export { lkPagination } from './pagination.js';
export { lkProgress }   from './progress.js';
export { lkSplitter }   from './splitter.js';
export { lkTabs }       from './tabs.js';

