// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Field wrapper helper — auto-creates .lk-field > .lk-label + element + .lk-field-error
// and keeps every label that points at the control (created or external) in sync.

import { createElement } from '../core/index.js';

const REQUIRED_CLASS = 'lk-label--required';

function escapeId(id) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/(["\\])/g, '\\$1');
}

/**
 * Find labels that already exist in the document for `node`:
 *   - <label for="node-id"> anywhere in the document
 *   - a <label> that wraps the node (implicit label)
 * @param {Element} node
 * @param {Element|null} [exclude] — a label to leave out (the one wrapField created)
 * @returns {Element[]}
 */
export function findExternalLabels(node, exclude = null) {
  const found = [];
  const root = node.getRootNode?.() || document;
  const scope = typeof root.querySelectorAll === 'function' ? root : document;

  if (node.id) {
    scope.querySelectorAll(`label[for="${escapeId(node.id)}"]`).forEach((l) => found.push(l));
  }

  const wrapping = node.parentElement?.closest('label');
  if (wrapping && !found.includes(wrapping)) found.push(wrapping);

  return found.filter((l) => l !== exclude);
}

function isFlaggedRequired(label) {
  return label.hasAttribute('data-required')
    || label.hasAttribute('data-mandatory')
    || label.classList.contains(REQUIRED_CLASS);
}

// Replace a label's text without destroying a control nested inside it.
function setLabelText(label, text, node) {
  const value = text == null ? '' : String(text);
  if (!label.contains(node)) {
    label.textContent = value;
    return;
  }

  let anchor = null;
  Array.from(label.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
      if (!anchor) anchor = child.nextSibling;
      child.remove();
    }
  });
  if (!value) return;

  const ref = anchor && anchor.parentNode === label ? anchor : null;
  const prev = ref ? ref.previousSibling : label.lastChild;
  const needsGap = prev && prev.nodeType === Node.ELEMENT_NODE;
  label.insertBefore(document.createTextNode(needsGap ? ` ${value}` : value), ref);
}

/**
 * Wrap a form element with label and error scaffolding.
 *
 * If `opts.label` is provided, wraps `node` in:
 *   <div class="lk-field">
 *     <label class="lk-label" for="...">label text</label>
 *     <!-- node -->
 *     <span class="lk-field-error" style="display:none"></span>
 *   </div>
 *
 * External labels (`<label for="id">` anywhere in the document, or a <label>
 * wrapping the node) are also managed: their text follows the `label` property
 * and they get a red asterisk (`.lk-label--required`) while the field is required.
 * A label carrying `data-required` / `data-mandatory` marks the field required.
 *
 * @param {Element} node   — the form element (input, select, textarea)
 * @param {Object}  [opts]
 * @param {string}  [opts.label]  — label text
 * @param {string}  [opts.name]   — sets name attr
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.mandatory]      — alias of `required`
 * @param {boolean} [opts.requiredMark=true] — show the asterisk on labels when required
 * @param {boolean} [opts.readonly]
 * @param {Element} [opts.requiredTarget] — element carrying the `required` state (default: node)
 * @returns {{ wrapper: Element|null, labelEl: Element|null, errorEl: Element|null, labels: Element[], externalLabels: Element[], setError: Function, clearError: Function, getLabel: Function, setLabel: Function, setRequired: Function, refreshLabels: Function, destroyField: Function }}
 */
