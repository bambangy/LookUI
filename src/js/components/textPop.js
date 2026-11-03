// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkTextPop — lookup field: clicking it opens a popup with a search box and a
 * read-only lkTable to pick one record (single) or many (multiple, shown as chips).
 *
 * Structure:
 *   .lk-field > .lk-label
 *             + .lk-textpop.lk-input (role=combobox) > .lk-textpop__chips | .lk-textpop__label
 *                                                     + .lk-textpop__clear + .lk-textpop__icon
 *             + .lk-field-error
 *   input[type=hidden][name] (one per value)
 *   (body) .lk-popup-proxy > .lk-popup-proxy__panel.lk-textpop__panel >
 *            .lk-textpop__head + .lk-textpop__search + .lk-textpop__grid (.lk-datagrid) + .lk-textpop__foot
 *
 * @param {Element|string} el — an <input> (becomes the hidden value input)
 * @param {Object} [opts]
 * @param {Object|Array} opts.dataSource  — lkDataSource instance, its options, or a plain array
 * @param {Array}   [opts.columns]        — lkTable columns (default: generated from the data)
 * @param {string}  [opts.valueField]     — record key (default: the data source keyField, else 'id')
 * @param {string}  [opts.textField='name'] — field shown in the field / chips
 * @param {Function} [opts.displayText]   — (row) => string, overrides textField
 * @param {boolean} [opts.multiple=false] — pick many; selections render as lkChips
 * @param {number}  [opts.maxChips]       — show at most N chips, then a "+N" chip
 * @param {string}  [opts.chipColor='primary']
 * @param {any}     [opts.value]          — key, row object, or (multiple) an array of either
 * @param {string}  [opts.label] [opts.name] [opts.placeholder='Select…']
 * @param {string}  [opts.title]          — popup heading
 * @param {string}  [opts.searchPlaceholder='Search…']
 * @param {boolean} [opts.clearable=true]
 * @param {boolean|Object} [opts.pageable=true] — passed to lkTable
 * @param {number}  [opts.pageSize=8]     — page size when the popup owns the data source
 * @param {string|number} [opts.height]   — grid body height
 * @param {number}  [opts.popupWidth=560] — px (capped to the viewport)
 * @param {Object}  [opts.table]          — extra lkTable options
 * @param {boolean} [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Function} [opts.onChange]      — single: (value, { source, component, item }); multiple: (values[], { source, component, items })
 * @param {Array}   [opts.rules]          — validation rules (multiple: minLength / maxLength count the picks)
 * @param {boolean} [opts.validate]       — validate when focus leaves the field (popup closed)
 * @param {Function} [opts.onOpen] [opts.onClose]
 * @param {Function} [opts.beforeChange]  — (value | values, { source, component, item | items }) guard; false vetoes, another value replaces
 * @param {Function} [opts.beforeOpen]    — ({ source, component }) guard
 * @param {Function} [opts.beforeClose]   — (reason, { source, reason, component }) guard for user dismissals (escape / outside / toggle / api)
 * @param {Object}  [opts.text]           — text overrides (Look.i18n keys 'textpop.*'); explicit placeholder / searchPlaceholder win.
 *   `comp.text` stays the read-only display string of the selection; assign an object to it to replace the overrides.
 * @returns {Object}
 */

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { lkDataSource } from '../helpers/dataSource.js';
import { lkTable } from '../composables/table.js';
import { lkPopupProxy } from '../composables/popupProxy.js';
import { lkTextbox } from './form.js';
import { lkChip } from './chip.js';
import { lkIcon } from './icon.js';
import { attachValidation } from '../helpers/validation.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard, guardSync } from '../helpers/guard.js';

lkI18n.define('textpop', {
  placeholder: 'Select…',
  searchPlaceholder: 'Search…',
  done: 'Done',
  selected: { one: '{count} selected', other: '{count} selected' },
  more: '+{count}',
});

function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isDataSource(v) {
  return isObject(v) && typeof v.subscribe === 'function' && typeof v.load === 'function';
}

