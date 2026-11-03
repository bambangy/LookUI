// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Autocomplete component — text input with a suggestion popup (ARIA combobox / listbox)

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkPopupProxy } from '../composables/popupProxy.js';

lkI18n.define('autocomplete', {
  label: 'Suggestions',
  results: { one: '{count} result', other: '{count} results' },
  error: 'Could not load suggestions',
});

let uidCounter = 0;

// Accent- and case-insensitive text for matching
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isThenable = (r) => r != null && typeof r.then === 'function';

const ATTRS = ['placeholder', 'role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-haspopup', 'aria-activedescendant', 'autocomplete', 'spellcheck'];

function isDataSource(src) {
  return !!src && typeof src === 'object' && !Array.isArray(src)
    && typeof src.setFilter === 'function' && typeof src.load === 'function';
}

// Text of `text` with the first occurrence of `query` wrapped in <mark>
function highlight(text, query) {
  const frag = document.createDocumentFragment();
  const q = String(query || '');
  if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
  let hay = fold(text);
  let needle = fold(q);
  if (hay.length !== text.length) { hay = text.toLowerCase(); needle = q.toLowerCase(); }
  const at = hay.indexOf(needle);
  if (at < 0 || !needle) { frag.appendChild(document.createTextNode(text)); return frag; }
  if (at > 0) frag.appendChild(document.createTextNode(text.slice(0, at)));
  const mark = document.createElement('mark');
  mark.className = 'lk-autocomplete__mark';
  mark.textContent = text.slice(at, at + needle.length);
  frag.appendChild(mark);
  if (at + needle.length < text.length) frag.appendChild(document.createTextNode(text.slice(at + needle.length)));
  return frag;
}

/**
 * Enhance a text input with a suggestion popup.
 *
 *   const city = Look.lkAutocomplete('#city', {
 *     source: ['Amsterdam', 'Berlin', 'Bogotá'],          // or objects, an lkDataSource, or (query, { signal }) => items | Promise
 *     forceSelection: false,                               // true: free text reverts unless a suggestion was picked
 *     onChange(value, { source, item }) {},
 *   });
 *   city.value;   // the text in the input
 *   city.item;    // the picked suggestion (or null while the text is free)
 *
 * The popup is an `lkPopupProxy` with live DOM (`role="listbox"`); the input is `role="combobox"` with
 * `aria-expanded`, `aria-controls` and `aria-activedescendant`. Keys: ArrowDown / ArrowUp open and move,
 * Home / End jump (while navigating), Enter picks, Escape closes (capture phase, so it works inside dialogs),
 * Tab just closes. Function / remote sources are debounced (`delay`) and stale answers are dropped;
 * the in-flight request is aborted through `signal` when a newer query starts.
 *
 * @param {Element|string} el — <input> element (or selector)
 * @param {Object} [opts]
 * @param {Array|Object|Function} [opts.source] — array of strings / objects | lkDataSource | (query, { signal, component }) => items | Promise<items>.
 *        A data source with a read transport and `server.filter` is queried with `setFilter({ $search: query })` + `load()`;
 *        otherwise its `items` are filtered locally.
 * @param {string}  [opts.textField='text']  — field shown (and written to the input) for object items
 * @param {string}  [opts.valueField='value'] — field posted through the hidden input / read by `item`
 * @param {number}  [opts.limit=10]          — most suggestions shown (0 / Infinity: all)
 * @param {number}  [opts.minChars=1]        — shortest query that searches
 * @param {number}  [opts.delay=250]         — debounce (ms) for function / remote sources
 * @param {'contains'|'startsWith'|Function} [opts.match='contains'] — local matching: built-in (accent/case-insensitive) or `(item, query) => boolean`
 * @param {Function} [opts.template]         — `(item, { query, index, component }) => Node | string` option content (text only, never HTML); default: text with the match in <mark>
 * @param {boolean} [opts.forceSelection=false] — only picked suggestions count: on blur free text reverts (to the last pick or empty)
 * @param {boolean} [opts.openOnFocus=false] — search with the current text (also empty) when the input gets focus
 * @param {boolean} [opts.autoSelectFirst=false] — highlight the first suggestion so Enter picks it
 * @param {boolean} [opts.noResults=true]    — show the "No results" row
 * @param {string}  [opts.valueName]         — creates a hidden input with this name posting the picked item's `valueField` (free text: the text)
 * @param {string|number} [opts.panelWidth]  — popup width: number (px) | CSS length | 'auto' (default: the input's width)
 * @param {string}  [opts.panelClass]        — extra class for the popup
 * @param {string}  [opts.label] [opts.name] [opts.placeholder] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Array}   [opts.rules] [opts.validate] [opts.validateDebounce] — see validation
 * @param {Object}  [opts.text]              — text overrides (see Look.i18n keys 'autocomplete.*')
 * @param {Function} [opts.onChange] — (value, { source, component, item }); source 'input' (typing) | 'select' | 'clear' | 'revert' (forceSelection) | 'api'
 * @param {Function} [opts.onOpen]   — (component)
 * @param {Function} [opts.onClose]  — (reason, component); reason 'select' | 'escape' | 'outside' | 'blur' | 'tab' | 'empty' | 'api' | 'destroy'
 * @param {Function} [opts.onLoad]   — (items, { query, component }) suggestions arrived
 * @param {Function} [opts.onError]  — (error, { query, component }) the source failed
 * @param {Function} [opts.beforeChange] — (value, { source, item, component }) => false | Promise | string — veto / replace the text of a pick (also clear, setValue, forceSelection revert)
 * @param {Function} [opts.beforeOpen]   — ({ source, component }) => false
 * @param {Function} [opts.beforeClose]  — (reason, { source, component }) => false | Promise | string
 * @param {Element|string} [opts.anchor] — element the popup aligns to (default: the input)
 * @param {boolean} [opts.embedded]  — internal (used by lkTagInput): no field wrapper, validation or .lk-input class
 * @returns {Object}
 */
