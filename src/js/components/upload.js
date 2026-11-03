// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Upload component — enhances <input type="file"> (field or drag-and-drop box)

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';
import { lkChip } from './chip.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';

lkI18n.define('upload', {
  label: 'Upload',
  'placeholder.single': 'Choose a file…',
  'placeholder.multiple': 'Choose files…',
  'box.single': 'Drag & drop a file here or click to browse',
  'box.multiple': 'Drag & drop files here or click to browse',
  'hint.maxSize': 'max {size}',
  'hint.maxSizeEach': 'max {size} each',
  summary: { one: '{count} file · {size}', other: '{count} files · {size}' },
  remove: 'Remove {name}',
  'required.single': 'Select a file',
  'required.multiple': 'Select at least one file',
  'error.type': '{name}: this file type is not allowed',
  'error.size': '{name} is larger than {max}',
  'error.count.single': 'Only one file can be selected',
  'error.count.max': { one: 'You can upload up to {count} file', other: 'You can upload up to {count} files' },
  'error.more': '{message} (+{count} more)',
  'unit.b': 'B',
  'unit.kb': 'KB',
  'unit.mb': 'MB',
  'unit.gb': 'GB',
});

const UNITS = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

/** 5242880 | '5MB' | '1.5 GB' | '500k' -> bytes (null when unset/invalid). */
export function parseSize(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmg]?)b?\s*$/i.exec(String(v));
  return m ? Math.round(parseFloat(m[1]) * UNITS[m[2].toLowerCase()]) : null;
}

/**
 * 1536 -> '1.5 KB'
 * @param {number} n
 * @param {{ units?: string[], locale?: string }} [o] — units [B, KB, MB, GB]; locale for the number format
 */
