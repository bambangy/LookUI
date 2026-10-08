// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkDropdown — custom styled dropdown with optional search input and
 * transport/infinite-scroll support.
 *
 * API contract:
 *   - Replaces a <select> (or any element) with a fully custom panel
 *   - Items: static `opts.items` array OR `opts.transport.read` URL/fn
 *   - useInput: shows a search box that filters items client-side (local) or
 *     triggers a new server request (when transport + server.filter: true)
 *   - Infinite scroll: when transport is set and opts.infinite is true,
 *     scrolling near the bottom of the panel loads the next page
 *   - Paginated (non-infinite): loads all at once from server, or pages on demand
 *
 * @param {Element|string} el
 * @param {Object} [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.name]
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.readonly]
 * @param {boolean} [opts.disabled]
 * @param {string}  [opts.placeholder]
 * @param {any}     [opts.value]               - initially selected value
 * @param {Array}   [opts.items]               - [{ value, label, disabled? }]
 * @param {string}  [opts.valueField='value']
 * @param {string}  [opts.labelField='label']
 * @param {boolean} [opts.useInput]            - show search/filter input
 * @param {string}  [opts.searchPlaceholder]
 * @param {number}  [opts.debounce]            - ms debounce for search (default 220)
 * @param {boolean} [opts.clearable]           - show clear button when value selected
 * @param {boolean} [opts.infinite]            - infinite-scroll (requires transport)
 * @param {number}  [opts.pageSize]            - items per page (default 20)
 * @param {Object}  [opts.transport]           - { read: url | config | fn }
 * @param {Object}  [opts.server]              - { filter: bool, selected: bool }
 *                                               filter  — push search query to server (param: opts.searchParam, default 'q')
 *                                               selected — send current value in every read request so server can
 *                                                          include it in any page (default true)
 * @param {string}  [opts.searchParam]         - query param name for search (default 'q')
 * @param {string}  [opts.selectedParam]       - query param name for selected hint (default 'selected')
 * @param {Object}  [opts.request]             - { headers, credentials }
 * @param {boolean} [opts.multiple]            - select many values; shown as lkChips (alias: multiselect)
 * @param {string}  [opts.chipColor]           - chip color in multiple mode (default 'primary')
 * @param {number}  [opts.maxChips]            - show at most N chips, then a "+N" chip
 * @param {boolean} [opts.closeOnSelect]       - close after picking (default: true single, false multiple)
 * @param {Function} [opts.onChange]           - (value, item) => void; multiple: (values[], items[]) => void
 * @param {string}  [opts.noResultsText]
 * @param {string}  [opts.loadingText]
 * @param {Function} [opts.template]          - (item) => Node|string — option content (string = text, never HTML)
 * @param {Function} [opts.selectedTemplate]  - (item) => Node|string — trigger content for the single selection
 * @param {string[]} [opts.searchFields]      - item fields the local search matches (default: [labelField])
 * @param {number|string} [opts.panelWidth]   - panel width (px or CSS length); default = trigger width
 * @param {string}  [opts.panelClass]         - extra class on the floating panel
 * @param {Array}   [opts.rules]              - validation rules (see helpers/validation.js)
 * @param {boolean} [opts.validate]           - validate when focus leaves the dropdown (panel closed)
 */

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField, applyFieldProps } from '../helpers/field.js';
import { createPresenceController, floatingZIndex } from '../helpers/motion.js';
import { lkChip } from './chip.js';
import { attachValidation } from '../helpers/validation.js';

const EXIT_MS = 180;

// --- tiny helpers -----------------------------------------------------------

function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function buildUrl(url, payload) {
  if (!payload || !isObject(payload)) return url;
  let next = url;
  Object.keys(payload).forEach((key) => {
    next = next.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(String(payload[key])));
  });
  return next;
}

function appendQuery(url, query) {
  if (!query || !isObject(query)) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v == null) return;
    params.append(k, String(v));
  });
  const qs = params.toString();
  if (!qs) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

function normalizeReadResponse(raw) {
  if (Array.isArray(raw)) return { items: raw, total: raw.length };
  if (!isObject(raw)) return { items: [], total: 0 };

  const items =
    Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.rows) ? raw.rows
    : [];

  const totalCandidates = [raw.total, raw.totalCount, raw.count, raw.meta?.total];
  const total = totalCandidates.find((v) => Number.isFinite(Number(v)));
  return { items, total: total == null ? items.length : Number(total) };
}

// Debounce utility
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

