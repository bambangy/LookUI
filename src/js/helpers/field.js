// Field wrapper helper — auto-creates .lk-field > .lk-label + element + .lk-field-error

import { createElement } from '../core/index.js';

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
 * @param {Element} node   — the form element (input, select, textarea)
 * @param {Object}  [opts]
 * @param {string}  [opts.label]  — label text
 * @param {string}  [opts.name]   — sets name attr
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.readonly]
 * @returns {{ wrapper: Element|null, labelEl: Element|null, errorEl: Element|null, setError: Function, clearError: Function, destroyField: Function }}
 */
export function wrapField(node, opts = {}) {
  let wrapper = null;
  let labelEl = null;
  let errorEl = null;
  let wasWrapped = false;

  // Apply attribute options
  if (opts.name != null) node.setAttribute('name', opts.name);
  if (opts.required) node.setAttribute('required', '');
  if (opts.readonly) node.setAttribute('readonly', '');

  // Ensure the node has an id for the label's `for` attribute
  if (!node.id && opts.label) {
    node.id = 'lk-' + Math.random().toString(36).slice(2, 9);
  }

  // Check if already wrapped in .lk-field
  const parent = node.parentElement;
  if (parent && parent.classList.contains('lk-field')) {
    wrapper = parent;
    labelEl = wrapper.querySelector('.lk-label');
    errorEl = wrapper.querySelector('.lk-field-error');
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
    if (wasWrapped && wrapper) {
      // Move element back out of wrapper, remove wrapper
      wrapper.parentNode.insertBefore(node, wrapper);
      wrapper.remove();
    }
  }

  return { wrapper, labelEl, errorEl, setError, clearError, destroyField };
}

/**
 * Define common form property accessors on a component target.
 *
 * Provides: value, name, label, required, readonly, setError, clearError
 *
 * @param {Object}  target  — component to enhance
 * @param {Element} node    — form element
 * @param {Object}  field   — result from wrapField()
 */
export function applyFieldProps(target, node, field) {
  const isCheckable = node.type === 'checkbox' || node.type === 'radio';

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
      get() { return field.labelEl ? field.labelEl.textContent : ''; },
      set(v) { if (field.labelEl) field.labelEl.textContent = v; },
      enumerable: true,
    },

    required: {
      get() { return node.required; },
      set(v) { node.required = !!v; },
      enumerable: true,
    },

    readonly: {
      get() { return node.readOnly; },
      set(v) { node.readOnly = !!v; },
      enumerable: true,
    },
  });

  target.setError = field.setError;
  target.clearError = field.clearError;
}
