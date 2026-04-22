// Form component factories — Textbox, Dropdown, Checkbox, Radio, Switch

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField, applyFieldProps } from '../helpers/field.js';

// ---------------------------------------------------------------------------
// Textbox — wraps <input> or <textarea>
// ---------------------------------------------------------------------------

/**
 * Enhance an input/textarea with Look styling, label wrapper, and validation.
 * @param {Element|string} el — <input> or <textarea> element or selector
 * @param {Object} [opts]
 * @param {string} [opts.label]    — auto-creates .lk-field wrapper with label
 * @param {string} [opts.name]     — sets name attribute
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.readonly]
 * @param {string} [opts.type]     — input type (text, email, password, etc.)
 * @returns {Object}
 */
export function lkTextbox(el, opts = {}) {
  const node = resolveEl(el, 'lkTextbox');
  node.classList.add('lk-input');

  if (opts.type && node.tagName === 'INPUT') node.type = opts.type;

  const field = wrapField(node, opts);
  const comp = {};

  applyBase(comp, node, { hiddenTarget: field.wrapper || node });
  applyFieldProps(comp, node, field);

  Object.defineProperty(comp, 'type', {
    get() { return node.type; },
    set(v) { if (node.tagName === 'INPUT') node.type = v; },
    enumerable: true,
  });

  comp.destroy = function () {
    node.classList.remove('lk-input', 'lk-input--error');
    node.removeAttribute('aria-invalid');
    field.destroyField();
  };

  return comp;
}

// ---------------------------------------------------------------------------
// Dropdown — wraps <select>
// ---------------------------------------------------------------------------

/**
 * Enhance a <select> element with Look styling, label wrapper, and validation.
 * @param {Element|string} el — <select> element or selector
 * @param {Object} [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.name]
 * @param {boolean} [opts.required]
 * @param {Array}   [opts.items] — [{ value, text, selected?, disabled? }, ...]
 * @returns {Object}
 */
export function lkDropdown(el, opts = {}) {
  const node = resolveEl(el, 'lkDropdown');
  node.classList.add('lk-input', 'lk-select');

  // Populate options if provided
  if (opts.items && Array.isArray(opts.items)) {
    opts.items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.value ?? '';
      option.textContent = item.text ?? item.value ?? '';
      if (item.selected) option.selected = true;
      if (item.disabled) option.disabled = true;
      node.appendChild(option);
    });
  }

  const field = wrapField(node, opts);
  const comp = {};

  applyBase(comp, node, { hiddenTarget: field.wrapper || node });
  applyFieldProps(comp, node, field);

  Object.defineProperties(comp, {
    selectedIndex: {
      get() { return node.selectedIndex; },
      set(v) { node.selectedIndex = v; },
      enumerable: true,
    },

    selectedText: {
      get() {
        const opt = node.options[node.selectedIndex];
        return opt ? opt.textContent : '';
      },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    node.classList.remove('lk-input', 'lk-select', 'lk-input--error');
    node.removeAttribute('aria-invalid');
    field.destroyField();
  };

  return comp;
}

// ---------------------------------------------------------------------------
// Checkbox — wraps <input type="checkbox">
// ---------------------------------------------------------------------------

/**
 * Enhance a checkbox with Look styling, label wrapper, and validation.
 * @param {Element|string} el — <input type="checkbox"> element or selector
 * @param {Object} [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.name]
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.checked]
 * @returns {Object}
 */
export function lkCheckbox(el, opts = {}) {
  const node = resolveEl(el, 'lkCheckbox');
  node.classList.add('lk-checkbox');

  if (opts.checked != null) node.checked = !!opts.checked;

  const field = wrapField(node, opts);
  const comp = {};

  applyBase(comp, node, { hiddenTarget: field.wrapper || node });
  applyFieldProps(comp, node, field);

  Object.defineProperty(comp, 'checked', {
    get() { return node.checked; },
    set(v) { node.checked = !!v; },
    enumerable: true,
  });

  comp.toggle = function () { node.checked = !node.checked; };

  comp.destroy = function () {
    node.classList.remove('lk-checkbox', 'lk-input--error');
    node.removeAttribute('aria-invalid');
    field.destroyField();
  };

  return comp;
}

// ---------------------------------------------------------------------------
// Radio — wraps <input type="radio">
// ---------------------------------------------------------------------------

/**
 * Enhance a radio button with Look styling, label wrapper, and validation.
 * @param {Element|string} el — <input type="radio"> element or selector
 * @param {Object} [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.name]
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.checked]
 * @returns {Object}
 */
export function lkRadio(el, opts = {}) {
  const node = resolveEl(el, 'lkRadio');
  node.classList.add('lk-radio');

  if (opts.checked != null) node.checked = !!opts.checked;

  const field = wrapField(node, opts);
  const comp = {};

  applyBase(comp, node, { hiddenTarget: field.wrapper || node });
  applyFieldProps(comp, node, field);

  Object.defineProperty(comp, 'checked', {
    get() { return node.checked; },
    set(v) { node.checked = !!v; },
    enumerable: true,
  });

  comp.destroy = function () {
    node.classList.remove('lk-radio', 'lk-input--error');
    node.removeAttribute('aria-invalid');
    field.destroyField();
  };

  return comp;
}

// ---------------------------------------------------------------------------
// Switch — wraps <input type="checkbox"> as a toggle
// ---------------------------------------------------------------------------

/**
 * Enhance a checkbox as a toggle switch with Look styling.
 * @param {Element|string} el — <input type="checkbox"> element or selector
 * @param {Object} [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.name]
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.checked]
 * @returns {Object}
 */
export function lkSwitch(el, opts = {}) {
  const node = resolveEl(el, 'lkSwitch');
  node.classList.add('lk-switch');
  node.setAttribute('role', 'switch');

  if (opts.checked != null) node.checked = !!opts.checked;

  // Update aria-checked on change
  function onToggle() {
    node.setAttribute('aria-checked', String(node.checked));
  }
  node.addEventListener('change', onToggle);
  node.setAttribute('aria-checked', String(node.checked));

  const field = wrapField(node, opts);
  const comp = {};

  applyBase(comp, node, { hiddenTarget: field.wrapper || node });
  applyFieldProps(comp, node, field);

  Object.defineProperty(comp, 'checked', {
    get() { return node.checked; },
    set(v) {
      node.checked = !!v;
      node.setAttribute('aria-checked', String(node.checked));
    },
    enumerable: true,
  });

  comp.toggle = function () {
    node.checked = !node.checked;
    node.setAttribute('aria-checked', String(node.checked));
  };

  comp.destroy = function () {
    node.removeEventListener('change', onToggle);
    node.classList.remove('lk-switch', 'lk-input--error');
    node.removeAttribute('role');
    node.removeAttribute('aria-checked');
    node.removeAttribute('aria-invalid');
    field.destroyField();
  };

  return comp;
}