export function lkDropdown(el, opts = {}) {
  const anchor = resolveEl(el, 'lkDropdown');

  const options = {
    label: null,
    name: null,
    required: false,
    readonly: false,
    disabled: false,
    placeholder: 'Select…',
    value: undefined,
    items: [],
    valueField: 'value',
    labelField: 'label',
    useInput: false,
    searchPlaceholder: 'Search…',
    debounce: 220,
    clearable: false,
    prepend: null,
    append: null,
    infinite: false,
    pageSize: 20,
    transport: null,
    server: { filter: false, selected: true },
    searchParam: 'q',
    selectedParam: 'selected',
    request: { headers: {}, credentials: 'same-origin' },
    multiple: false,
    chipColor: 'primary',
    maxChips: null,
    closeOnSelect: undefined,
    onChange: null,
    noResultsText: 'No results',
    loadingText: 'Loading…',
    template: null,
    selectedTemplate: null,
    searchFields: null,
    panelWidth: null,
    panelClass: '',
    ...opts,
  };
  if (isObject(opts.server)) options.server = { ...options.server, ...opts.server };
  if (isObject(opts.request)) options.request = { ...options.request, ...opts.request };
  if (isObject(opts.transport)) options.transport = { ...opts.transport };
  if (opts.multiselect != null && opts.multiple == null) options.multiple = !!opts.multiselect;
  if (anchor.tagName === 'SELECT' && anchor.multiple && opts.multiple == null && opts.multiselect == null) {
    options.multiple = true;
  }
  const multiple = !!options.multiple;
  const closeOnSelect = options.closeOnSelect ?? !multiple;

  // Enhancing a native <select> without explicit items: adopt its <option>s.
  if (anchor.tagName === 'SELECT' && !opts.items && !opts.transport) {
    options.items = Array.from(anchor.options).map((o) => ({
      value: o.value,
      label: o.textContent,
      disabled: o.disabled,
      selected: o.hasAttribute('selected'),
    }));
    if (options.name == null && anchor.name) options.name = anchor.name;
  }

  // --- State ----------------------------------------------------------------

  let localItems   = (options.items || []).map(normalizeItem);
  // Fall back to an item flagged `selected: true` when no explicit value is given.
  const preselected = options.value === undefined ? localItems.find((it) => it?.selected) : null;
  let currentValue = options.value !== undefined ? options.value : (preselected ? itemValue(preselected) : null);
  let currentItem  = null;
  // Multiple mode: ordered values + their items (items survive remote paging/filtering)
  let selectedValues = [];
  const selectedMap  = new Map(); // String(value) -> item | null
  let chipComps      = [];
  const extraInputs  = [];
  if (multiple) {
    const initial = options.value !== undefined
      ? (Array.isArray(options.value) ? options.value : (options.value == null ? [] : [options.value]))
      : localItems.filter((it) => it?.selected).map(itemValue);
    initial.forEach((v) => {
      if (selectedMap.has(String(v))) return;
      selectedValues.push(v);
      selectedMap.set(String(v), localItems.find((i) => valueEquals(itemValue(i), v)) || null);
    });
    currentValue = null;
  }
  let filteredItems = localItems.slice();
  let searchQuery  = '';
  let open         = false;
  let destroyed    = false;
  let loading      = false;
  let hasMore      = false;
  let currentPage  = 1;
  let totalRemote  = null;
  let loadPromise  = null;
  let abortCtrl    = null;
  let requestSeq   = 0;
  let debounceSearchFn = null;
  let positionRaf = null;
  let validation = null; // set once the component object exists
  const positionListenerOpts = { capture: true, passive: true };

  // --- Normalize item -------------------------------------------------------

  function normalizeItem(raw) {
    if (typeof raw === 'string' || typeof raw === 'number') {
      return { [options.valueField]: raw, [options.labelField]: String(raw), disabled: false };
    }
    return raw;
  }

  function itemValue(item) { return item?.[options.valueField] ?? item?.value ?? null; }
  function itemLabel(item) { return String(item?.[options.labelField] ?? item?.label ?? item?.text ?? itemValue(item) ?? ''); }
  function valueEquals(a, b) { return String(a ?? '') === String(b ?? ''); }

  function setDecoratorContent(slot, content) {
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

  // --- Build DOM ------------------------------------------------------------

  // Hidden native input for form participation
  const hiddenInput = document.createElement('input');
  hiddenInput.type   = 'hidden';
  if (options.name) hiddenInput.name = options.name;
  if (options.required) hiddenInput.required = true;

  // Trigger button (replaces <select> visually)
  // Multiple mode hosts chips with their own remove buttons, which can't nest in
  // a <button> — use a focusable combobox div instead.
  const trigger = document.createElement(multiple ? 'div' : 'button');
  if (multiple) {
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('tabindex', '0');
  } else {
    trigger.type = 'button';
  }
  trigger.className = 'lk-dropdown__trigger lk-input' + (multiple ? ' lk-dropdown__trigger--multiple' : '');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'lk-dropdown__trigger-label';

  const prependEl = document.createElement('span');
  prependEl.className = 'lk-dropdown__prepend';
  prependEl.hidden = true;

  const appendEl = document.createElement('span');
  appendEl.className = 'lk-dropdown__append';
  appendEl.hidden = true;

  const triggerCaret = document.createElement('span');
  triggerCaret.className = 'lk-dropdown__caret';
  triggerCaret.setAttribute('aria-hidden', 'true');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'lk-dropdown__clear';
  clearBtn.setAttribute('aria-label', 'Clear');
  clearBtn.setAttribute('tabindex', '-1');
  clearBtn.hidden = true;

  const chipsEl = document.createElement('span');
  chipsEl.className = 'lk-dropdown__chips';
  chipsEl.hidden = true;

  trigger.appendChild(prependEl);
  if (multiple) trigger.appendChild(chipsEl);
  trigger.appendChild(triggerLabel);
  trigger.appendChild(clearBtn);
  trigger.appendChild(triggerCaret);
  trigger.appendChild(appendEl);

  setDecoratorContent(prependEl, options.prepend);
  setDecoratorContent(appendEl, options.append);

  // Panel (floating)
  const panel = document.createElement('div');
  panel.className = `lk-dropdown__panel ${options.panelClass || ''}`.trim();
  panel.setAttribute('role', 'listbox');
  if (multiple) {
    panel.setAttribute('aria-multiselectable', 'true');
    panel.classList.add('lk-dropdown__panel--multiple');
  }
  // Visibility is owned by the layer (presence controller) — never hide the panel itself.

  // Search input (inside panel)
  let searchInput = null;
  if (options.useInput) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'lk-dropdown__search';

    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'lk-input lk-dropdown__search-input';
    searchInput.placeholder = options.searchPlaceholder;
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('spellcheck', 'false');

    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);
  }

  // List container
  const listEl = document.createElement('ul');
  listEl.className = 'lk-dropdown__list';
  listEl.setAttribute('role', 'presentation');
  panel.appendChild(listEl);

  // Loading sentinel / spinner row
  const loadingEl = document.createElement('div');
  loadingEl.className = 'lk-dropdown__loading';
  loadingEl.textContent = options.loadingText;
  loadingEl.hidden = true;
  panel.appendChild(loadingEl);

  // Empty state
  const emptyEl = document.createElement('div');
  emptyEl.className = 'lk-dropdown__empty';
  emptyEl.textContent = options.noResultsText;
  emptyEl.hidden = true;
  panel.appendChild(emptyEl);

  // Carry the dense modifier from the host element onto the trigger
  if (anchor.classList?.contains('lk-input--dense')) trigger.classList.add('lk-input--dense');

  // The trigger takes over the anchor's id so external <label for="..."> keeps pointing at the control
  const anchorId = anchor.id;
  if (anchorId) {
    anchor.removeAttribute('id');
    trigger.id = anchorId;
  }

  // Replace anchor element with trigger + hidden input
  anchor.parentNode?.insertBefore(trigger, anchor);
  anchor.parentNode?.insertBefore(hiddenInput, anchor);
  anchor.remove();

  // Field wrap (label + error + external labels). name/readonly live on hiddenInput;
  // required lives on hiddenInput too, but wrapField keeps the label asterisks in sync.
  const field = wrapField(trigger, {
    label: options.label,
    required: opts.required ?? opts.mandatory ?? (anchor.required || undefined),
    requiredMark: options.requiredMark,
    requiredTarget: hiddenInput,
  });

  // Position layer — fixed, full-viewport
  const layer = document.createElement('div');
  layer.className = 'lk-dropdown__layer';
  layer.hidden = true;
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:var(--lk-z-dropdown)';
  panel.style.position = 'fixed';
  panel.style.pointerEvents = 'auto';
  layer.appendChild(panel);
  document.body.appendChild(layer);

  // Presence controller
  const presence = createPresenceController({
    element: layer,
    visibleClass: 'lk-dropdown__layer--open',
    closingClass: 'lk-dropdown__layer--closing',
    exitMs: EXIT_MS,
    hideWithHiddenAttr: true,
    afterShow() {
      requestPositionUpdate();
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      } else {
        focusSelected();
      }
    },
  });

  // --- Remote transport -----------------------------------------------------

  function hasTransport() {
    return !!(options.transport?.read);
  }

  async function fetchItems(query, page, signal) {
    const endpoint = options.transport.read;
    const pageSize  = options.pageSize;

    const payload = { page, pageSize };
    if (options.server?.filter && query) payload[options.searchParam] = query;
    // Hint the server about the currently selected value so it can include
    // that item in the response regardless of which page is being fetched.
    if (options.server?.selected && multiple && selectedValues.length) {
      payload[options.selectedParam] = selectedValues.join(',');
    } else if (options.server?.selected && currentValue != null) {
      payload[options.selectedParam] = currentValue;
    }

    if (typeof endpoint === 'function') {
      return endpoint(payload, { signal });
    }

    const config = typeof endpoint === 'string' ? { url: endpoint } : endpoint;
    const method  = String(config.method || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json', ...options.request.headers, ...(config.headers || {}) };
    let url = buildUrl(config.url || '', payload);

    const init = { method, headers, credentials: config.credentials || options.request.credentials, signal };

    if (method === 'GET') {
      url = appendQuery(url, payload);
    } else {
      init.body = JSON.stringify(payload);
    }

    const res  = await fetch(url, init);
    const body = await (res.headers.get('content-type') || '').includes('json') ? res.json() : res.text().then(t => { try { return JSON.parse(t); } catch { return t; } });

    if (!res.ok) {
      const msg = isObject(body) && body.message ? body.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  async function loadPage(query, page, append) {
    // Appending (infinite scroll) waits for the in-flight request; a fresh
    // query (search / reload) supersedes it so the latest input always wins.
    if (append && (loading || loadPromise)) return loadPromise;
    if (abortCtrl) abortCtrl.abort();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortCtrl = ctrl;
    const seq = ++requestSeq;
    loading = true;
    setLoadingState(true);
    loadPromise = (async () => {
      try {
        const raw = await fetchItems(query, page, ctrl?.signal);
        if (seq !== requestSeq || destroyed) return;
        const { items: newItems, total } = normalizeReadResponse(raw);
        totalRemote = total;
        const normalized = newItems.map(normalizeItem);
        if (append) {
          localItems = localItems.concat(normalized);
        } else {
          localItems = normalized;
          currentPage = page;
        }
        if (multiple) {
          if (resolveSelectedItems()) updateTriggerLabel();
        } else if (currentValue != null) {
          const found = localItems.find(i => valueEquals(itemValue(i), currentValue));
          if (found) currentItem = found;
          updateTriggerLabel();
        }
        hasMore = localItems.length < totalRemote;
        applyFilter(searchQuery);
        renderList(append);
      } catch (err) {
        if (err?.name !== 'AbortError' && seq === requestSeq && !destroyed) {
          emptyEl.textContent = err.message || options.noResultsText;
          emptyEl.hidden = false;
          listEl.hidden = true;
        }
      } finally {
        if (seq === requestSeq) {
          loading = false;
          loadPromise = null;
          if (!destroyed) setLoadingState(false);
        }
      }
    })();
    return loadPromise;
  }
  function setLoadingState(on) {
    loadingEl.hidden = !on;
    trigger.classList.toggle('lk-dropdown--loading', on && !open);
  }

  // --- Filter ---------------------------------------------------------------

  function applyFilter(query) {
    searchQuery = query || '';
    const q = searchQuery.toLowerCase().trim();

    if (!q || (hasTransport() && options.server?.filter)) {
      filteredItems = localItems.slice();
    } else {
      const fields = Array.isArray(options.searchFields) && options.searchFields.length ? options.searchFields : null;
      filteredItems = localItems.filter((item) => (fields
        ? fields.some((f) => String(item?.[f] ?? '').toLowerCase().includes(q))
        : itemLabel(item).toLowerCase().includes(q)));
    }

    emptyEl.hidden = filteredItems.length > 0 || loading;
    listEl.hidden  = false;
  }

  // --- Render list ----------------------------------------------------------

  function renderList(append = false) {
    if (!append) listEl.textContent = '';

    const fragment = document.createDocumentFragment();
    const start    = append ? (listEl.children.length) : 0;
    const slice    = append ? filteredItems.slice(start) : filteredItems;

    slice.forEach(item => {
      const li = createOptionEl(item);
      fragment.appendChild(li);
    });

    listEl.appendChild(fragment);
    emptyEl.hidden = filteredItems.length > 0;
    loadingEl.hidden = !loading;

    // Infinite scroll sentinel
    if (options.infinite && hasMore) {
      loadingEl.hidden = false;
    }
  }

  function createOptionEl(item) {
    const val      = itemValue(item);
    const label    = itemLabel(item);
    const selected = isSelected(val);
    const disabled = !!item.disabled;

    const li = document.createElement('li');
    li.className = 'lk-dropdown__option' +
      (selected ? ' lk-dropdown__option--selected' : '') +
      (disabled ? ' lk-dropdown__option--disabled' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(selected));
    li.setAttribute('data-value', String(val ?? ''));
    const content = renderTemplate(options.template, item, label);
    if (multiple) {
      const check = document.createElement('span');
      check.className = 'lk-dropdown__option-check';
      check.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'lk-dropdown__option-label';
      text.append(content);
      li.append(check, text);
    } else {
      li.append(content);
    }
    if (options.template) li.classList.add('lk-dropdown__option--custom');

    if (!disabled) {
      li.addEventListener('click', () => selectItem(item));
      li.addEventListener('keydown', onOptionKeydown);
      li.setAttribute('tabindex', '-1');
    }

    return li;
  }

  // Custom content hook: a template returns a Node or plain text (never parsed as HTML).
  function renderTemplate(fn, item, fallback) {
    if (typeof fn !== 'function') return document.createTextNode(fallback);
    const out = fn(item);
    if (out instanceof Node) return out;
    return document.createTextNode(out == null ? fallback : String(out));
  }

  function refreshOptionStates() {
    listEl.querySelectorAll('.lk-dropdown__option').forEach(li => {
      const selected = isSelected(li.dataset.value);
      li.classList.toggle('lk-dropdown__option--selected', selected);
      li.setAttribute('aria-selected', String(selected));
    });
  }

  // --- Select ---------------------------------------------------------------

  function isSelected(val) {
    return multiple ? selectedMap.has(String(val ?? '')) : valueEquals(val, currentValue);
  }

  function selectedItemList() {
    return selectedValues.map((v) => selectedMap.get(String(v)) || null);
  }

  // Fill in items for values that were set before their item was known (remote data).
  function resolveSelectedItems() {
    let changed = false;
    selectedValues.forEach((v) => {
      const key = String(v);
      if (selectedMap.get(key)) return;
      const found = localItems.find((i) => valueEquals(itemValue(i), v));
      if (found) { selectedMap.set(key, found); changed = true; }
    });
    return changed;
  }

  // One hidden input per value, like a native <select multiple> submits.
  function syncHiddenInputs() {
    if (!multiple) {
      hiddenInput.value = currentValue ?? '';
      return;
    }
    hiddenInput.value = selectedValues.length ? String(selectedValues[0] ?? '') : '';
    while (extraInputs.length) extraInputs.pop().remove();
    let after = hiddenInput;
    selectedValues.slice(1).forEach((v) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = hiddenInput.name;
      input.value = String(v ?? '');
      input.disabled = hiddenInput.disabled;
      after.after(input);
      after = input;
      extraInputs.push(input);
    });
  }

  function emitChange() {
    validation?.changed();
    if (typeof options.onChange !== 'function') return;
    if (multiple) options.onChange(selectedValues.slice(), selectedItemList());
    else options.onChange(currentValue, currentItem);
  }

  function setValues(values, { emit = false } = {}) {
    const list = Array.isArray(values) ? values : (values == null ? [] : [values]);
    selectedValues = [];
    selectedMap.clear();
    list.forEach((v) => {
      if (selectedMap.has(String(v))) return;
      selectedValues.push(v);
      selectedMap.set(String(v), localItems.find((i) => valueEquals(itemValue(i), v)) || null);
    });
    syncHiddenInputs();
    updateTriggerLabel();
    if (open) refreshOptionStates();
    if (emit) emitChange();
  }

  function removeValue(val, { rerenderChips = true } = {}) {
    const key = String(val ?? '');
    if (!selectedMap.has(key)) return;
    selectedMap.delete(key);
    selectedValues = selectedValues.filter((v) => String(v ?? '') !== key);
    syncHiddenInputs();
    if (rerenderChips) updateTriggerLabel();
    else updateClearAndPlaceholder();
    if (open) refreshOptionStates();
    emitChange();
  }

  function toggleItem(item) {
    const val = itemValue(item);
    const key = String(val ?? '');
    if (selectedMap.has(key)) {
      removeValue(val);
    } else {
      selectedValues.push(val);
      selectedMap.set(key, item);
      syncHiddenInputs();
      updateTriggerLabel();
      refreshOptionStates();
      emitChange();
    }
    if (closeOnSelect) closePanel('select');
    else requestPositionUpdate();
  }

  function selectItem(item) {
    if (multiple) { toggleItem(item); return; }
    const val = itemValue(item);
    currentValue = val;
    currentItem  = item;
    hiddenInput.value = val ?? '';
    updateTriggerLabel();
    refreshOptionStates();
    closePanel('select');
    validation?.changed();
    if (typeof options.onChange === 'function') options.onChange(val, item);
  }

  function clearValue() {
    if (multiple) {
      setValues([], { emit: true });
      requestPositionUpdate();
      return;
    }
    currentValue = null;
    currentItem  = null;
    hiddenInput.value = '';
    updateTriggerLabel();
    refreshOptionStates();
    validation?.changed();
    if (typeof options.onChange === 'function') options.onChange(null, null);
  }

  function isLocked() {
    return options.readonly || options.disabled || trigger.hasAttribute('disabled');
  }

  function updateClearAndPlaceholder() {
    const has = selectedValues.length > 0;
    triggerLabel.hidden = has;
    chipsEl.hidden = !has;
    triggerLabel.textContent = options.placeholder;
    triggerLabel.classList.add('lk-dropdown__trigger-label--placeholder');
    clearBtn.hidden = !(options.clearable && has && !isLocked());
  }

  function renderChips() {
    chipComps.forEach((c) => c.destroy());
    chipComps = [];
    chipsEl.textContent = '';

    const limit = Number.isFinite(options.maxChips) && options.maxChips >= 0 ? options.maxChips : Infinity;
    const shown = selectedValues.slice(0, limit);
    const overflow = selectedValues.slice(shown.length);
    const removable = !isLocked();

    shown.forEach((v) => {
      const item = selectedMap.get(String(v));
      const el = document.createElement('span');
      chipsEl.appendChild(el);
      const chip = lkChip(el, {
        label: item ? itemLabel(item) : String(v ?? ''),
        color: options.chipColor,
        dense: true,
        removable,
        onRemove() {
          // Overflow chip counts must update at once; otherwise let the chip animate out.
          const animate = overflow.length === 0;
          removeValue(v, { rerenderChips: !animate });
          if (animate) {
            chipComps = chipComps.filter((c) => c !== chip);
            setTimeout(requestPositionUpdate, 220);
          }
          return animate;
        },
      });
      el.title = chip.label;
      const close = el.querySelector('.lk-chip__close');
      if (close) close.tabIndex = -1; // Backspace on the trigger removes chips from the keyboard
      chipComps.push(chip);
    });

    if (overflow.length) {
      const more = document.createElement('span');
      more.className = 'lk-chip lk-chip--dense lk-dropdown__chip-more';
      more.textContent = '+' + overflow.length;
      more.title = overflow.map((v) => {
        const item = selectedMap.get(String(v));
        return item ? itemLabel(item) : String(v ?? '');
      }).join(', ');
      chipsEl.appendChild(more);
    }
  }

  function updateTriggerLabel() {
    if (multiple) {
      renderChips();
      updateClearAndPlaceholder();
      requestPositionUpdate();
      return;
    }
    const fallback = currentValue == null || currentValue === '' ? '' : String(currentValue);
    const label = currentItem ? itemLabel(currentItem) : fallback;
    const selectedValue = currentItem ? itemValue(currentItem) : null;
    const hasClearableSelection = selectedValue != null && String(selectedValue) !== '';

    triggerLabel.textContent = '';
    if (label && currentItem && typeof options.selectedTemplate === 'function') {
      triggerLabel.append(renderTemplate(options.selectedTemplate, currentItem, label));
    } else {
      triggerLabel.textContent = label || options.placeholder;
    }
    triggerLabel.classList.toggle('lk-dropdown__trigger-label--placeholder', !label);
    clearBtn.hidden = !(options.clearable && hasClearableSelection);
  }
  function focusSelected() {
    const sel = listEl.querySelector('.lk-dropdown__option--selected');
    if (sel) sel.focus();
    else listEl.querySelector('.lk-dropdown__option:not(.lk-dropdown__option--disabled)')?.focus();
  }

  // --- Panel position -------------------------------------------------------

  function positionPanel() {
    const rect   = trigger.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const margin = 8;
    const gap    = 4;

    const fixedWidth = options.panelWidth == null ? null
      : (typeof options.panelWidth === 'number' ? `${options.panelWidth}px` : String(options.panelWidth));
    panel.style.minWidth  = fixedWidth ? '' : `${rect.width}px`;
    panel.style.maxHeight = `${Math.min(320, vh * 0.5)}px`;

    const spaceBelow = vh - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const panelH     = Math.min(panel.scrollHeight || 300, 320);

    let top, openAbove;
    if (spaceBelow >= panelH || spaceBelow >= spaceAbove) {
      top = rect.bottom + gap;
      openAbove = false;
    } else {
      top = rect.top - Math.min(panelH, spaceAbove) - gap;
      openAbove = true;
    }

    panel.style.width = fixedWidth || `${rect.width}px`;
    const panelW = fixedWidth ? panel.offsetWidth : rect.width;
    let left = rect.left;
    if (left + panelW > vw - margin) left = vw - panelW - margin;
    if (left < margin) left = margin;

    panel.style.top  = `${top}px`;
    panel.style.left = `${left}px`;
    panel.dataset.side = openAbove ? 'top' : 'bottom';
    layer.classList.toggle('lk-dropdown__layer--above', openAbove);
  }


  function requestPositionUpdate() {
    if (!open || destroyed) return;
    if (positionRaf != null) return;

    positionRaf = requestAnimationFrame(() => {
      positionRaf = null;
      if (!open || destroyed) return;
      positionPanel();
    });
  }

  function cancelPositionUpdate() {
    if (positionRaf == null) return;
    cancelAnimationFrame(positionRaf);
    positionRaf = null;
  }

  // --- Open / close ---------------------------------------------------------

  function openPanel() {
    if (open || options.disabled || trigger.disabled || trigger.hasAttribute('disabled') || options.readonly || destroyed) return;
    if (searchInput) {
      searchInput.value = '';
      searchQuery = '';
    }
    open = true;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('lk-dropdown__trigger--open');
    // Inside a dialog or popup the layer must outrank that stacking context
    const z = floatingZIndex(trigger, 50);
    layer.style.zIndex = z == null ? 'var(--lk-z-dropdown)' : String(z);
    // Panel lives in <body>, so dense context must be mirrored onto it
    panel.classList.toggle('lk-dropdown__panel--dense',
      trigger.classList.contains('lk-input--dense') || !!trigger.closest('.lk-field--dense'));
    if (hasTransport() && options.server?.filter && options.useInput) {
      localItems = [];
      currentPage = 1;
      loadPage('', 1, false).then(() => {
        requestPositionUpdate();
      });
    } else if (hasTransport() && localItems.length === 0) {
      localItems = [];
      currentPage = 1;
      loadPage(searchQuery, 1, false).then(() => {
        requestPositionUpdate();
      });
    } else {
      applyFilter(searchQuery);
      renderList(false);
    }
    presence.show();
    window.addEventListener('resize', requestPositionUpdate);
    window.addEventListener('scroll', requestPositionUpdate, positionListenerOpts);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', requestPositionUpdate);
      window.visualViewport.addEventListener('scroll', requestPositionUpdate);
    }
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    if (options.infinite) {
      listEl.addEventListener('scroll', onListScroll);
      panel.addEventListener('scroll', onListScroll);
    }
  }
  function closePanel(reason = 'close') {
    if (!open || destroyed) return;

    open = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('lk-dropdown__trigger--open');
    presence.hide();

    window.removeEventListener('resize', requestPositionUpdate);
    window.removeEventListener('scroll', requestPositionUpdate, true);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', requestPositionUpdate);
      window.visualViewport.removeEventListener('scroll', requestPositionUpdate);
    }
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    listEl.removeEventListener('scroll', onListScroll);
    panel.removeEventListener('scroll', onListScroll);
    cancelPositionUpdate();
    if (reason !== 'outside' && reason !== 'tab' && reason !== 'destroy') {
      trigger.focus();
    }
  }

  // --- Infinite scroll ------------------------------------------------------

  function onListScroll() {
    if (!hasMore || loading) return;

    const el     = listEl.scrollHeight > listEl.clientHeight ? listEl : panel;
    const bottom = el.scrollTop + el.clientHeight;
    if (bottom >= el.scrollHeight - 60) {
      currentPage += 1;
      loadPage(searchQuery, currentPage, true);
    }
  }

  // --- Keyboard -------------------------------------------------------------

  function onOptionKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
    if (e.key === 'Escape') {
      closePanel('escape');
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    }
  }

  function moveFocus(dir) {
    const options = [...listEl.querySelectorAll('.lk-dropdown__option:not(.lk-dropdown__option--disabled)')];
    const current = document.activeElement;
    const idx     = options.indexOf(current);
    const next    = options[Math.max(0, Math.min(options.length - 1, idx + dir))];
    next?.focus();
  }

  function onTriggerKeydown(e) {
    if (e.target !== trigger) return; // keys inside chips (close buttons) are theirs
    if (multiple && (e.key === 'Backspace' || e.key === 'Delete') && selectedValues.length && !isLocked()) {
      e.preventDefault();
      removeValue(selectedValues[selectedValues.length - 1]);
      requestPositionUpdate();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openPanel();
      else moveFocus(1);
    }
    if (e.key === 'Escape') {
      closePanel('escape');
    }
  }

  function onDocumentClick(e) {
    if (!open) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    closePanel('outside');
  }

  function onDocumentKeydown(e) {
    if (!open) return;
    if (e.key === 'Escape') {
      // Listening in the capture phase: Escape closes only this panel, not a dialog around it
      e.stopPropagation();
      closePanel('escape');
    }
    if (e.key === 'Tab') closePanel('tab');
  }

  // --- Search ---------------------------------------------------------------

  if (searchInput) {
    debounceSearchFn = debounce((query) => {
      searchQuery = query;
      if (hasTransport() && options.server?.filter) {
        localItems  = [];
        currentPage = 1;
        loadPage(query, 1, false);
      } else {
        applyFilter(query);
        renderList(false);
      }
    }, options.debounce);

    searchInput.addEventListener('input', (e) => {
      debounceSearchFn(e.target.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
      if (e.key === 'Escape')    { closePanel('escape'); }
    });
  }

  // --- Bind trigger events --------------------------------------------------

  function onTriggerClick() {
    if (open) closePanel('toggle');
    else openPanel();
  }

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeydown);

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearValue();
  });

  // --- Set initial value if provided ----------------------------------------

  // currentValue comes from opts.value or an item flagged `selected`
  if (currentValue != null) {
    const found = localItems.find(i => valueEquals(itemValue(i), currentValue));
    if (found) currentItem = found;
  }
  updateTriggerLabel();
  syncHiddenInputs();

  // --- Component object -----------------------------------------------------

  const comp = {};
  applyBase(comp, trigger, { hiddenTarget: field.wrapper || trigger });


  Object.defineProperties(comp, {
    value: {
      get() { return multiple ? selectedValues.slice() : currentValue; },
      set(v) {
        if (multiple) { setValues(v); return; }
        const found = localItems.find(i => valueEquals(itemValue(i), v));
        currentValue = v;
        currentItem  = found || null;
        hiddenInput.value = v ?? '';
        updateTriggerLabel();
        if (open) refreshOptionStates();
      },
      enumerable: true,
    },

    selectedItem: {
      get() { return multiple ? (selectedItemList()[0] || null) : currentItem; },
      enumerable: true,
    },

    selectedItems: {
      get() { return multiple ? selectedItemList() : (currentItem ? [currentItem] : []); },
      enumerable: true,
    },

    multiple: {
      get() { return multiple; },
      enumerable: true,
    },

    prepend: {
      get() { return prependEl.hidden ? null : prependEl; },
      set(value) { setDecoratorContent(prependEl, value); },
      enumerable: true,
    },

    append: {
      get() { return appendEl.hidden ? null : appendEl; },
      set(value) { setDecoratorContent(appendEl, value); },
      enumerable: true,
    },

    items: {
      get() { return localItems.slice(); },
      set(arr) {
        localItems = (arr || []).map(normalizeItem);

        if (multiple) {
          selectedValues.forEach((v) => {
            selectedMap.set(String(v), localItems.find((i) => valueEquals(itemValue(i), v)) || selectedMap.get(String(v)) || null);
          });
        } else if (currentValue != null) {
          currentItem = localItems.find(i => valueEquals(itemValue(i), currentValue)) || null;
        } else {
          currentItem = null;
        }

        updateTriggerLabel();
        applyFilter(searchQuery);
        if (open) {
          renderList(false);
          refreshOptionStates();
        }
      },
      enumerable: true,
    },

    loading: {
      get() { return loading; },
      enumerable: true,
    },

    name: {
      get() { return hiddenInput.name; },
      set(v) {
        hiddenInput.name = v || '';
        extraInputs.forEach((input) => { input.name = hiddenInput.name; });
      },
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

    required: {
      get() { return hiddenInput.required; },
      set(v) { field.setRequired(v); },
      enumerable: true,
    },

    mandatory: {
      get() { return hiddenInput.required; },
      set(v) { field.setRequired(v); },
    },

    readonly: {
      get() { return options.readonly; },
      set(v) {
        options.readonly = !!v;
        trigger.classList.toggle('lk-dropdown__trigger--readonly', !!v);
        if (v && open) closePanel('readonly');
        if (multiple) updateTriggerLabel(); // chips lose/regain their remove buttons
      },
      enumerable: true,
    },

    disabled: {
      get() { return options.disabled; },
      set(v) {
        options.disabled = !!v;
        if (multiple) {
          // A <div> trigger has no .disabled property — mirror it with attributes
          trigger.toggleAttribute('disabled', !!v);
          trigger.setAttribute('tabindex', v ? '-1' : '0');
          if (v) trigger.setAttribute('aria-disabled', 'true');
          else trigger.removeAttribute('aria-disabled');
        } else {
          trigger.disabled = !!v;
        }
        hiddenInput.disabled = !!v;
        extraInputs.forEach((input) => { input.disabled = !!v; });
        if (v && open) closePanel('disabled');
        if (multiple) updateTriggerLabel();
      },
      enumerable: true,
    },
  });

  // Apply initial states
  if (options.disabled) comp.disabled = true;
  if (options.readonly) comp.readonly = true;

  comp.setError = field.setError;
  comp.clearError = field.clearError;
  comp.refreshLabels = field.refreshLabels;

  comp.open  = () => openPanel();
  comp.close = () => closePanel('manual');
  comp.focus = (o) => trigger.focus(o);

  Object.defineProperties(comp, {
    isOpen: { get() { return open; }, enumerable: true },
    panelEl: { get() { return panel; }, enumerable: true },
  });

  validation = attachValidation(comp, {
    opts,
    getValue: () => (multiple ? selectedValues.slice() : currentValue),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => hiddenInput.required,
    roots: () => [trigger, panel],
    isOpen: () => open,
    setError: field.setError,
    clearError: field.clearError,
  });

  // Load from remote manually
  comp.load = async () => {
    if (!hasTransport()) return;
    localItems  = [];
    currentPage = 1;
    await loadPage(searchQuery, 1, false);
    if (open) requestPositionUpdate();
  };

  comp.destroy = function () {
    validation.destroy();
    destroyed = true;
    if (open) closePanel('destroy');

    presence.destroy();
    trigger.removeEventListener('click', onTriggerClick);
    trigger.removeEventListener('keydown', onTriggerKeydown);
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    window.removeEventListener('resize', requestPositionUpdate);
    window.removeEventListener('scroll', requestPositionUpdate, true);
    listEl.removeEventListener('scroll', onListScroll);
    panel.removeEventListener('scroll', onListScroll);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', requestPositionUpdate);
      window.visualViewport.removeEventListener('scroll', requestPositionUpdate);
    }
    cancelPositionUpdate();

    if (abortCtrl) abortCtrl.abort();
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    field.destroyField();

    // Restore a placeholder so the DOM isn't completely broken
    const placeholder = document.createElement('span');
    placeholder.className = 'lk-dropdown--destroyed';
    trigger.parentNode?.insertBefore(placeholder, trigger);
    chipComps.forEach((c) => c.destroy());
    chipComps = [];
    while (extraInputs.length) extraInputs.pop().remove();
    trigger.remove();
    hiddenInput.remove();
  };

  return comp;
}











