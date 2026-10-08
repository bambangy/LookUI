// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Form component factories — Textbox, Dropdown, Checkbox, Radio, Switch

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField, applyFieldProps } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';

// Validation options shared by every form component (see helpers/validation.js):
//   rules: [(value, comp) => true | 'message', 'required', { min, max, minLength, maxLength, pattern, email, message }]
//   validate: true   — run the rules when focus leaves the field

function createAffixSlot(className) {
  const slot = document.createElement('span');
  slot.className = className;
  slot.hidden = true;
  return slot;
}
function setAffixContent(slot, content) {
  slot.textContent = '';
  if (content == null || content === false || content === '') {
    slot.hidden = true;
    return;
  }
  slot.hidden = false;
  const append = (value) => {
    if (value == null || value === false || value === '') return;
    if (value instanceof Node) {
      slot.appendChild(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    const span = document.createElement('span');
    span.textContent = String(value);
    slot.appendChild(span);
  };
  append(content);
}
// Checkbox / switch: the value is `checked`; "required" means it must be on
function attachCheckableValidation(comp, node, field, opts) {
  return attachValidation(comp, {
    opts,
    getValue: () => node.checked,
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    requiredMessage: () => 'This option is required',
    roots: () => [field.wrapper || node],
    changeTargets: [node],
    setError: field.setError,
    clearError: field.clearError,
  });
}

function radioGroup(node) {
  if (!node.name) return [node];
  const scope = node.form || node.getRootNode?.() || document;
  const name = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(node.name) : node.name;
  const list = Array.from(scope.querySelectorAll(`input[type="radio"][name="${name}"]`));
  return list.length ? list : [node];
}

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
 * @param {Array}   [opts.rules]   — validation rules
 * @param {boolean} [opts.validate] — validate when focus leaves the field
 * @returns {Object}
 */
export function lkTextbox(el, opts = {}) {
  const node = resolveEl(el, 'lkTextbox');
  node.classList.add('lk-input');
  let inputType = node.tagName === 'INPUT' ? node.type : '';
  function applyInputType(nextType) {
    if (node.tagName !== 'INPUT') return;
    const requested = (nextType == null || nextType === '') ? 'text' : String(nextType).toLowerCase();
    node.setAttribute('type', requested);
    // Browser normalizes unsupported types back to text.
    inputType = node.type;
  }
  if (node.tagName === 'INPUT') {
    applyInputType(opts.type ?? node.getAttribute('type') ?? 'text');
  }
  const field = wrapField(node, opts);
  // Optional affix wrapper so prepend/append content never overlaps cursor/text.
  const affixWrap = document.createElement('div');
  affixWrap.className = 'lk-input-affix';
  const prependEl = createAffixSlot('lk-input-affix__prepend');
  const appendEl = createAffixSlot('lk-input-affix__append');
  const parent = node.parentNode;
  parent?.insertBefore(affixWrap, node);
  affixWrap.appendChild(prependEl);
  affixWrap.appendChild(node);
  affixWrap.appendChild(appendEl);
  node.classList.add('lk-input--affixed');
  setAffixContent(prependEl, opts.prepend);
  setAffixContent(appendEl, opts.append);
  affixWrap.classList.toggle('lk-input-affix--has-prepend', !prependEl.hidden);
  affixWrap.classList.toggle('lk-input-affix--has-append', !appendEl.hidden);
  const comp = {};
  applyBase(comp, node, { hiddenTarget: field.wrapper || affixWrap });
  applyFieldProps(comp, node, field);
  Object.defineProperty(comp, 'type', {
    get() {
      return node.tagName === 'INPUT' ? inputType : '';
    },
    set(v) {
      applyInputType(v);
    },
    enumerable: true,
  });
  Object.defineProperties(comp, {
    prepend: {
      get() {
        return prependEl.hidden ? null : prependEl;
      },
      set(value) {
        setAffixContent(prependEl, value);
        affixWrap.classList.toggle('lk-input-affix--has-prepend', !prependEl.hidden);
      },
      enumerable: true,
    },
    append: {
      get() {
        return appendEl.hidden ? null : appendEl;
      },
      set(value) {
        setAffixContent(appendEl, value);
        affixWrap.classList.toggle('lk-input-affix--has-append', !appendEl.hidden);
      },
      enumerable: true,
    },
  });
  comp.focus = (o) => node.focus(o);
  const validation = attachValidation(comp, {
    opts,
    getValue: () => node.value,
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    roots: () => [affixWrap],
    changeTargets: [node],
    setError: field.setError,
    clearError: field.clearError,
  });
  comp.destroy = function () {
    validation.destroy();
    node.classList.remove('lk-input', 'lk-input--error', 'lk-input--affixed');
    node.removeAttribute('aria-invalid');
    if (affixWrap.parentNode) {
      affixWrap.parentNode.insertBefore(node, affixWrap);
      affixWrap.remove();
    }
    field.destroyField();
  };
  return comp;
}

// lkDropdown is now a full custom component in dropdown.js

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
  comp.focus = (o) => node.focus(o);

  const validation = attachCheckableValidation(comp, node, field, opts);

  comp.destroy = function () {
    validation.destroy();
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
  comp.focus = (o) => node.focus(o);

  // A radio validates its whole group (same name, same form): the value is the checked one
  const group = () => radioGroup(node);
  const validation = attachValidation(comp, {
    opts,
    getValue: () => group().find((r) => r.checked)?.value ?? null,
    label: field.getLabel,
    labels: () => field.labels,
    required: () => group().some((r) => r.required),
    requiredMessage: () => 'Please choose an option',
    roots: () => group().map((r) => r.closest('.lk-field') || r),
    changeTargets: group(),
    setError: field.setError,
    clearError: field.clearError,
  });

  comp.destroy = function () {
    validation.destroy();
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
  comp.focus = (o) => node.focus(o);

  const validation = attachCheckableValidation(comp, node, field, opts);

  comp.destroy = function () {
    validation.destroy();
    node.removeEventListener('change', onToggle);
    node.classList.remove('lk-switch', 'lk-input--error');
    node.removeAttribute('role');
    node.removeAttribute('aria-checked');
    node.removeAttribute('aria-invalid');
    field.destroyField();
  };

  return comp;
}


