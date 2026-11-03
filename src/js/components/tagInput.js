// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// TagInput component — type-and-Enter tag field (chips inside a textbox), optional suggestions

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkChip } from './chip.js';
import { lkAutocomplete } from './autocomplete.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';

lkI18n.define('taginput', {
  label: 'Tags',
  placeholder: 'Add a tag…',
  maxReached: { one: 'Maximum of {count} tag', other: 'Maximum of {count} tags' },
  duplicate: '“{tag}” is already added',
  invalid: '“{tag}” is not a valid tag',
  minLength: { one: 'A tag needs at least {count} character', other: 'A tag needs at least {count} characters' },
  maxLength: { one: 'A tag can have at most {count} character', other: 'A tag can have at most {count} characters' },
  added: 'Added {tag}',
  removed: 'Removed {tag}',
  required: 'Add at least one tag',
});

const ATTRS = ['placeholder', 'name', 'class', 'required', 'readonly', 'disabled', 'autocomplete'];

/**
 * Enhance a text input into a tag field: typed text becomes removable chips.
 *
 *   const tags = Look.lkTagInput('#skills', {
 *     name: 'skills',                 // one hidden input per tag
 *     maxTags: 5,
 *     validateTag: (t) => /^[\w-]+$/.test(t) || 'Letters, digits and dashes only',
 *     source: ['javascript', 'typescript', 'rust'],   // optional suggestions (lkAutocomplete)
 *     onChange(value, { source, added, removed }) {},
 *   });
 *   tags.value;   // string[]
 *
 * Enter and comma add the typed text (`separators`); pasting text with separators / new lines adds every piece.
 * Backspace in the empty input selects the last tag (highlighted); a second Backspace removes it.
 * A rejected tag (duplicate, too short / long, `validateTag`, `maxTags`) is not added: an inline message shows for a few
 * seconds and `onReject` fires. The original input stays the typing field (same id / label); its own value is not posted.
 *
 * @param {Element|string} el — <input> element (or selector); its value (comma separated) becomes the initial tags
 * @param {Object} [opts]
 * @param {string[]} [opts.value]            — initial tags (alias `tags`)
 * @param {string[]} [opts.separators=['Enter', ',']] — keys that add the typed text: 'Enter', 'Tab' or any single character (' ', ';', …)
 * @param {boolean}  [opts.addOnBlur=false]  — add the pending text when the input loses focus
 * @param {number}   [opts.maxTags]          — most tags
 * @param {boolean}  [opts.allowDuplicates=false]
 * @param {boolean}  [opts.caseSensitive=false] — duplicate check is case-insensitive by default
 * @param {number}   [opts.minLength] [opts.maxLength] — characters per tag
 * @param {Function} [opts.validateTag]      — (tag) => true | false | 'message' (sync)
 * @param {Function} [opts.transform]        — (tag) => string, e.g. lower-case / strip '#'; an empty result drops the tag
 * @param {string}   [opts.name]             — name of the hidden inputs (one per tag); default: the input's own name
 * @param {string}   [opts.placeholder]      — shown while there are no tags (default: the input's attribute, else the text 'taginput.placeholder')
 * @param {string}   [opts.chipColor]        — chip color (primary | secondary | accent | positive | warning | negative | info)
 * @param {number}   [opts.messageDuration=3000] — ms the inline rejection message stays
 * @param {Array|Object|Function} [opts.source] — suggestions, same shapes as lkAutocomplete; picking one adds it as a tag
 * @param {Object}   [opts.autocomplete]     — extra lkAutocomplete options (delay, minChars, limit, template, textField, …)
 * @param {string}   [opts.label] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Array}    [opts.rules] [opts.validate] [opts.validateDebounce] — see validation; array rules (minLength / maxLength) count tags
 * @param {Object}   [opts.text]             — text overrides (see Look.i18n keys 'taginput.*')
 * @param {Function} [opts.onChange] — (value, { source, component, added, removed }); source 'add' | 'paste' | 'remove' | 'clear' | 'api'
 * @param {Function} [opts.onReject] — (rejected, { component }); rejected = [{ tag, reason: 'duplicate'|'max'|'minLength'|'maxLength'|'invalid', message }]; return false to skip the inline message
 * @param {Function} [opts.beforeAdd]    — (tags, { source, component }) => false | Promise | string[] — veto or replace the incoming tags (before the checks)
 * @param {Function} [opts.beforeRemove] — (tags, { source, component }) => false | Promise | string[] — veto or narrow the removal
 * @returns {Object}
 */
