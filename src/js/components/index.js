// Component registry — factory functions for each UI component

import { qs } from '../core/index.js';
import { lkToggleable, lkFocusTrap } from '../behaviors/index.js';

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
 * @returns {{ open: Function, close: Function, destroy: Function }}
 */
export function lkModal(triggerEl, modalEl) {
  const trigger = typeof triggerEl === 'string' ? qs(triggerEl) : triggerEl;
  const modal   = typeof modalEl   === 'string' ? qs(modalEl)   : modalEl;
  if (!trigger || !modal) throw new Error('Look.lkModal: trigger or modal element not found.');

  const toggle = lkToggleable(trigger, modal, 'lk-modal--open');
  const trap   = lkFocusTrap(modal);

  function open()  { modal.classList.add('lk-modal--open');    trigger.setAttribute('aria-expanded', 'true');  }
  function close() { modal.classList.remove('lk-modal--open'); trigger.setAttribute('aria-expanded', 'false'); }

  return {
    open,
    close,
    destroy() {
      toggle.destroy();
      trap.destroy();
    },
  };
}

// --- Form components ---
export { lkTextbox, lkDropdown, lkCheckbox, lkRadio, lkSwitch } from './form.js';

// --- Icon utility ---
export { lkIcon }       from './icon.js';

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
export { lkTable }      from './table.js';