export function formatBytes(n, o = {}) {
  if (!Number.isFinite(n) || n < 0) return '';
  const units = o.units || ['B', 'KB', 'MB', 'GB'];
  const num = (v, max) => {
    try { return v.toLocaleString(o.locale, { maximumFractionDigits: max }); } catch { return String(v); }
  };
  if (n < 1024) return `${num(n, 0)} ${units[0]}`;
  let v = n / 1024;
  let i = 1;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${num(v, v >= 10 ? 0 : 1)} ${units[i]}`;
}

// '.pdf', 'image/*', 'application/pdf' (same syntax as the native accept attribute)
function acceptMatcher(accept) {
  const rules = String(accept || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return null;
  return (file) => {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return rules.some((r) => (r.startsWith('.') ? name.endsWith(r)
      : r.endsWith('/*') ? type.startsWith(r.slice(0, -1))
        : type === r));
  };
}

const sameFile = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
const fileIcon = (f) => ((f.type || '').startsWith('image/') ? 'image' : 'file');

function msg(v, file, fallback) {
  const out = typeof v === 'function' ? v(file) : v;
  return out == null ? fallback : String(out);
}

/**
 * Enhance an <input type="file">.
 *
 *   const up = Look.lkUpload('#cv', { mode: 'box', accept: '.pdf,.docx', maxSize: '5MB', rules: ['required'] });
 *   up.value        // File | null   (File[] when multiple)
 *
 * Modes: "field" looks like a textbox: selected file names are chips and an upload icon sits at the end.
 * "box" is a drag-and-drop / click area; one file shows inside the box, many files are listed below it
 * (icon, name, size) in a collapsible list. Both accept drops. In multiple mode new selections are added
 * to the current ones (chips / rows have a remove button); a single-file input replaces.
 *
 * Files that fail accept, maxSize or maxFiles are not added: the field shows the message
 * (via setValidation) and onReject fires. Validation options (rules, validate, required,
 * label, ...) work like every form component; rules receive the File array (so minLength /
 * maxLength count files).
 *
 * @param {Element|string} el — <input type="file"> element or selector
 * @param {Object} [opts]
 * @param {'field'|'box'} [opts.mode='field']
 * @param {string}  [opts.accept]        — native accept syntax: '.pdf,image/*' (default: the input's attribute)
 * @param {number|string} [opts.maxSize] — per file: bytes or '5MB' (default: data-max-size)
 * @param {boolean} [opts.multiple]      — alias multi (default: the input's attribute)
 * @param {number}  [opts.maxFiles]      — max files in multiple mode
 * @param {string}  [opts.label] [opts.name] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {string}  [opts.placeholder]   — empty text (field: 'Choose a file…', box: 'Drag & drop a file here or click to browse')
 * @param {string|false} [opts.hint]     — box helper line (default built from accept/maxSize; false hides it)
 * @param {boolean} [opts.listCollapsed] — box + multiple: start with the file list collapsed
 * @param {boolean} [opts.listCollapsible=true]
 * @param {Object}  [opts.messages]      — { type, size, count }: string or (file) => string
 * @param {Array}   [opts.rules] [opts.validate] [opts.validateDebounce] — see validation
 * @param {Function} [opts.onChange]  — (value, { source, component, added, removed }); source 'select' | 'drop' | 'remove' | 'clear' | 'api'
 * @param {Function} [opts.onReject]  — (rejected, { component }); rejected = [{ file, reason: 'type'|'size'|'count', message }]; return false to skip the default error message
 * @param {Object}  [opts.text]       — text overrides (see Look.i18n keys 'upload.*'): { 'placeholder.single': '…', 'summary': { one, other } }
 * @param {Function} [opts.beforeAdd]    — (files, { source, component }) => false | Promise | File[] — veto or replace the incoming files
 * @param {Function} [opts.beforeRemove] — (files, { source, component }) => false | Promise | File[] — veto or narrow the removal
 * @param {Function} [opts.beforeBrowse] — ({ source, component }) => false — veto opening the file dialog (sync only)
 * @returns {Object}
 */
export function lkUpload(el, opts = {}) {
  const node = resolveEl(el, 'lkUpload');
  if (node.type !== 'file') throw new Error('Look.lkUpload: element must be an <input type="file">');

  const mode = opts.mode === 'box' ? 'box' : 'field';
  const dense = !!opts.dense;
  const multiple = !!(opts.multiple ?? opts.multi ?? node.multiple);
  let acceptStr = opts.accept ?? node.getAttribute('accept') ?? '';
  let matchAccept = acceptMatcher(acceptStr);
  let maxSize = parseSize(opts.maxSize ?? node.dataset.maxSize);
  const maxFiles = Number.isFinite(opts.maxFiles) ? opts.maxFiles : Infinity;
  const messages = opts.messages || {};

  const original = {
    accept: node.getAttribute('accept'),
    multiple: node.hasAttribute('multiple'),
    tabindex: node.getAttribute('tabindex'),
    ariaHidden: node.getAttribute('aria-hidden'),
  };
  if (acceptStr) node.setAttribute('accept', acceptStr);
  node.multiple = multiple;
  node.tabIndex = -1;
  node.setAttribute('aria-hidden', 'true');
  node.classList.add('lk-upload__input');

  const field = wrapField(node, {
    label: opts.label,
    name: opts.name,
    required: opts.required ?? opts.mandatory,
    requiredMark: opts.requiredMark,
  });

  const tx = bindText('upload', opts.text, () => { if (typeof render === 'function') render(); });
  const fmt = (n) => formatBytes(n, { locale: lkI18n.locale, units: ['b', 'kb', 'mb', 'gb'].map((u) => tx.t(`unit.${u}`)) });

  let list = [];
  let readonly = !!opts.readonly;
  let listOpen = !opts.listCollapsed;
  const chips = [];
  const comp = {};
  let validation = null;

  // --- DOM -------------------------------------------------------------------

  const root = createElement('div', { class: `lk-upload lk-upload--${mode}${dense ? ' lk-upload--dense' : ''}` });
  const trigger = createElement('div', { role: 'button', tabindex: '0' });
  let summaryBtn = null;
  let summaryText = null;
  let listWrap = null;
  let listEl = null;

  trigger.className = mode === 'field'
    ? `lk-input lk-upload__control${dense ? ' lk-input--dense' : ''}`
    : 'lk-upload__drop';
  root.appendChild(trigger);

  if (mode === 'box' && multiple) {
    summaryBtn = createElement('button', { type: 'button', class: 'lk-upload__summary' });
    summaryText = createElement('span', { class: 'lk-upload__summary-text' });
    summaryBtn.append(summaryText);
    if (opts.listCollapsible !== false) {
      const chev = createElement('span', { class: 'lk-upload__chevron' });
      chev.appendChild(lkIcon('chevron-down'));
      summaryBtn.appendChild(chev);
    } else {
      summaryBtn.disabled = true;
    }
    listWrap = createElement('div', { class: 'lk-collapse lk-upload__listwrap' });
    const inner = createElement('div', { class: 'lk-collapse__inner' });
    listEl = createElement('ul', { class: 'lk-upload__list' });
    inner.appendChild(listEl);
    listWrap.appendChild(inner);
    listWrap.id = `lk-upload-list-${Math.random().toString(36).slice(2, 8)}`;
    summaryBtn.setAttribute('aria-controls', listWrap.id);
    root.append(summaryBtn, listWrap);
  }

  node.parentNode.insertBefore(root, node);

  // --- State helpers ---------------------------------------------------------

  const isEnabled = () => !node.disabled;
  const canEdit = () => isEnabled() && !readonly;

  function value() { return multiple ? list.slice() : (list[0] ?? null); }

  function syncNative() {
    try {
      const dt = new DataTransfer();
      list.forEach((f) => dt.items.add(f));
      node.files = dt.files;
    } catch { /* DataTransfer constructor unavailable: the input keeps the last native selection */ }
  }

  function defaultHint() {
    const parts = [];
    if (acceptStr) parts.push(acceptStr.split(',').map((s) => s.trim()).filter(Boolean).join(', '));
    if (maxSize) parts.push(tx.t(multiple ? 'hint.maxSizeEach' : 'hint.maxSize', { size: fmt(maxSize) }));
    return parts.join(' · ');
  }

  function removeButton(file) {
    const btn = createElement('button', { type: 'button', class: 'lk-upload__remove', 'aria-label': tx.t('remove', { name: file.name }) });
    btn.appendChild(lkIcon('close', { size: 'sm' }));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!canEdit()) return;
      removeFiles([file], 'remove');
      trigger.focus();
    });
    return btn;
  }

  function fileRow(file, tag, className, iconSize) {
    const row = createElement(tag, { class: className });
    const name = createElement('span', { class: 'lk-upload__name', title: file.name }, file.name);
    const size = createElement('span', { class: 'lk-upload__size' }, fmt(file.size));
    row.append(lkIcon(fileIcon(file), iconSize ? { size: iconSize } : {}), name, size, removeButton(file));
    return row;
  }

  function renderField() {
    chips.splice(0).forEach((c) => c.destroy());
    const wrap = createElement('div', { class: 'lk-upload__chips' });
    if (!list.length) {
      wrap.appendChild(createElement('span', { class: 'lk-upload__placeholder' }, opts.placeholder ?? tx.t(multiple ? 'placeholder.multiple' : 'placeholder.single')));
    }
    list.forEach((file) => {
      const span = createElement('span', { title: `${file.name} (${fmt(file.size)})` });
      wrap.appendChild(span);
      chips.push(lkChip(span, {
        label: file.name,
        icon: fileIcon(file),
        dense: true,
        removable: canEdit(),
        removeLabel: tx.tf('common.remove'),
        onRemove() {
          removeFiles([file], 'remove');
          return false; // render() rebuilds the chips
        },
      }));
    });
    const icon = createElement('span', { class: 'lk-upload__icon' });
    icon.appendChild(lkIcon('upload'));
    trigger.replaceChildren(wrap, icon);
  }

  function renderBox() {
    const parts = [];
    if (!multiple && list[0]) {
      parts.push(fileRow(list[0], 'div', 'lk-upload__file', 'lg'));
    } else {
      const icon = createElement('span', { class: 'lk-upload__icon' });
      icon.appendChild(lkIcon('upload', { size: 'xl' }));
      parts.push(icon);
      parts.push(createElement('span', { class: 'lk-upload__title' }, opts.placeholder ?? tx.t(multiple ? 'box.multiple' : 'box.single')));
      const hint = opts.hint === undefined ? defaultHint() : opts.hint;
      if (hint) parts.push(createElement('span', { class: 'lk-upload__hint' }, hint));
    }
    trigger.replaceChildren(...parts);

    if (listEl) {
      listEl.replaceChildren(...list.map((f) => fileRow(f, 'li', 'lk-upload__item')));
      const total = list.reduce((n, f) => n + f.size, 0);
      summaryText.textContent = list.length ? tx.t('summary', { count: list.length, size: fmt(total) }) : '';
      summaryBtn.hidden = !list.length;
      listWrap.hidden = !list.length;
      paintList();
    }
  }

  function paintList() {
    if (!listEl) return;
    summaryBtn.setAttribute('aria-expanded', String(listOpen));
    listWrap.classList.toggle('lk-collapse--open', listOpen);
  }

  function render() {
    if (mode === 'field') renderField(); else renderBox();
    trigger.setAttribute('aria-label', [field.getLabel() || opts.ariaLabel || tx.t('label'), list.length ? list.map((f) => f.name).join(', ') : ''].filter(Boolean).join(': '));
    root.classList.toggle('lk-upload--filled', list.length > 0);
  }

  // --- Selection ---------------------------------------------------------------

  function commit(next, source, added, removed) {
    list = next;
    syncNative();
    render();
    validation?.changed();
    if (typeof opts.onChange === 'function') opts.onChange(value(), { source, component: comp, added, removed });
  }

  // Files arrive (dialog, drop, add()): beforeAdd can veto or replace the list, then each file is checked
  function takeFiles(incoming, source) {
    if (!canEdit()) return;
    const outcome = guard(root, opts, 'add', Array.from(incoming), { source, component: comp }, (files) => {
      processFiles(Array.isArray(files) ? files.filter((f) => f instanceof File) : [], source);
    });
    // A vetoed native pick must not leave its files in the input
    const restore = (ok) => { if (ok === false) syncNative(); };
    if (outcome && typeof outcome.then === 'function') outcome.then(restore); else restore(outcome);
  }

  function processFiles(files, source) {
    const added = [];
    const rejected = [];
    const reject = (file, reason, fallback) => rejected.push({ file, reason, message: msg(messages[reason], file, fallback) });

    for (const file of files) {
      if (!multiple && added.length) reject(file, 'count', tx.t('error.count.single'));
      else if (matchAccept && !matchAccept(file)) reject(file, 'type', tx.t('error.type', { name: file.name }));
      else if (maxSize && file.size > maxSize) reject(file, 'size', tx.t('error.size', { name: file.name, max: fmt(maxSize) }));
      else if (multiple && list.some((f) => sameFile(f, file))) continue;
      else if (multiple && list.length + added.length >= maxFiles) reject(file, 'count', tx.t('error.count.max', { count: maxFiles }));
      else added.push(file);
    }

    if (added.length) {
      const removed = multiple ? [] : list.slice();
      commit(multiple ? list.concat(added) : added, source, added, removed);
    } else {
      syncNative(); // a fully rejected native pick must not leave stray files in the input
    }

    if (rejected.length) {
      // onReject can return false to keep the default error message from showing (show your own)
      const handled = typeof opts.onReject === 'function' && opts.onReject(rejected, { component: comp }) === false;
      if (!handled) {
        const text = rejected.length > 1 ? tx.t('error.more', { message: rejected[0].message, count: rejected.length - 1 }) : rejected[0].message;
        comp.setValidation(text);
      }
    }
  }

  // Remove files (button, chip, API): beforeRemove can veto; a returned array narrows what is removed
  function removeFiles(files, source) {
    if (!canEdit() || !files.length) return;
    guard(root, opts, 'remove', files, { source, component: comp }, (picked) => {
      const gone = Array.isArray(picked) ? picked.filter((f) => list.includes(f)) : files;
      if (gone.length) commit(list.filter((f) => !gone.includes(f)), source, [], gone);
    });
  }

  // --- Events ------------------------------------------------------------------

  // beforeBrowse can veto (to show your own picker). It must answer synchronously: browsers only open the dialog inside the click.
  function browse() {
    if (!canEdit()) return;
    guard(root, opts, 'browse', undefined, { source: 'user', component: comp }, () => node.click());
  }

  function onTriggerClick(e) {
    if (e.target.closest('.lk-chip, .lk-upload__remove')) return;
    e.preventDefault(); // a wrapping <label> must not open the dialog a second time
    browse();
  }
  function onTriggerKey(e) {
    if (e.target !== trigger) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); }
  }
  function onNativeChange() {
    const picked = Array.from(node.files || []);
    if (!picked.length) { syncNative(); return; }
    takeFiles(picked, 'select');
  }

  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  function onDragEnter(e) {
    if (!hasFiles(e) || !canEdit()) return;
    e.preventDefault();
    dragDepth++;
    root.classList.add('lk-upload--dragover');
  }
  function onDragOver(e) {
    if (!hasFiles(e) || !canEdit()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) root.classList.remove('lk-upload--dragover');
  }
  function onDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    root.classList.remove('lk-upload--dragover');
    takeFiles(e.dataTransfer.files, 'drop');
  }
  function onSummaryClick() {
    if (opts.listCollapsible === false) return;
    listOpen = !listOpen;
    paintList();
  }
  function onFormReset() {
    setTimeout(() => { list = []; render(); validation?.clearValidation(); }, 0);
  }

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKey);
  node.addEventListener('change', onNativeChange);
  root.addEventListener('dragenter', onDragEnter);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('dragleave', onDragLeave);
  root.addEventListener('drop', onDrop);
  summaryBtn?.addEventListener('click', onSummaryClick);
  const form = node.form;
  form?.addEventListener('reset', onFormReset);

  // --- Public API --------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || root });

  function setDisabled(v) {
    node.disabled = !!v;
    root.classList.toggle('lk-upload--disabled', !!v);
    trigger.tabIndex = v ? -1 : 0;
    trigger.setAttribute('aria-disabled', String(!!v));
    render();
  }
  function setReadonly(v) {
    readonly = !!v;
    root.classList.toggle('lk-upload--readonly', readonly);
    trigger.setAttribute('aria-readonly', String(readonly));
    render();
  }

  function toFileList(v) {
    if (v == null) return [];
    if (v instanceof File) return [v];
    return Array.from(v).filter((f) => f instanceof File);
  }

  Object.defineProperties(comp, {
    value: {
      get: value,
      set(v) { const arr = toFileList(v); list = multiple ? arr : arr.slice(0, 1); syncNative(); render(); },
      enumerable: true,
    },
    files: { get() { return list.slice(); }, enumerable: true },
    multiple: { value: multiple, enumerable: true },
    mode: { value: mode, enumerable: true },
    accept: {
      get() { return acceptStr; },
      set(v) {
        acceptStr = String(v || '');
        matchAccept = acceptMatcher(acceptStr);
        if (acceptStr) node.setAttribute('accept', acceptStr); else node.removeAttribute('accept');
        render();
      },
      enumerable: true,
    },
    maxSize: { get() { return maxSize; }, set(v) { maxSize = parseSize(v); render(); }, enumerable: true },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true },
    name: { get() { return node.name; }, set(v) { node.name = v; }, enumerable: true },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); render(); }, enumerable: true },
    labels: { get() { return field.labels; }, enumerable: true },
    required: { get() { return node.required; }, set(v) { field.setRequired(v); }, enumerable: true },
    mandatory: { get() { return node.required; }, set(v) { field.setRequired(v); } },
    readonly: { get() { return readonly; }, set: setReadonly, enumerable: true },
    disabled: { get() { return node.disabled; }, set: setDisabled, enumerable: true },
    rootEl: { value: root, enumerable: true },
    triggerEl: { value: trigger, enumerable: true },
  });
  Object.defineProperty(comp, 'enabled', {
    get() { return isEnabled(); },
    set(v) { setDisabled(!v); },
    enumerable: true,
    configurable: true,
  });

  comp.setError = (message) => { field.setError(message); root.classList.add('lk-upload--error'); };
  comp.clearError = () => { field.clearError(); root.classList.remove('lk-upload--error'); };
  comp.refreshLabels = () => { field.refreshLabels(); render(); };
  comp.focus = (o) => trigger.focus(o);
  comp.browse = browse;
  comp.add = (files) => takeFiles(toFileList(files), 'api');
  comp.remove = (target) => {
    const file = typeof target === 'number' ? list[target] : target;
    if (!file || !list.includes(file)) return;
    removeFiles([file], 'api');
  };
  comp.clear = () => {
    removeFiles(list.slice(), 'clear');
  };
  comp.toggleList = (force) => {
    if (!listEl) return;
    listOpen = force == null ? !listOpen : !!force;
    paintList();
  };

  if (node.files?.length) list = multiple ? Array.from(node.files) : [node.files[0]];
  render();
  if (opts.disabled || node.disabled) setDisabled(true);
  if (readonly) setReadonly(true);

  validation = attachValidation(comp, {
    opts,
    getValue: () => list.slice(),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    requiredMessage: () => tx.t(multiple ? 'required.multiple' : 'required.single'),
    t: tx.tf,
    roots: () => [field.wrapper || root],
    setError: comp.setError,
    clearError: comp.clearError,
  });

  comp.destroy = function () {
    tx.destroy();
    validation.destroy();
    trigger.removeEventListener('click', onTriggerClick);
    trigger.removeEventListener('keydown', onTriggerKey);
    node.removeEventListener('change', onNativeChange);
    root.removeEventListener('dragenter', onDragEnter);
    root.removeEventListener('dragover', onDragOver);
    root.removeEventListener('dragleave', onDragLeave);
    root.removeEventListener('drop', onDrop);
    summaryBtn?.removeEventListener('click', onSummaryClick);
    form?.removeEventListener('reset', onFormReset);
    chips.splice(0).forEach((c) => c.destroy());
    root.remove();
    comp.clearError();
    node.classList.remove('lk-upload__input');
    const restore = (name, v) => (v == null ? node.removeAttribute(name) : node.setAttribute(name, v));
    restore('accept', original.accept);
    restore('tabindex', original.tabindex);
    restore('aria-hidden', original.ariaHidden);
    node.multiple = original.multiple;
    field.destroyField();
  };

  return comp;
}