export function lkTagInput(el, opts = {}) {
  const node = resolveEl(el, 'lkTagInput');
  if (node.tagName !== 'INPUT') throw new Error('Look.lkTagInput: element must be an <input>');

  const dense = !!opts.dense;
  const separators = Array.isArray(opts.separators) ? opts.separators.map(String) : (typeof opts.separators === 'string' ? [opts.separators] : ['Enter', ',']);
  const sepChars = separators.filter((s) => s.length === 1);
  const maxTags = Number.isFinite(opts.maxTags) && opts.maxTags > 0 ? opts.maxTags : Infinity;
  const minLen = Number.isFinite(opts.minLength) ? opts.minLength : 0;
  const maxLen = Number.isFinite(opts.maxLength) ? opts.maxLength : 0;
  const allowDuplicates = !!opts.allowDuplicates;
  const caseSensitive = !!opts.caseSensitive;
  const msgMs = Number.isFinite(opts.messageDuration) ? opts.messageDuration : 3000;

  const original = { attrs: {}, value: node.value, requiredAttr: node.required };
  ATTRS.forEach((a) => { original.attrs[a] = node.getAttribute(a); });

  // The typing input must not block a form submit when tags exist: `required` is tracked on a plain object
  const reqState = { required: node.required };
  node.required = false;
  const hiddenName = { value: opts.name ?? node.getAttribute('name') ?? '' };

  const field = wrapField(node, {
    label: opts.label,
    required: opts.required ?? opts.mandatory,
    requiredMark: opts.requiredMark,
    readonly: opts.readonly,
    requiredTarget: reqState,
  });

  const comp = {};
  let destroyed = false;
  let validation = null;
  let list = [];
  let pendingIdx = -1;
  let msgTimer = null;
  const chips = [];
  const hiddens = [];

  const tx = bindText('taginput', opts.text, () => { if (!destroyed) { render(); hideMessage(); } });

  // --- DOM -------------------------------------------------------------------

  const root = createElement('div', { class: `lk-taginput${dense ? ' lk-taginput--dense' : ''}` });
  const control = createElement('div', { class: `lk-input lk-taginput__control${dense ? ' lk-input--dense' : ''}`, role: 'group' });
  const msgEl = createElement('div', { class: 'lk-taginput__message', role: 'status' });
  const liveEl = createElement('span', { class: 'lk-sr-only', role: 'status', 'aria-live': 'polite' });
  msgEl.hidden = true;
  root.append(control, msgEl, liveEl);
  node.parentNode.insertBefore(root, node);
  control.appendChild(node);

  node.classList.add('lk-taginput__input');
  node.removeAttribute('name');
  node.value = '';
  node.setAttribute('autocomplete', 'off');
  if (opts.disabled) node.disabled = true;

  const canEdit = () => !destroyed && !node.disabled && !node.readOnly;

  // --- Rendering -----------------------------------------------------------------

  function placeholderText() {
    if (list.length) return '';
    return opts.placeholder ?? original.attrs.placeholder ?? tx.t('placeholder');
  }

  function render() {
    chips.splice(0).forEach((c) => { const e = c.el; c.destroy(); e.remove(); });
    pendingIdx = -1;
    list.forEach((tag, i) => {
      const span = createElement('span', { class: 'lk-taginput__chip', title: tag });
      control.insertBefore(span, node);
      chips.push(lkChip(span, {
        label: tag,
        dense: true,
        color: opts.chipColor,
        removable: canEdit(),
        onRemove() {
          removeAt([i], 'remove');
          node.focus();
          return false; // render() rebuilds the chips
        },
      }));
    });
    node.placeholder = placeholderText();
    control.setAttribute('aria-label', field.getLabel() || tx.t('label'));
    root.classList.toggle('lk-taginput--filled', list.length > 0);
    root.classList.toggle('lk-taginput--full', list.length >= maxTags);
  }

  function syncHidden() {
    hiddens.splice(0).forEach((h) => h.remove());
    if (!hiddenName.value) return;
    list.forEach((tag) => {
      const h = createElement('input', { type: 'hidden', name: hiddenName.value });
      h.value = tag;
      h.disabled = node.disabled;
      root.appendChild(h);
      hiddens.push(h);
    });
  }

  function setPending(i) {
    pendingIdx = i;
    chips.forEach((c, idx) => c.el.classList.toggle('lk-taginput__chip--pending', idx === i));
  }

  function showMessage(text) {
    clearTimeout(msgTimer);
    msgEl.textContent = text;
    msgEl.hidden = !text;
    root.classList.toggle('lk-taginput--message', !!text);
    if (text && msgMs > 0) msgTimer = setTimeout(hideMessage, msgMs);
  }
  function hideMessage() {
    clearTimeout(msgTimer);
    msgTimer = null;
    msgEl.textContent = '';
    msgEl.hidden = true;
    root.classList.remove('lk-taginput--message');
  }

  // --- Tags ------------------------------------------------------------------------

  const same = (a, b) => (caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase());

  // Pure: which of `raw` can be added to the current list, which are rejected and why
  function collect(raw) {
    const accepted = [];
    const rejected = [];
    for (const item of raw) {
      let tag = item;
      if (typeof opts.transform === 'function') tag = opts.transform(tag);
      tag = tag == null ? '' : String(tag).trim();
      if (!tag) continue;
      const reject = (reason, message) => rejected.push({ tag, reason, message });
      if (!allowDuplicates && (list.some((t) => same(t, tag)) || accepted.some((t) => same(t, tag)))) {
        reject('duplicate', tx.t('duplicate', { tag }));
      } else if (minLen && tag.length < minLen) {
        reject('minLength', tx.t('minLength', { count: minLen, tag }));
      } else if (maxLen && tag.length > maxLen) {
        reject('maxLength', tx.t('maxLength', { count: maxLen, tag }));
      } else {
        const v = typeof opts.validateTag === 'function' ? opts.validateTag(tag) : true;
        if (v === false || (typeof v === 'string' && v)) reject('invalid', typeof v === 'string' ? v : tx.t('invalid', { tag }));
        else if (list.length + accepted.length >= maxTags) reject('max', tx.t('maxReached', { count: maxTags }));
        else accepted.push(tag);
      }
    }
    return { accepted, rejected };
  }

  function emitChange(src, added, removed) {
    syncHidden();
    render();
    validation?.changed();
    if (typeof opts.onChange === 'function') opts.onChange(list.slice(), { source: src, component: comp, added, removed });
  }

  // Tags arrive (typing, paste, API): beforeAdd can veto or replace them, then each tag is checked
  function addTags(raw, src, clearInput) {
    if (!canEdit()) return;
    const incoming = raw.map((s) => String(s).trim()).filter(Boolean);
    if (!incoming.length) return;
    guard(root, opts, 'add', incoming, { source: src, component: comp }, (picked) => {
      const arr = Array.isArray(picked) ? picked : incoming;
      const { accepted, rejected } = collect(arr);
      if (accepted.length) {
        list = list.concat(accepted);
        if (clearInput) node.value = '';
        hideMessage();
        liveEl.textContent = tx.t('added', { tag: accepted.join(', ') });
        emitChange(src, accepted, []);
      }
      if (rejected.length) {
        const handled = typeof opts.onReject === 'function' && opts.onReject(rejected, { component: comp }) === false;
        if (!handled) showMessage(rejected[0].message);
      }
    });
  }

  // Remove by index: beforeRemove can veto or narrow
  function removeAt(indexes, src) {
    if (!canEdit()) return;
    const idx = indexes.filter((i) => i >= 0 && i < list.length);
    if (!idx.length) return;
    const tags = idx.map((i) => list[i]);
    guard(root, opts, 'remove', tags, { source: src, component: comp }, (picked) => {
      const keep = Array.isArray(picked) ? new Set(picked.map(String)) : null;
      const gone = idx.filter((i) => !keep || keep.has(list[i]));
      if (!gone.length) return;
      const removed = gone.map((i) => list[i]);
      list = list.filter((_, i) => !gone.includes(i));
      liveEl.textContent = tx.t('removed', { tag: removed.join(', ') });
      emitChange(src, [], removed);
    });
  }

  // --- Events ----------------------------------------------------------------------

  function splitBy(text, chars) {
    const out = [];
    let cur = '';
    for (const ch of text) {
      if (chars.includes(ch)) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function onKeydown(e) {
    if (e.defaultPrevented || e.isComposing || !canEdit()) return; // the suggestion list may have taken Enter
    const k = e.key;

    if (k === 'Backspace' && node.value === '' && list.length) {
      e.preventDefault();
      if (pendingIdx === list.length - 1) {
        const i = pendingIdx;
        pendingIdx = -1;
        removeAt([i], 'remove');
      } else {
        setPending(list.length - 1);
      }
      return;
    }
    if (pendingIdx >= 0 && !['Shift', 'Control', 'Alt', 'Meta'].includes(k)) setPending(-1);

    if (separators.includes(k)) {
      const text = node.value.trim();
      if (!text) {
        if (k !== 'Enter' && k !== 'Tab') e.preventDefault(); // no empty tags from a lone separator
        return;
      }
      e.preventDefault();
      addTags([text], 'add', true);
    }
  }

  // Soft keyboards report key 'Unidentified': a separator character that still lands in the text splits it
  function onInput() {
    if (!canEdit()) return;
    if (pendingIdx >= 0) setPending(-1);
    if (!sepChars.length || !sepChars.some((c) => node.value.includes(c))) return;
    const parts = splitBy(node.value, sepChars);
    node.value = parts.pop();
    addTags(parts, 'add', false);
  }

  function onPaste(e) {
    if (!canEdit()) return;
    const text = e.clipboardData ? e.clipboardData.getData('text') : '';
    const chars = sepChars.concat(['\n', '\r'], separators.includes('Tab') ? ['\t'] : []);
    if (!text || !chars.some((c) => text.includes(c))) return; // a single token pastes natively
    e.preventDefault();
    addTags(splitBy(text, chars), 'paste', false);
  }

  function onBlur() {
    if (pendingIdx >= 0) setPending(-1);
    if (opts.addOnBlur && canEdit()) {
      const text = node.value.trim();
      if (text) addTags([text], 'add', true);
    }
  }

  function onControlMouseDown(e) {
    if (e.target !== control && e.target !== root) return;
    e.preventDefault();
    if (canEdit()) node.focus();
  }

  function onFormReset() {
    setTimeout(() => { if (!destroyed) { list = []; render(); syncHidden(); validation?.clearValidation(); } }, 0);
  }

  // Suggestions: the autocomplete is created first so its Enter handler runs before ours
  let ac = null;
  if (opts.source != null) {
    ac = lkAutocomplete(node, {
      minChars: 1,
      ...(opts.autocomplete || {}),
      source: opts.source,
      text: opts.text,
      dense,
      embedded: true,
      anchor: control,
      onChange(value, ctx) {
        if (ctx.source !== 'select') return;
        ctx.component.value = '';
        addTags([value], 'add', false);
      },
    });
  }

  node.addEventListener('keydown', onKeydown);
  node.addEventListener('input', onInput);
  node.addEventListener('paste', onPaste);
  node.addEventListener('blur', onBlur);
  control.addEventListener('mousedown', onControlMouseDown);
  const form = node.form;
  form?.addEventListener('reset', onFormReset);

  // --- Initial tags --------------------------------------------------------------------

  const initial = opts.value ?? opts.tags ?? splitBy(original.value, [','].concat(sepChars));
  list = collect(Array.isArray(initial) ? initial : []).accepted;
  render();
  syncHidden();

  // --- Public API ----------------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || root });

  function setDisabled(v) {
    node.disabled = !!v;
    root.classList.toggle('lk-taginput--disabled', !!v);
    hiddens.forEach((h) => { h.disabled = !!v; });
    render();
  }
  function setReadonly(v) {
    node.readOnly = !!v;
    root.classList.toggle('lk-taginput--readonly', !!v);
    control.setAttribute('aria-readonly', String(!!v));
    render();
  }

  const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : String(v).split(',')).map((s) => String(s).trim()).filter(Boolean);
  const valueProp = {
    get() { return list.slice(); },
    set(v) { list = asList(v); setPending(-1); syncHidden(); render(); },
    enumerable: true,
  };

  Object.defineProperties(comp, {
    value: valueProp,
    tags: valueProp,
    inputValue: { get() { return node.value; }, set(v) { node.value = v == null ? '' : String(v); }, enumerable: true },
    count: { get() { return list.length; }, enumerable: true },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true },
    name: { get() { return hiddenName.value; }, set(v) { hiddenName.value = v || ''; syncHidden(); }, enumerable: true },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); render(); }, enumerable: true },
    labels: { get() { return field.labels; }, enumerable: true },
    required: { get() { return reqState.required; }, set(v) { field.setRequired(v); }, enumerable: true },
    mandatory: { get() { return reqState.required; }, set(v) { field.setRequired(v); } },
    readonly: { get() { return node.readOnly; }, set: setReadonly, enumerable: true },
    disabled: { get() { return node.disabled; }, set: setDisabled, enumerable: true },
    rootEl: { value: root, enumerable: true },
    controlEl: { value: control, enumerable: true },
    autocomplete: { value: ac, enumerable: true },
  });
  Object.defineProperty(comp, 'enabled', {
    get() { return !node.disabled; },
    set(v) { setDisabled(!v); },
    enumerable: true,
    configurable: true,
  });

  comp.setError = (message) => { field.setError(message); control.classList.add('lk-input--error'); root.classList.add('lk-taginput--error'); };
  comp.clearError = () => { field.clearError(); control.classList.remove('lk-input--error'); root.classList.remove('lk-taginput--error'); };
  comp.refreshLabels = () => { field.refreshLabels(); render(); };
  comp.focus = (o) => node.focus(o);
  /** Adds tags through the same checks as typing; fires onChange with source 'api'. */
  comp.add = (tags) => addTags(Array.isArray(tags) ? tags : [tags], 'api', false);
  /** Removes a tag by text or index. */
  comp.remove = (target) => {
    const i = typeof target === 'number' ? target : list.findIndex((t) => same(t, String(target)));
    if (i >= 0) removeAt([i], 'api');
  };
  comp.clear = () => removeAt(list.map((_, i) => i), 'clear');

  if (opts.readonly) setReadonly(true);
  if (opts.disabled || node.disabled) setDisabled(true);

  validation = attachValidation(comp, {
    opts,
    getValue: () => list.slice(),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => reqState.required,
    requiredMessage: () => tx.t('required'),
    t: tx.tf,
    roots: () => [field.wrapper || root],
    setError: comp.setError,
    clearError: comp.clearError,
  });

  comp.destroy = function () {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(msgTimer);
    tx.destroy();
    validation.destroy();
    ac?.destroy();
    node.removeEventListener('keydown', onKeydown);
    node.removeEventListener('input', onInput);
    node.removeEventListener('paste', onPaste);
    node.removeEventListener('blur', onBlur);
    control.removeEventListener('mousedown', onControlMouseDown);
    form?.removeEventListener('reset', onFormReset);
    chips.splice(0).forEach((c) => c.destroy());
    hiddens.splice(0).forEach((h) => h.remove());
    root.parentNode.insertBefore(node, root);
    root.remove();
    comp.clearError();
    ATTRS.forEach((a) => {
      const v = original.attrs[a];
      if (v == null) node.removeAttribute(a); else node.setAttribute(a, v);
    });
    node.value = original.value;
    node.required = original.requiredAttr;
    field.destroyField();
  };

  return comp;
}