export function lkAutocomplete(el, opts = {}) {
  const node = resolveEl(el, 'lkAutocomplete');
  if (node.tagName !== 'INPUT') throw new Error('Look.lkAutocomplete: element must be an <input>');

  const embedded = !!opts.embedded;
  const uid = `lk-ac-${++uidCounter}`;
  const dense = !!opts.dense;
  const textField = opts.textField || 'text';
  const valueField = opts.valueField || 'value';
  const limit = opts.limit == null ? 10 : (opts.limit > 0 ? opts.limit : Infinity);
  let minChars = Number.isFinite(opts.minChars) ? opts.minChars : 1;
  const delay = Number.isFinite(opts.delay) ? opts.delay : 250;
  const forceSelection = !!opts.forceSelection;
  const anchor = opts.anchor ? resolveEl(opts.anchor, 'lkAutocomplete') : node;

  const original = { cls: node.getAttribute('class'), attrs: {} };
  ATTRS.forEach((a) => { original.attrs[a] = node.getAttribute(a); });
  const hadLkInput = node.classList.contains('lk-input');
  const hadDense = node.classList.contains('lk-input--dense');
  const hadDisabled = node.disabled;
  const hadReadonly = node.readOnly;

  const field = embedded ? null : wrapField(node, {
    label: opts.label,
    name: opts.name,
    required: opts.required ?? opts.mandatory,
    requiredMark: opts.requiredMark,
    readonly: opts.readonly,
  });
  if (embedded && opts.readonly) node.readOnly = true;
  if (!embedded) node.classList.add('lk-input');
  if (dense && !embedded) node.classList.add('lk-input--dense');
  if (opts.disabled) node.disabled = true;
  if (opts.placeholder != null) node.setAttribute('placeholder', opts.placeholder);

  const comp = {};
  let validation = null;
  let destroyed = false;

  const tx = bindText('autocomplete', opts.text, () => { if (!destroyed) { renderState(); renderLabel(); } });

  // --- State -------------------------------------------------------------------

  const toNorm = (raw) => {
    if (raw !== null && typeof raw === 'object') {
      const text = String(raw[textField] ?? raw.text ?? raw.label ?? raw.name ?? '');
      return { raw, text, value: raw[valueField] ?? raw.value ?? text, disabled: !!raw.disabled };
    }
    const s = String(raw ?? '');
    return { raw, text: s, value: s, disabled: false };
  };

  let source = opts.source;
  let items = [];          // normalized suggestions on screen
  let state = 'idle';      // idle | loading | results | empty | error
  let lastQuery = '';
  let lastError = null;
  let activeIdx = -1;
  let selected = null;     // normalized item that matches the text right now
  let committed = null;    // last picked item (forceSelection revert target)
  let seq = 0;
  let timer = null;
  let ctrl = null;
  let resetTimer = null;
  let pendingMove = 0;

  const isAsyncSource = () => typeof source === 'function' || (isDataSource(source) && source.canRead && !!source.server?.filter);

  // --- DOM ---------------------------------------------------------------------

  const listId = `${uid}-list`;
  const statusEl = createElement('span', { class: 'lk-sr-only', role: 'status', 'aria-live': 'polite' });
  node.insertAdjacentElement('afterend', statusEl);

  let hidden = null;
  if (opts.valueName) {
    hidden = createElement('input', { type: 'hidden', name: opts.valueName });
    statusEl.insertAdjacentElement('afterend', hidden);
  }

  const stateEl = createElement('div', { class: 'lk-autocomplete__state' });
  const listEl = createElement('ul', { class: 'lk-autocomplete__list', role: 'listbox', id: listId });
  stateEl.hidden = true;
  listEl.hidden = true;

  // The proxy needs a trigger element for its own click toggling and aria; the input is not it (clicking
  // the input must not toggle), so a detached element stands in and the input is passed as the anchor.
  const dummyTrigger = document.createElement('div');
  const proxy = lkPopupProxy(dummyTrigger, {
    placement: 'bottom-left',
    gap: 4,
    closeOnOutside: false,
    closeOnEscape: false,
    toggleOnTrigger: false,
    className: `lk-autocomplete__panel${dense ? ' lk-autocomplete__panel--dense' : ''}${opts.panelClass ? ` ${opts.panelClass}` : ''}`,
    onShow: handleShown,
    onHide: handleHidden,
  });
  proxy.panelEl.textContent = '';
  proxy.panelEl.append(stateEl, listEl);
  proxy.panelEl.addEventListener('mousedown', onPanelMouseDown);

  node.setAttribute('role', 'combobox');
  node.setAttribute('aria-autocomplete', 'list');
  node.setAttribute('aria-expanded', 'false');
  node.setAttribute('aria-controls', listId);
  node.setAttribute('aria-haspopup', 'listbox');
  node.setAttribute('autocomplete', 'off');
  node.setAttribute('spellcheck', 'false');

  function renderLabel() {
    listEl.setAttribute('aria-label', field?.getLabel() || opts.ariaLabel || tx.t('label'));
  }

  function renderState() {
    stateEl.className = `lk-autocomplete__state lk-autocomplete__state--${state}`;
    stateEl.replaceChildren();
    const showRow = state === 'loading' || state === 'empty' || state === 'error';
    stateEl.hidden = !showRow;
    listEl.hidden = state !== 'results';
    if (state === 'loading') {
      stateEl.append(createElement('span', { class: 'lk-autocomplete__spinner', 'aria-hidden': 'true' }), createElement('span', {}, tx.tf('common.loading')));
    } else if (state === 'empty') {
      stateEl.textContent = tx.tf('common.noResults');
    } else if (state === 'error') {
      const msg = createElement('span', { class: 'lk-autocomplete__error' }, lastError?.message || tx.t('error'));
      const retry = createElement('button', { type: 'button', class: 'lk-autocomplete__retry' }, tx.tf('common.retry'));
      retry.addEventListener('click', onRetry);
      stateEl.append(msg, retry);
    }
  }

  function optionId(i) { return `${uid}-opt-${i}`; }

  function buildOption(n, i) {
    const li = createElement('li', { class: 'lk-autocomplete__option', role: 'option', id: optionId(i), 'aria-selected': 'false' });
    if (n.disabled) {
      li.classList.add('lk-autocomplete__option--disabled');
      li.setAttribute('aria-disabled', 'true');
    }
    if (typeof opts.template === 'function') {
      const out = opts.template(n.raw, { query: lastQuery, index: i, component: comp });
      if (typeof Node !== 'undefined' && out instanceof Node) li.appendChild(out);
      else li.textContent = out == null ? '' : String(out);
    } else {
      li.appendChild(highlight(n.text, lastQuery));
    }
    return li;
  }

  function renderOptions() {
    listEl.replaceChildren(...items.map(buildOption));
    renderLabel();
  }

  function enabledIndexes() {
    const out = [];
    items.forEach((n, i) => { if (!n.disabled) out.push(i); });
    return out;
  }

  function setActive(i, scroll = true) {
    activeIdx = i;
    Array.from(listEl.children).forEach((li, idx) => {
      const on = idx === i;
      li.classList.toggle('lk-autocomplete__option--active', on);
      li.setAttribute('aria-selected', String(on));
    });
    if (i >= 0 && state === 'results') {
      node.setAttribute('aria-activedescendant', optionId(i));
      const li = listEl.children[i];
      if (scroll && li && typeof li.scrollIntoView === 'function') li.scrollIntoView({ block: 'nearest' });
    } else {
      node.removeAttribute('aria-activedescendant');
    }
  }

  function move(dir) {
    const idxs = enabledIndexes();
    if (!idxs.length) return;
    const at = idxs.indexOf(activeIdx);
    let next;
    if (at < 0) next = dir > 0 ? idxs[0] : idxs[idxs.length - 1];
    else next = idxs[(at + dir + idxs.length) % idxs.length];
    setActive(next);
  }

  function announce(text) { statusEl.textContent = text; }

  // --- Popup -------------------------------------------------------------------

  const isFocused = () => (node.getRootNode?.().activeElement || document.activeElement) === node;
  const canEdit = () => !destroyed && !node.disabled && !node.readOnly;

  function sizePanel() {
    const w = opts.panelWidth;
    const panel = proxy.panelEl;
    if (w === 'auto') { panel.style.width = ''; return; }
    if (typeof w === 'number') panel.style.width = `${w}px`;
    else if (typeof w === 'string' && w) panel.style.width = w;
    else panel.style.width = `${anchor.getBoundingClientRect().width}px`;
  }

  function handleShown() {
    if (destroyed) return;
    node.setAttribute('aria-expanded', 'true');
    sizePanel();
    proxy.updatePosition(anchor);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeydown, true);
    if (typeof opts.onOpen === 'function') opts.onOpen(comp);
  }

  function handleHidden(reason) {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown, true);
    if (destroyed) return;
    node.setAttribute('aria-expanded', 'false');
    node.removeAttribute('aria-activedescendant');
    activeIdx = -1;
    if (typeof opts.onClose === 'function') opts.onClose(reason, comp);
  }

  function openPanel(src = 'user') {
    if (proxy.isOpen || !canEdit()) return;
    guard(node, opts, 'open', undefined, { source: src, component: comp }, () => {
      if (!proxy.isOpen && canEdit()) proxy.show(anchor, src);
    });
  }

  function closePanel(reason, src = 'user') {
    if (!proxy.isOpen) return;
    guard(node, opts, 'close', reason, { source: src, component: comp }, (r) => {
      cancelPending();
      proxy.hide(typeof r === 'string' && r ? r : reason, src);
    });
  }

  function ensureOpen(src) {
    if (!proxy.isOpen && isFocused()) openPanel(src);
    else if (proxy.isOpen) { sizePanel(); proxy.updatePosition(anchor); }
  }

  function onDocPointerDown(e) {
    const t = e.target;
    if (node.contains(t) || proxy.panelEl.contains(t) || anchor.contains(t)) return;
    closePanel('outside');
  }

  // Escape in the capture phase: a dialog / drawer listening on document must not close with it
  function onDocKeydown(e) {
    if (e.key !== 'Escape' || !proxy.isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    closePanel('escape');
  }

  // Keep focus in the input while the pointer works in the popup
  function onPanelMouseDown(e) {
    if (e.target.closest('.lk-autocomplete__retry')) return;
    e.preventDefault();
  }

  // --- Searching ---------------------------------------------------------------

  function cancelPending() {
    seq++;
    if (timer != null) { clearTimeout(timer); timer = null; }
    if (ctrl) { try { ctrl.abort(); } catch { /* ignore */ } ctrl = null; }
  }

  function localFilter(list, query) {
    const m = opts.match;
    const q = fold(query);
    return list.filter((raw) => {
      if (typeof m === 'function') return !!m(raw, query);
      const t = fold(toNorm(raw).text);
      if (!q) return true;
      return m === 'startsWith' ? t.startsWith(q) : t.includes(q);
    });
  }

  function fetcher(query, signal) {
    if (Array.isArray(source)) return localFilter(source, query);
    if (typeof source === 'function') return source(query, { signal, component: comp });
    if (isDataSource(source)) {
      if (source.canRead && source.server?.filter) {
        source.setFilter(query ? { $search: query } : null);
        return Promise.resolve(source.load()).then(() => source.view.slice());
      }
      return localFilter(source.items || [], query);
    }
    return [];
  }

  function search(query, src, immediate) {
    cancelPending();
    const my = seq;
    lastQuery = query;
    announce('');
    const min = (opts.openOnFocus && query === '') ? 0 : minChars;
    if (!source || query.length < min) {
      items = [];
      state = 'idle';
      renderState();
      closePanel('empty');
      return;
    }

    const run = () => {
      timer = null;
      if (my !== seq) return;
      ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      let r;
      try { r = fetcher(query, ctrl ? ctrl.signal : undefined); } catch (err) { fail(err, query); return; }
      if (isThenable(r)) {
        state = 'loading';
        renderState();
        announce(tx.tf('common.loading'));
        ensureOpen(src);
        r.then(
          (list) => { if (my === seq) succeed(list, query, src); },
          (err) => { if (my === seq && !(err && err.name === 'AbortError')) fail(err, query, src); },
        );
      } else {
        succeed(r, query, src);
      }
    };

    if (isAsyncSource() && delay > 0 && !immediate) timer = setTimeout(run, delay);
    else run();
  }

  function succeed(list, query, src) {
    ctrl = null;
    const arr = Array.isArray(list) ? list : (list && (list.items || list.data)) || [];
    items = arr.slice(0, limit).map(toNorm);
    state = items.length ? 'results' : 'empty';
    lastError = null;
    renderOptions();
    renderState();
    if (!items.length && opts.noResults === false) {
      closePanel('empty');
    } else {
      ensureOpen(src);
    }
    if (items.length) {
      const idxs = enabledIndexes();
      if (pendingMove) setActive(pendingMove > 0 ? idxs[0] ?? -1 : idxs[idxs.length - 1] ?? -1);
      else if (opts.autoSelectFirst && idxs.length) setActive(idxs[0], false);
      else setActive(-1);
    }
    pendingMove = 0;
    announce(items.length ? tx.t('results', { count: items.length }) : tx.tf('common.noResults'));
    if (typeof opts.onLoad === 'function') opts.onLoad(items.map((n) => n.raw), { query, component: comp });
  }

  function fail(err, query, src) {
    ctrl = null;
    items = [];
    state = 'error';
    lastError = err;
    pendingMove = 0;
    renderOptions();
    renderState();
    ensureOpen(src);
    announce(lastError?.message || tx.t('error'));
    if (typeof opts.onError === 'function') opts.onError(err, { query, component: comp });
  }

  function onRetry(e) {
    e.preventDefault();
    search(lastQuery, 'retry', true);
    node.focus();
  }

  // --- Value -------------------------------------------------------------------

  function syncHidden() {
    if (!hidden) return;
    hidden.value = selected ? String(selected.value) : (forceSelection ? '' : node.value);
  }

  // Programmatic / picked text: sets the input, mirrors, notifies
  function commit(text, src, n) {
    node.value = text;
    selected = n;
    committed = n;
    if (!n && text === '') committed = null;
    syncHidden();
    node.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof opts.onChange === 'function') opts.onChange(node.value, { source: src, component: comp, item: n ? n.raw : null });
  }

  function changeTo(text, src, n) {
    guard(node, opts, 'change', text, { source: src, item: n ? n.raw : null, component: comp }, (next) => {
      const finalText = typeof next === 'string' ? next : text;
      commit(finalText, src, n);
    });
  }

  function pick(i) {
    const n = items[i];
    if (!n || n.disabled || !canEdit()) return;
    changeTo(n.text, 'select', n);
    closePanel('select');
  }

  function onInput() {
    if (!canEdit()) return;
    const text = node.value;
    if (selected && text !== selected.text) selected = null;
    if (text === '') committed = null;
    syncHidden();
    if (typeof opts.onChange === 'function') opts.onChange(text, { source: 'input', component: comp, item: null });
    search(text, 'input');
  }

  // forceSelection: leaving the field with free text either matches a suggestion exactly or reverts
  function settle() {
    if (!forceSelection || !canEdit()) return;
    const text = node.value;
    if (text === '' || (selected && selected.text === text)) return;
    const exact = items.find((n) => !n.disabled && fold(n.text) === fold(text));
    if (exact) { changeTo(exact.text, 'select', exact); return; }
    changeTo(committed ? committed.text : '', 'revert', committed);
  }

  function onBlur() {
    if (proxy.isOpen) closePanel('blur');
    settle();
  }

  function onFocus() {
    if (opts.openOnFocus && canEdit()) search(node.value, 'focus');
  }

  function onKeydown(e) {
    if (!canEdit() || e.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        if (!proxy.isOpen) {
          if (state === 'results' && lastQuery === node.value && items.length) {
            openPanel('key');
            move(dir);
          } else {
            pendingMove = dir;
            search(node.value, 'key', true);
          }
        } else if (state === 'results') {
          move(dir);
        }
        break;
      }
      case 'Home':
      case 'End':
        if (proxy.isOpen && state === 'results' && activeIdx >= 0) {
          e.preventDefault();
          const idxs = enabledIndexes();
          if (idxs.length) setActive(e.key === 'Home' ? idxs[0] : idxs[idxs.length - 1]);
        }
        break;
      case 'Enter':
        if (proxy.isOpen && state === 'results' && activeIdx >= 0) {
          e.preventDefault();
          pick(activeIdx);
        }
        break;
      case 'Tab':
        if (proxy.isOpen) closePanel('tab');
        break;
      default:
    }
  }

  function onOptionClick(e) {
    const li = e.target.closest('.lk-autocomplete__option');
    if (!li || !listEl.contains(li)) return;
    pick(Array.from(listEl.children).indexOf(li));
  }

  function onOptionMove(e) {
    const li = e.target.closest('.lk-autocomplete__option');
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    const i = Array.from(listEl.children).indexOf(li);
    if (i !== activeIdx) setActive(i, false);
  }

  function onFormReset() {
    resetTimer = setTimeout(() => {
      resetTimer = null;
      selected = null;
      committed = null;
      syncHidden();
      if (proxy.isOpen) closePanel('api', 'api');
    }, 0);
  }

  node.addEventListener('input', onInput);
  node.addEventListener('keydown', onKeydown);
  node.addEventListener('blur', onBlur);
  node.addEventListener('focus', onFocus);
  listEl.addEventListener('click', onOptionClick);
  listEl.addEventListener('mousemove', onOptionMove);
  const form = node.form;
  form?.addEventListener('reset', onFormReset);

  renderLabel();
  syncHidden();

  // --- Public API --------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field?.wrapper || node });

  Object.defineProperties(comp, {
    value: {
      get() { return node.value; },
      set(v) { node.value = v == null ? '' : String(v); selected = null; committed = null; syncHidden(); },
      enumerable: true,
    },
    item: { get() { return selected ? selected.raw : null; }, enumerable: true },
    items: { get() { return items.map((n) => n.raw); }, enumerable: true },
    isOpen: { get() { return proxy.isOpen; }, enumerable: true },
    loading: { get() { return state === 'loading'; }, enumerable: true },
    source: {
      get() { return source; },
      set(v) { cancelPending(); source = v; items = []; state = 'idle'; renderState(); if (proxy.isOpen) closePanel('api', 'api'); },
      enumerable: true,
    },
    minChars: { get() { return minChars; }, set(v) { if (Number.isFinite(v)) minChars = v; }, enumerable: true },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true },
    name: { get() { return node.name; }, set(v) { node.name = v; }, enumerable: true },
    readonly: {
      get() { return node.readOnly; },
      set(v) { node.readOnly = !!v; if (v && proxy.isOpen) closePanel('api', 'api'); },
      enumerable: true,
    },
    disabled: {
      get() { return node.disabled; },
      set(v) { node.disabled = !!v; if (v && proxy.isOpen) closePanel('api', 'api'); },
      enumerable: true,
    },
    panelEl: { value: proxy.panelEl, enumerable: true },
    listEl: { value: listEl, enumerable: true },
  });

  if (field) {
    Object.defineProperties(comp, {
      label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); renderLabel(); }, enumerable: true },
      labels: { get() { return field.labels; }, enumerable: true },
      required: { get() { return node.required; }, set(v) { field.setRequired(v); }, enumerable: true },
      mandatory: { get() { return node.required; }, set(v) { field.setRequired(v); } },
    });
    comp.setError = field.setError;
    comp.clearError = field.clearError;
    comp.refreshLabels = () => { field.refreshLabels(); renderLabel(); };
  }

  /** Opens the suggestions for the current text (searches first when needed). */
  comp.open = () => {
    if (!canEdit()) return;
    if (state === 'results' && lastQuery === node.value) openPanel('api');
    else search(node.value, 'api', true);
  };
  comp.close = () => closePanel('api', 'api');
  /** Searches for `query` (default: the current text) and shows the result. */
  comp.search = (query) => search(query == null ? node.value : String(query), 'api', true);
  /** Sets the text like a user pick: fires onChange with source 'api'. */
  comp.setValue = (v) => changeTo(v == null ? '' : String(v), 'api', null);
  comp.clear = () => { if (canEdit()) { changeTo('', 'clear', null); closePanel('api', 'api'); } };
  comp.focus = (o) => node.focus(o);

  if (field) {
    validation = attachValidation(comp, {
      opts,
      getValue: () => node.value,
      label: field.getLabel,
      labels: () => field.labels,
      required: () => node.required,
      t: tx.tf,
      roots: () => [field.wrapper || node, proxy.panelEl],
      isOpen: () => proxy.isOpen,
      setError: field.setError,
      clearError: field.clearError,
      changeTargets: [node],
    });
  }

  comp.destroy = function () {
    if (destroyed) return;
    cancelPending();
    if (resetTimer != null) clearTimeout(resetTimer);
    destroyed = true;
    tx.destroy();
    validation?.destroy();
    node.removeEventListener('input', onInput);
    node.removeEventListener('keydown', onKeydown);
    node.removeEventListener('blur', onBlur);
    node.removeEventListener('focus', onFocus);
    listEl.removeEventListener('click', onOptionClick);
    listEl.removeEventListener('mousemove', onOptionMove);
    proxy.panelEl.removeEventListener('mousedown', onPanelMouseDown);
    form?.removeEventListener('reset', onFormReset);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown, true);
    proxy.destroy();
    statusEl.remove();
    hidden?.remove();
    ATTRS.forEach((a) => {
      const v = original.attrs[a];
      if (v == null) node.removeAttribute(a); else node.setAttribute(a, v);
    });
    if (!hadLkInput) node.classList.remove('lk-input');
    if (!hadDense) node.classList.remove('lk-input--dense');
    if (original.cls === null && !node.getAttribute('class')) node.removeAttribute('class');
    node.disabled = hadDisabled;
    node.readOnly = hadReadonly;
    field?.destroyField();
  };

  return comp;
}