function debounce(fn, ms) {
  let t = null;
  const run = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  run.cancel = () => clearTimeout(t);
  return run;
}

export function lkTextPop(el, opts = {}) {
  const input = resolveEl(el, 'lkTextPop');

  const options = {
    dataSource: null,
    columns: null,
    valueField: null,
    textField: 'name',
    displayText: null,
    multiple: false,
    maxChips: null,
    chipColor: 'primary',
    value: undefined,
    label: null,
    name: null,
    title: null,
    clearable: true,
    pageable: true,
    pageSize: 8,
    height: null,
    popupWidth: 560,
    table: null,
    required: undefined,
    readonly: false,
    disabled: false,
    dense: false,
    onChange: null,
    onOpen: null,
    onClose: null,
    ...opts,
  };
  const multiple = !!options.multiple;

  // Texts: explicit options win, then `text` / Look.i18n
  let built = false;
  const tx = bindText('textpop', opts.text, () => refreshTexts());
  // The embedded grid shares the instance overrides that are meant for it ('table.*' and the shared 'common.*' / 'validation.*')
  const tableText = () => Object.fromEntries(Object.entries(tx.get()).filter(([k]) => /^(table|common|validation)[.]/.test(k)));
  const placeholderText = () => (opts.placeholder != null ? opts.placeholder : tx.t('placeholder'));
  const searchText = () => (opts.searchPlaceholder != null ? opts.searchPlaceholder : tx.t('searchPlaceholder'));

  // --- Data source ----------------------------------------------------------

  const ownsDs = !isDataSource(options.dataSource);
  const ds = ownsDs
    ? lkDataSource({
      pageSize: options.pageSize,
      ...(Array.isArray(options.dataSource) ? { data: options.dataSource } : (options.dataSource || {})),
      autoLoad: false,
    })
    : options.dataSource;
  const valueField = options.valueField || ds.keyField || 'id';
  // No pager: a popup-owned local source lists every record
  if (ownsDs && !options.pageable && !ds.server?.paging) ds.setPageSize(Number.MAX_SAFE_INTEGER);

  function keyOf(row) { return row?.[valueField]; }
  function same(a, b) { return String(a ?? '') === String(b ?? ''); }
  function findRow(key) {
    return ds.items.find((r) => same(keyOf(r), key)) || null;
  }
  function textOf(row, key) {
    if (row && typeof options.displayText === 'function') return String(options.displayText(row) ?? '');
    if (row) return String(row[options.textField] ?? row.label ?? row.text ?? keyOf(row) ?? '');
    return String(key ?? '');
  }

  // --- State: ordered keys + their rows (rows may be unknown for remote data) ---

  let keys = [];
  const rows = new Map(); // String(key) -> row | null

  function addValue(v) {
    const row = isObject(v) ? v : findRow(v);
    const key = isObject(v) ? keyOf(v) : v;
    if (key == null || key === '' || rows.has(String(key))) return;
    keys.push(key);
    rows.set(String(key), row);
  }

  function setValues(list) {
    keys = [];
    rows.clear();
    (Array.isArray(list) ? list : (list == null ? [] : [list])).forEach(addValue);
    if (!multiple && keys.length > 1) {
      keys.slice(1).forEach((k) => rows.delete(String(k)));
      keys = keys.slice(0, 1);
    }
  }

  // Rows arrive after the values (remote load): fill in the gaps so labels resolve
  function resolveRows() {
    let changed = false;
    keys.forEach((k) => {
      if (rows.get(String(k))) return;
      const row = findRow(k);
      if (row) { rows.set(String(k), row); changed = true; }
    });
    if (changed) renderTrigger();
  }

  setValues(options.value);

  // --- DOM: trigger ---------------------------------------------------------

  const originalType = input.getAttribute('type');
  const originalName = input.getAttribute('name');
  const originalValue = input.value;
  input.type = 'hidden';
  const name = options.name ?? originalName;
  if (name) input.name = name;
  const extraInputs = [];

  const trigger = document.createElement('div');
  trigger.className = 'lk-input lk-textpop' + (multiple ? ' lk-textpop--multiple' : '')
    + (options.dense ? ' lk-input--dense lk-textpop--dense' : '');
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('tabindex', '0');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  // The trigger takes over the input's id so <label for> keeps pointing at the control
  const inputId = input.id;
  if (inputId) {
    input.removeAttribute('id');
    trigger.id = inputId;
  }

  const chipsEl = document.createElement('span');
  chipsEl.className = 'lk-textpop__chips';
  const labelEl = document.createElement('span');
  labelEl.className = 'lk-textpop__label';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'lk-textpop__clear';
  clearBtn.setAttribute('aria-label', tx.tf('common.clear'));
  clearBtn.tabIndex = -1;
  clearBtn.appendChild(lkIcon('close', { size: 'xs' }));
  const iconEl = lkIcon('search', { size: 'sm' });
  iconEl.classList.add('lk-textpop__icon');
  trigger.append(chipsEl, labelEl, clearBtn, iconEl);

  input.parentNode?.insertBefore(trigger, input);

  const field = wrapField(trigger, {
    label: options.label,
    required: options.required ?? opts.mandatory ?? (input.required || undefined),
    requiredMark: options.requiredMark,
    requiredTarget: input,
  });
  // Keep the hidden input(s) right after the visible control, inside the field
  trigger.after(input);

  let chipComps = [];
  let readonly = false;
  let disabled = false;

  function locked() { return readonly || disabled; }

  function syncInputs() {
    input.value = keys.length ? String(keys[0] ?? '') : '';
    while (extraInputs.length) extraInputs.pop().remove();
    if (!multiple) return;
    let after = input;
    keys.slice(1).forEach((k) => {
      const extra = document.createElement('input');
      extra.type = 'hidden';
      extra.name = input.name;
      extra.value = String(k ?? '');
      extra.disabled = input.disabled;
      after.after(extra);
      after = extra;
      extraInputs.push(extra);
    });
  }

  function renderTrigger() {
    chipComps.forEach((c) => c.destroy());
    chipComps = [];
    chipsEl.textContent = '';
    const has = keys.length > 0;

    if (multiple) {
      const limit = Number.isFinite(options.maxChips) && options.maxChips >= 0 ? options.maxChips : Infinity;
      const shown = keys.slice(0, limit);
      const overflow = keys.slice(shown.length);
      shown.forEach((k) => {
        const chipEl = document.createElement('span');
        chipsEl.appendChild(chipEl);
        const chip = lkChip(chipEl, {
          label: textOf(rows.get(String(k)), k),
          color: options.chipColor,
          dense: true,
          removable: !locked(),
          removeLabel: tx.tf('common.remove'),
          onRemove() {
            removeValue(k);
            return false; // removeValue re-renders the chips (and the +N counter)
          },
        });
        chipEl.title = chip.label;
        const close = chipEl.querySelector('.lk-chip__close');
        if (close) close.tabIndex = -1; // Backspace on the field removes chips from the keyboard
        chipComps.push(chip);
      });
      if (overflow.length) {
        const more = document.createElement('span');
        more.className = 'lk-chip lk-chip--dense lk-textpop__more';
        more.textContent = tx.t('more', { count: overflow.length });
        more.title = overflow.map((k) => textOf(rows.get(String(k)), k)).join(', ');
        chipsEl.appendChild(more);
      }
      chipsEl.hidden = !has;
      labelEl.hidden = has;
      labelEl.textContent = placeholderText();
      labelEl.classList.add('lk-textpop__label--placeholder');
    } else {
      chipsEl.hidden = true;
      labelEl.hidden = false;
      labelEl.textContent = has ? textOf(rows.get(String(keys[0])), keys[0]) : placeholderText();
      labelEl.classList.toggle('lk-textpop__label--placeholder', !has);
      trigger.title = has ? labelEl.textContent : '';
    }
    clearBtn.hidden = !(options.clearable && has && !locked());
    trigger.classList.toggle('lk-textpop--has-value', has);
    if (proxy?.isOpen) proxy.updatePosition(trigger);
  }

  let validation = null; // set once the component object exists

  // source: 'select' | 'remove' | 'clear'
  function emitChange(source) {
    validation?.changed();
    if (typeof options.onChange !== 'function') return;
    const list = keys.map((k) => rows.get(String(k)) || null);
    if (multiple) options.onChange(keys.slice(), { source, component: comp, items: list });
    else options.onChange(keys.length ? keys[0] : null, { source, component: comp, item: list[0] || null });
  }

  function commit(source = 'select') {
    syncInputs();
    renderTrigger();
    updateFoot();
    emitChange(source);
  }

  const isThenable = (r) => r != null && typeof r.then === 'function';

  /**
   * Every user-driven change: beforeChange(value | values, { source, component, item | items }).
   * nextKeys / nextRows (Map String(key) -> row) describe what is about to happen. A veto leaves the
   * selection alone (the grid ticks are put back); a returned value replaces the new selection.
   * @returns {boolean|Promise<boolean>} guard() result
   */
  function change(nextKeys, nextRows, source) {
    const rowList = nextKeys.map((k) => nextRows.get(String(k)) || findRow(k) || null);
    const payload = multiple ? nextKeys.slice() : (nextKeys.length ? nextKeys[0] : null);
    const ctx = multiple ? { source, component: comp, items: rowList } : { source, component: comp, item: rowList[0] || null };
    const result = guard(trigger, options, 'change', payload, ctx, (p) => {
      const norm = multiple ? (Array.isArray(p) ? p : []) : (p == null ? [] : [p]);
      const unchanged = norm.length === nextKeys.length && norm.every((k, i) => same(k, nextKeys[i]));
      if (unchanged) {
        keys = nextKeys.slice();
        rows.clear();
        nextKeys.forEach((k) => rows.set(String(k), nextRows.get(String(k)) || findRow(k) || null));
      } else {
        setValues(p);
      }
      if (grid) syncGridSelection();
      commit(source);
    });
    if (result !== true && grid) {
      syncGridSelection(); // vetoed / pending: show the committed selection
      if (isThenable(result)) result.then((ok) => { if (ok === false && grid) syncGridSelection(); });
    }
    return result;
  }

  function removeValue(k) {
    if (!rows.has(String(k))) return;
    const nk = keys.filter((x) => !same(x, k));
    const nr = new Map(rows);
    nr.delete(String(k));
    change(nk, nr, 'remove');
  }

  function clearAll() {
    if (!keys.length) return;
    change([], new Map(), 'clear');
  }

  // --- Popup ----------------------------------------------------------------

  let proxy = null;
  let grid = null;
  let searchBox = null;
  let footCount = null;
  let footClear = null;
  let footDone = null;
  let searchInputEl = null;
  let syncing = false;
  let stopResolve = null;
  const search = debounce((term) => grid?.search(term), 250);

  function syncGridSelection() {
    syncing = true;
    grid.clearSelection();
    if (keys.length) grid.select(keys.map((k) => rows.get(String(k)) || k));
    syncing = false;
  }

  function updateFoot() {
    if (footCount) footCount.textContent = tx.t('selected', { count: keys.length });
  }

  // Multiple: the grid only knows the rows on screen — merge its view into our keys
  // so values on other pages (or not loaded yet) survive.
  function onGridChange({ selectedRows }) {
    if (syncing) return;
    if (!multiple) {
      if (selectedRows.length) pick(selectedRows[0]);
      return;
    }
    const picked = new Set(selectedRows.map((r) => String(keyOf(r))));
    let changed = false;
    let nk = keys.slice();
    const nr = new Map(rows);
    grid.dataSource.view.forEach((row) => {
      const k = keyOf(row);
      const isOn = picked.has(String(k));
      if (isOn && !nr.has(String(k))) {
        nk.push(k);
        nr.set(String(k), row);
        changed = true;
      } else if (!isOn && nr.has(String(k))) {
        nr.delete(String(k));
        nk = nk.filter((x) => !same(x, k));
        changed = true;
      }
    });
    if (changed) change(nk, nr, 'select');
  }

  function pick(row) {
    const k = keyOf(row);
    const changed = !(keys.length === 1 && same(keys[0], k));
    // The popup closes either way (a veto keeps the old value)
    if (changed) change([k], new Map([[String(k), row]]), 'select');
    close();
  }

  function build() {
    const panel = document.createElement('div');
    panel.className = 'lk-textpop__body';

    if (options.title) {
      const head = document.createElement('div');
      head.className = 'lk-textpop__head';
      head.textContent = options.title;
      panel.appendChild(head);
    }

    const searchWrap = document.createElement('div');
    searchWrap.className = 'lk-textpop__search';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = searchText();
    searchInput.setAttribute('aria-label', searchText());
    searchInput.autocomplete = 'off';
    searchInputEl = searchInput;
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);
    searchBox = lkTextbox(searchInput, { type: 'search', prepend: lkIcon('search', { size: 'sm' }) });
    searchInput.classList.add('lk-input--dense');
    searchInput.addEventListener('input', () => search(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        gridHost.querySelector('tr.lk-datagrid__row')?.focus();
      }
    });

    const gridHost = document.createElement('div');
    gridHost.className = 'lk-textpop__grid';
    panel.appendChild(gridHost);

    const columns = options.columns
      ? (multiple ? [{ selectable: true, width: 44 }, ...options.columns] : options.columns)
      : null;

    grid = lkTable(gridHost, {
      dataSource: ds,
      columns,
      keyField: valueField,
      selectable: multiple ? 'multiple' : 'single',
      pageable: options.pageable,
      height: options.height,
      dense: true,
      hover: true,
      columnMenu: false,
      filterable: false,
      editable: false,
      autoBind: false,
      text: tableText(),
      ...(options.table || {}),
      onChange: onGridChange,
      onRowClick({ row }) {
        if (!multiple && !syncing) pick(row);
      },
    });
    // Selected rows inside the grid get a visible tick in single mode as well
    gridHost.classList.toggle('lk-textpop__grid--single', !multiple);

    if (multiple) {
      const foot = document.createElement('div');
      foot.className = 'lk-textpop__foot';
      footCount = document.createElement('span');
      footCount.className = 'lk-textpop__count';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'lk-btn lk-btn--sm lk-btn--ghost';
      clear.textContent = tx.tf('common.clear');
      clear.addEventListener('click', clearAll);
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'lk-btn lk-btn--sm lk-btn--primary';
      done.textContent = tx.t('done');
      done.addEventListener('click', () => close());
      footClear = clear;
      footDone = done;
      foot.append(footCount, clear, done);
      panel.appendChild(foot);
      updateFoot();
    }

    proxy = lkPopupProxy(trigger, {
      className: 'lk-textpop__panel' + (options.dense ? ' lk-textpop__panel--dense' : ''),
      placement: 'bottom-left',
      toggleOnTrigger: false,
      closeOnOutside: false, // handled below: nested layers (pager, menus) count as inside
      // One guard point for every user dismissal (escape, outside, toggle, comp.close()); consequences
      // like picking a row ('close') or readonly / disabled / destroy are not asked.
      beforeHide(reason) {
        if (!GUARDED_CLOSE.has(reason)) return undefined;
        const res = guardSync(trigger, options, 'close', reason, { source: reason === 'manual' ? 'api' : reason, reason, component: comp });
        return res.allowed ? undefined : false;
      },
      onHide(reason) {
        document.removeEventListener('pointerdown', onOutside, true);
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('lk-textpop--open');
        if (reason !== 'destroy' && reason !== 'outside') trigger.focus({ preventScroll: true });
        if (typeof options.onClose === 'function') options.onClose(reason, comp);
      },
    });
    // Build live DOM straight into the panel (setContent would clone and drop listeners)
    proxy.panelEl.textContent = '';
    proxy.panelEl.appendChild(panel);

    stopResolve = ds.subscribe(() => resolveRows());
  }

  const GUARDED_CLOSE = new Set(['escape', 'outside', 'toggle', 'manual']);

  function onOutside(e) {
    const t = e.target;
    if (!proxy?.isOpen) return;
    if (proxy.panelEl.contains(t) || trigger.contains(t)) return;
    // Layers the grid opens (page-size dropdown, column menus) live in <body>
    if (t.closest?.('.lk-dropdown__layer, .lk-popup-proxy')) return;
    close('outside');
  }

  function open(source = 'user') {
    if (locked() || (proxy && proxy.isOpen)) return;
    guard(trigger, options, 'open', undefined, { source, component: comp }, doOpen);
  }

  function doOpen() {
    if (locked() || (proxy && proxy.isOpen)) return;
    if (!grid) build();
    const width = Math.min(Number(options.popupWidth) || 560, window.innerWidth - 16);
    proxy.panelEl.style.width = `${width}px`;
    syncGridSelection();
    if (searchBox && searchBox.value) {
      searchBox.value = '';
      grid.search('');
    }
    if (ds.canRead && !ds.items.length && !ds.loading) ds.load().catch(() => {});
    proxy.show(trigger);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('lk-textpop--open');
    document.addEventListener('pointerdown', onOutside, true);
    setTimeout(() => searchBox?.el.focus({ preventScroll: true }), 30);
    if (typeof options.onOpen === 'function') options.onOpen(comp);
  }

  function close(reason = 'close') {
    if (!proxy || !proxy.isOpen) return;
    search.cancel();
    proxy.hide(reason);
  }

  // --- Events ---------------------------------------------------------------

  function onTriggerClick(e) {
    // Registered before lkPopupProxy's own trigger listener: open/close is decided here only
    e.stopImmediatePropagation();
    if (e.target.closest('.lk-chip__close, .lk-textpop__clear')) return;
    if (proxy?.isOpen) close('toggle');
    else open();
  }

  function onTriggerKeydown(e) {
    if (e.target !== trigger) return;
    if (multiple && (e.key === 'Backspace' || e.key === 'Delete') && keys.length && !locked()) {
      e.preventDefault();
      removeValue(keys[keys.length - 1]);
      return;
    }
    if (!multiple && (e.key === 'Backspace' || e.key === 'Delete') && keys.length && !locked() && options.clearable) {
      e.preventDefault();
      clearAll();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    }
  }

  function onClear(e) {
    e.stopPropagation();
    if (!locked()) clearAll();
  }

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeydown);
  clearBtn.addEventListener('click', onClear);

  // Local data is known up front, so preset keys can pick up their rows now
  if (!ds.canRead) {
    keys.forEach((k) => {
      if (!rows.get(String(k))) rows.set(String(k), findRow(k));
    });
  }
  syncInputs();
  renderTrigger();

  // --- Component object -----------------------------------------------------

  const comp = {};
  applyBase(comp, trigger, { hiddenTarget: field.wrapper || trigger });

  Object.defineProperties(comp, {
    value: {
      get() { return multiple ? keys.slice() : (keys.length ? keys[0] : null); },
      set(v) {
        setValues(v);
        if (grid && proxy.isOpen) syncGridSelection();
        syncInputs();
        renderTrigger();
        updateFoot();
      },
      enumerable: true,
    },
    selectedRows: {
      get() { return keys.map((k) => rows.get(String(k)) || null); },
      enumerable: true,
    },
    // Read: the display text of the selection. Write an object: replace the text overrides (Look.i18n keys 'textpop.*')
    text: {
      get() { return keys.map((k) => textOf(rows.get(String(k)), k)).join(', '); },
      set(v) { if (v && typeof v === 'object') tx.set(v); },
      enumerable: true,
    },
    texts: { get() { return tx.get(); }, enumerable: true },
    multiple: { get() { return multiple; }, enumerable: true },
    isOpen: { get() { return !!proxy?.isOpen; }, enumerable: true },
    dataSource: { get() { return ds; }, enumerable: true },
    grid: { get() { return grid; }, enumerable: true },
    name: {
      get() { return input.name; },
      set(v) {
        input.name = v || '';
        extraInputs.forEach((x) => { x.name = input.name; });
      },
      enumerable: true,
    },
    label: {
      get() { return field.getLabel(); },
      set(v) { field.setLabel(v); },
      enumerable: true,
    },
    required: {
      get() { return input.required; },
      set(v) { field.setRequired(v); },
      enumerable: true,
    },
    readonly: {
      get() { return readonly; },
      set(v) {
        readonly = !!v;
        trigger.classList.toggle('lk-textpop--readonly', readonly);
        trigger.setAttribute('aria-readonly', String(readonly));
        if (readonly) close('readonly');
        renderTrigger();
      },
      enumerable: true,
    },
    disabled: {
      get() { return disabled; },
      set(v) {
        disabled = !!v;
        trigger.toggleAttribute('disabled', disabled);
        trigger.classList.toggle('lk-disabled', disabled);
        trigger.setAttribute('tabindex', disabled ? '-1' : '0');
        if (disabled) trigger.setAttribute('aria-disabled', 'true');
        else trigger.removeAttribute('aria-disabled');
        input.disabled = disabled;
        extraInputs.forEach((x) => { x.disabled = disabled; });
        if (disabled) close('disabled');
        renderTrigger();
      },
      enumerable: true,
    },
    enabled: {
      get() { return !disabled; },
      set(v) { comp.disabled = !v; },
      enumerable: true,
    },
  });

  if (options.readonly) comp.readonly = true;
  if (options.disabled) comp.disabled = true;

  comp.open = () => open('api');
  comp.close = () => close('manual');
  comp.clear = () => clearAll();
  comp.focus = (o) => trigger.focus(o);
  comp.setError = field.setError;
  comp.clearError = field.clearError;
  comp.refreshLabels = field.refreshLabels;

  // Locale switch / comp.text = {…}: re-apply every text to what is rendered (selection, open popup, typed search stay)
  function refreshTexts() {
    if (!built) return;
    clearBtn.setAttribute('aria-label', tx.tf('common.clear'));
    renderTrigger();
    if (searchInputEl) {
      searchInputEl.placeholder = searchText();
      searchInputEl.setAttribute('aria-label', searchText());
    }
    if (footClear) footClear.textContent = tx.tf('common.clear');
    if (footDone) footDone.textContent = tx.t('done');
    if (grid && !(options.table && options.table.text)) grid.text = tableText();
    updateFoot();
  }
  built = true;

  validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => (multiple ? keys.slice() : (keys.length ? keys[0] : null)),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => input.required,
    roots: () => [trigger, proxy?.panelEl],
    isOpen: () => !!proxy?.isOpen,
    setError: field.setError,
    clearError: field.clearError,
  });

  comp.destroy = function () {
    tx.destroy();
    validation.destroy();
    search.cancel();
    document.removeEventListener('pointerdown', onOutside, true);
    trigger.removeEventListener('click', onTriggerClick);
    trigger.removeEventListener('keydown', onTriggerKeydown);
    clearBtn.removeEventListener('click', onClear);
    stopResolve?.();
    proxy?.destroy();
    searchBox?.destroy();
    grid?.destroy();
    chipComps.forEach((c) => c.destroy());
    chipComps = [];
    while (extraInputs.length) extraInputs.pop().remove();
    field.destroyField();
    trigger.parentNode?.insertBefore(input, trigger);
    trigger.remove();
    if (inputId) input.id = inputId;
    if (originalType == null) input.removeAttribute('type');
    else input.setAttribute('type', originalType);
    if (originalName == null) input.removeAttribute('name');
    else input.setAttribute('name', originalName);
    input.value = originalValue;
    input.disabled = false;
  };

  return comp;
}
