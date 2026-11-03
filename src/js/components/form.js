// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Form component factories — Textbox, Dropdown, Checkbox, Radio, Switch

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField, applyFieldProps } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guardSync } from '../helpers/guard.js';
import { lkIcon } from './icon.js';

// Form components have almost no texts of their own; they still honour `opts.text` / Look.i18n
// for the validation messages (shared 'validation.*' keys + the checkable "required" texts).
lkI18n.define('textbox', {
  showPassword: 'Show password',
  hidePassword: 'Hide password',
});
lkI18n.define('checkbox', { required: 'This option is required' });
lkI18n.define('radio', { required: 'Please choose an option' });
lkI18n.define('switch', { required: 'This option is required' });

function exposeText(comp, tx) {
  Object.defineProperty(comp, 'text', {
    get() { return tx.get(); },
    set(v) { tx.set(v); },
    enumerable: true,
    configurable: true,
  });
}

/**
 * `beforeChange(checked, { source: 'change', component, event })` for native checkables.
 * The native value has already changed when the event fires: a veto puts it back (and the event is
 * swallowed, so onChange / re-validation do not run). A returned boolean replaces the new state.
 * Registered in the capture phase on the input so it runs before every other change listener.
 */
function bindCheckableGuard(comp, node, opts, { revert, replace }) {
  const handler = (event) => {
    const res = guardSync(node, opts, 'change', node.checked, { source: 'change', component: comp, event });
    if (!res.allowed) {
      event.stopImmediatePropagation();
      revert();
      return;
    }
    if (typeof res.payload === 'boolean' && res.payload !== node.checked) replace(res.payload);
  };
  node.addEventListener('change', handler, true);
  return () => node.removeEventListener('change', handler, true);
}

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
function attachCheckableValidation(comp, node, field, opts, tx) {
  return attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => node.checked,
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    requiredMessage: () => tx.t('required'),
    roots: () => [field.wrapper || node],
    changeTargets: [node],
    setError: field.setError,
    clearError: field.clearError,
  });
}

/**
 * User-driven change callbacks (programmatic `value` / `checked` changes are silent).
 *   onInput(value, { source: 'input', component, event })   — textbox, every keystroke
 *   onChange(value, { source: 'change', component, event }) — committed change
 * @param {Function} read — current value for the callback (value, checked, …)
 * @returns {Function} cleanup
 */