export function wrapField(node, opts = {}) {
  let wrapper = null;
  let labelEl = null;
  let errorEl = null;
  let wasWrapped = false;

  const requiredTarget = opts.requiredTarget || node;
  const requiredMark = opts.requiredMark !== false;
  const explicitRequired = opts.required ?? opts.mandatory;

  // Apply attribute options
  if (opts.name != null) node.setAttribute('name', opts.name);
  if (opts.readonly) node.setAttribute('readonly', '');

  // Ensure the node has an id for the label's `for` attribute
  if (!node.id && opts.label) {
    node.id = 'lk-' + Math.random().toString(36).slice(2, 9);
  }

  // Check if already wrapped in .lk-field
  const parent = node.parentElement;
  if (parent && parent.classList.contains('lk-field')) {
    wrapper = parent;
    labelEl = wrapper.querySelector(':scope > .lk-label');
    errorEl = wrapper.querySelector(':scope > .lk-field-error');
  } else if (opts.label && node.parentNode) {
    // Auto-create wrapper (only when node is in the DOM)
    wrapper = createElement('div', { class: 'lk-field' });
    labelEl = createElement('label', { class: 'lk-label', for: node.id }, opts.label);
    errorEl = createElement('span', { class: 'lk-field-error' });
    errorEl.style.display = 'none';

    // Insert wrapper where node currently is, then move node inside
    node.parentNode.insertBefore(wrapper, node);
    wrapper.appendChild(labelEl);
    wrapper.appendChild(node);
    wrapper.appendChild(errorEl);
    wasWrapped = true;
  }

  // --- Label management ------------------------------------------------------

  let externalLabels = findExternalLabels(node, labelEl);
  // Remember labels the author already marked, so destroy() can restore them.
  const preMarked = new Set(
    [labelEl, ...externalLabels].filter((l) => l && l.classList.contains(REQUIRED_CLASS)),
  );

  function allLabels() {
    return labelEl ? [labelEl, ...externalLabels] : externalLabels.slice();
  }

  function setRequired(flag) {
    const on = !!flag;
    requiredTarget.required = on;
    if (requiredTarget !== node && node.setAttribute) {
      if (on) node.setAttribute('aria-required', 'true');
      else node.removeAttribute('aria-required');
    }
    allLabels().forEach((l) => l.classList.toggle(REQUIRED_CLASS, on && requiredMark));
  }

  function getLabel() {
    const primary = labelEl || externalLabels[0];
    return primary ? primary.textContent.trim() : '';
  }

  function setLabel(text) {
    allLabels().forEach((l) => setLabelText(l, text, node));
  }

  // Re-scan the document, e.g. after the page renders an external label later.
  function refreshLabels() {
    const next = findExternalLabels(node, labelEl);
    next.forEach((l) => {
      if (!externalLabels.includes(l) && l.classList.contains(REQUIRED_CLASS)) preMarked.add(l);
    });
    externalLabels = next;
    setRequired(requiredTarget.required);
  }

  // Initial required state: explicit option > existing attribute > flagged label.
  const initialRequired = explicitRequired != null
    ? !!explicitRequired
    : requiredTarget.required || allLabels().some(isFlaggedRequired);
  setRequired(initialRequired);

  // --- Error handling ----------------------------------------------------------

  // Error class: use lk-field--error on wrapper when available, lk-input--error on node as fallback
  function setError(msg) {
    if (wrapper) wrapper.classList.add('lk-field--error');
    node.classList.add('lk-input--error');
    node.setAttribute('aria-invalid', 'true');
    if (errorEl && msg) {
      errorEl.textContent = msg;
      errorEl.style.display = '';
    }
  }

  function clearError() {
    if (wrapper) wrapper.classList.remove('lk-field--error');
    node.classList.remove('lk-input--error');
    node.removeAttribute('aria-invalid');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  function destroyField() {
    clearError();
    allLabels().forEach((l) => l.classList.toggle(REQUIRED_CLASS, preMarked.has(l)));
    if (requiredTarget !== node) node.removeAttribute?.('aria-required');
    if (wasWrapped && wrapper) {
      // Move element back out of wrapper, remove wrapper
      wrapper.parentNode.insertBefore(node, wrapper);
      wrapper.remove();
    }
  }

  return {
    wrapper,
    labelEl,
    errorEl,
    get labels() { return allLabels(); },
    get externalLabels() { return externalLabels.slice(); },
    setError,
    clearError,
    getLabel,
    setLabel,
    setRequired,
    refreshLabels,
    destroyField,
  };
}

/**
 * Define common form property accessors on a component target.
 *
 * Provides: value, name, label, labels, required, mandatory, readonly,
 *           setError, clearError, refreshLabels
 *
 * @param {Object}  target  — component to enhance
 * @param {Element} node    — form element
 * @param {Object}  field   — result from wrapField()
 */
export function applyFieldProps(target, node, field) {
  const isCheckable = node.type === 'checkbox' || node.type === 'radio';

  const requiredProp = {
    get() { return node.required; },
    set(v) { field.setRequired(v); },
    enumerable: true,
  };

  Object.defineProperties(target, {
    value: {
      get() { return isCheckable ? node.checked : node.value; },
      set(v) {
        if (isCheckable) node.checked = !!v;
        else node.value = v;
      },
      enumerable: true,
    },

    name: {
      get() { return node.name; },
      set(v) { node.name = v; },
      enumerable: true,
    },

    label: {
      get() { return field.getLabel(); },
      set(v) { field.setLabel(v); },
      enumerable: true,
    },

    labels: {
      get() { return field.labels; },
      enumerable: true,
    },

    required: requiredProp,
    mandatory: { ...requiredProp, enumerable: false },

    readonly: {
      get() { return node.readOnly; },
      set(v) { node.readOnly = !!v; },
      enumerable: true,
    },
  });

  target.setError = field.setError;
  target.clearError = field.clearError;
  target.refreshLabels = field.refreshLabels;
}