function bindChangeCallbacks(comp, node, opts, read) {
  const onInput = (event) => opts.onInput(read(), { source: 'input', component: comp, event });
  const onChange = (event) => opts.onChange(read(), { source: 'change', component: comp, event });
  if (typeof opts.onInput === 'function') node.addEventListener('input', onInput);
  if (typeof opts.onChange === 'function') node.addEventListener('change', onChange);
  return () => {
    node.removeEventListener('input', onInput);
    node.removeEventListener('change', onChange);
  };
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
 * @param {Function} [opts.onInput]  — (value, { source: 'input', component, event }) on every keystroke
 * @param {Function} [opts.onChange] — (value, { source: 'change', component, event }) when the change is committed (blur / Enter)
 * @param {boolean|{maxRows?: number}} [opts.autosize] — <textarea>: grows with its content (never below the CSS min-height); with `maxRows` it scrolls beyond that many rows
 * @param {boolean} [opts.reveal] — password input: an eye button (inside the affix box) toggles password / text; texts 'textbox.showPassword' / 'textbox.hidePassword'
 * @returns {Object}
 */
export function lkTextbox(el, opts = {}) {
  const node = resolveEl(el, 'lkTextbox');
  node.classList.add('lk-input');
  let inputType = node.tagName === 'INPUT' ? node.type : '';
  let revealBtn = null;
  let revealed = false;
  function applyInputType(nextType) {
    if (node.tagName !== 'INPUT') return;
    const requested = (nextType == null || nextType === '') ? 'text' : String(nextType).toLowerCase();
    node.setAttribute('type', requested);
    // Browser normalizes unsupported types back to text.
    inputType = node.type;
    revealed = false;
    syncReveal();
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
  const tx = bindText('textbox', opts.text, () => refreshTexts());
  exposeText(comp, tx);

  // --- autosize (<textarea>) --------------------------------------------------------------
  const autosize = node.tagName === 'TEXTAREA' && opts.autosize ? opts.autosize : null;
  const maxRows = autosize && typeof autosize === 'object' && Number(autosize.maxRows) > 0 ? Number(autosize.maxRows) : 0;
  const sizeBackup = { height: node.style.height, overflowY: node.style.overflowY, resize: node.style.resize };
  let lastWidth = -1;
  let resizeObserver = null;
  let ownValue = null;
  function autosizeNow() {
    if (!autosize || !node.isConnected) return;
    const cs = getComputedStyle(node);
    node.style.height = 'auto';
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderBox = cs.boxSizing === 'border-box';
    let h = node.scrollHeight + (borderBox ? borderY : -padY);
    let scroll = false;
    if (maxRows) {
      const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.2);
      const cap = lh * maxRows + (borderBox ? padY + borderY : 0);
      if (h > cap) { h = cap; scroll = true; }
    }
    node.style.height = `${Math.ceil(h)}px`;
    node.style.overflowY = scroll ? 'auto' : 'hidden';
  }
  if (autosize) {
    node.style.resize = 'none';
    node.classList.add('lk-input--autosize');
    node.addEventListener('input', autosizeNow);
    // programmatic `value =` (the component's and the element's own) re-measures too
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value');
    if (proto && proto.set) {
      ownValue = true;
      Object.defineProperty(node, 'value', {
        get() { return proto.get.call(node); },
        set(v) { proto.set.call(node, v); autosizeNow(); },
        configurable: true,
      });
    }
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        const w = node.clientWidth;
        if (w !== lastWidth) { lastWidth = w; autosizeNow(); }
      });
      resizeObserver.observe(node);
    }
    autosizeNow();
    requestAnimationFrame(autosizeNow);
  }

  // --- reveal (password) ----------------------------------------------------------------------
  function syncReveal() {
    if (!revealBtn) return;
    const isPw = inputType === 'password';
    revealBtn.hidden = !isPw;
    if (!isPw) revealed = false;
    node.setAttribute('type', revealed && isPw ? 'text' : inputType);
    revealBtn.setAttribute('aria-pressed', String(revealed));
    revealBtn.setAttribute('aria-label', tx.t(revealed ? 'hidePassword' : 'showPassword'));
    revealBtn.replaceChildren(lkIcon(revealed ? 'eye-off' : 'eye'));
    affixWrap.classList.toggle('lk-input-affix--has-reveal', isPw);
  }
  function setRevealed(next, keepFocus) {
    if (!revealBtn || inputType !== 'password' || node.disabled) return;
    const focused = keepFocus || document.activeElement === node;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    revealed = !!next;
    syncReveal();
    if (focused) {
      node.focus();
      try { node.setSelectionRange(start, end); } catch { /* type switched mid-way */ }
    }
  }
  const onRevealDown = (e) => { e.preventDefault(); }; // keep focus (and caret) in the input
  const onRevealClick = () => setRevealed(!revealed, document.activeElement === node);
  if (opts.reveal && node.tagName === 'INPUT') {
    revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'lk-input__reveal';
    revealBtn.addEventListener('mousedown', onRevealDown);
    revealBtn.addEventListener('click', onRevealClick);
    affixWrap.appendChild(revealBtn);
    syncReveal();
  }
  Object.defineProperty(comp, 'revealed', {
    get() { return revealed; },
    set(v) { setRevealed(v, false); },
    enumerable: true,
  });
  function refreshTexts() {
    if (revealBtn) syncReveal();
    autosizeNow();
  }
  // beforeChange(value, { source: 'change', component, event }) guards the committed change (blur / Enter);
  // a veto restores the last committed value. (Per-keystroke control: use the native `beforeinput` event.)
  let committed = node.value;
  const syncCommitted = () => { committed = node.value; };
  const onGuardChange = (event) => {
    const res = guardSync(node, opts, 'change', node.value, { source: 'change', component: comp, event });
    if (!res.allowed) {
      event.stopImmediatePropagation();
      node.value = committed;
      return;
    }
    if (res.payload !== node.value && res.payload != null) node.value = String(res.payload);
    committed = node.value;
  };
  node.addEventListener('focus', syncCommitted);
  node.addEventListener('change', onGuardChange, true);
  const validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => node.value,
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    roots: () => [affixWrap],
    changeTargets: [node],
    setError: field.setError,
    clearError: field.clearError,
  });
  const unbindChange = bindChangeCallbacks(comp, node, opts, () => node.value);
  comp.destroy = function () {
    unbindChange();
    node.removeEventListener('focus', syncCommitted);
    node.removeEventListener('change', onGuardChange, true);
    tx.destroy();
    validation.destroy();
    if (revealBtn) {
      revealBtn.removeEventListener('mousedown', onRevealDown);
      revealBtn.removeEventListener('click', onRevealClick);
      revealBtn.remove();
      revealBtn = null;
      if (revealed) node.setAttribute('type', inputType);
      affixWrap.classList.remove('lk-input-affix--has-reveal');
    }
    if (autosize) {
      node.removeEventListener('input', autosizeNow);
      resizeObserver?.disconnect();
      if (ownValue) delete node.value;
      node.style.height = sizeBackup.height;
      node.style.overflowY = sizeBackup.overflowY;
      node.style.resize = sizeBackup.resize;
      node.classList.remove('lk-input--autosize');
      if (!node.getAttribute('style')) node.removeAttribute('style');
    }
    node.classList.remove('lk-input', 'lk-input--error', 'lk-input--affixed');
    if (!node.getAttribute('class')) node.removeAttribute('class');
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
 * @param {Function} [opts.onChange] — (checked, { source: 'change', component, event }) when the user toggles it
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

  const tx = bindText('checkbox', opts.text);
  exposeText(comp, tx);
  const unbindGuard = bindCheckableGuard(comp, node, opts, {
    revert: () => { node.checked = !node.checked; },
    replace: (v) => { node.checked = v; },
  });
  const validation = attachCheckableValidation(comp, node, field, opts, tx);
  const unbindChange = bindChangeCallbacks(comp, node, opts, () => node.checked);

  comp.destroy = function () {
    unbindChange();
    unbindGuard();
    tx.destroy();
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
 * @param {Function} [opts.onChange] — (value, { source: 'change', component, event }) when the user selects this radio
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

  const tx = bindText('radio', opts.text);
  exposeText(comp, tx);
  // A radio validates its whole group (same name, same form): the value is the checked one
  const group = () => radioGroup(node);
  // beforeChange(value, …): a veto re-checks the radio that was selected before (tracked per group)
  let lastChecked = group().find((r) => r.checked && r !== node) || (node.checked ? node : null);
  const trackGroup = () => { const c = group().find((r) => r.checked); if (c) lastChecked = c; };
  const groupEls = group();
  const onGroupChange = (event) => { if (event.target !== node) trackGroup(); };
  groupEls.forEach((r) => r.addEventListener('change', onGroupChange));
  const unbindGuard = bindCheckableGuard(comp, node, opts, {
    revert: () => {
      if (lastChecked && lastChecked !== node && lastChecked.isConnected) lastChecked.checked = true;
      else node.checked = false;
    },
    replace: (v) => { node.checked = v; },
  });
  const onAllowed = () => { lastChecked = node.checked ? node : lastChecked; };
  node.addEventListener('change', onAllowed);
  const validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => group().find((r) => r.checked)?.value ?? null,
    label: field.getLabel,
    labels: () => field.labels,
    required: () => group().some((r) => r.required),
    requiredMessage: () => tx.t('required'),
    roots: () => group().map((r) => r.closest('.lk-field') || r),
    changeTargets: group(),
    setError: field.setError,
    clearError: field.clearError,
  });

  const unbindChange = bindChangeCallbacks(comp, node, opts, () => node.value);

  comp.destroy = function () {
    unbindChange();
    unbindGuard();
    node.removeEventListener('change', onAllowed);
    groupEls.forEach((r) => r.removeEventListener('change', onGroupChange));
    tx.destroy();
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
 * @param {Function} [opts.onChange] — (checked, { source: 'change', component, event }) when the user toggles it
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

  const tx = bindText('switch', opts.text);
  exposeText(comp, tx);
  const unbindGuard = bindCheckableGuard(comp, node, opts, {
    revert: () => { node.checked = !node.checked; node.setAttribute('aria-checked', String(node.checked)); },
    replace: (v) => { node.checked = v; },
  });
  const validation = attachCheckableValidation(comp, node, field, opts, tx);
  const unbindChange = bindChangeCallbacks(comp, node, opts, () => node.checked);

  comp.destroy = function () {
    unbindChange();
    unbindGuard();
    tx.destroy();
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


