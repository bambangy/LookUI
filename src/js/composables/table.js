// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// lkTable — data grid composable (Kendo Grid–style).
//
//   const grid = Look.lkTable('#grid', {
//     dataSource: { data: rows, pageSize: 10 },   // or an lkDataSource instance
//     columns: [{ field: 'name', title: 'Name' }, …],
//     sortable: true, pageable: true, filterable: true, editable: 'inline',
//   });
//
// The target is an empty container; the grid builds all of its own markup.
// Calling lkTable on an existing <table> without `columns`/`dataSource` keeps
// the legacy behavior (enhance the markup with click-to-sort headers).

import { resolveEl, applyBase } from '../helpers/base.js';
import { qsa } from '../core/index.js';
import { lkDataSource } from '../helpers/dataSource.js';
import { lkPagination } from '../components/pagination.js';
import { lkDropdown } from '../components/dropdown.js';
import { lkTextbox, lkCheckbox, lkSwitch } from '../components/form.js';
import { lkRating } from '../components/rating.js';
import { lkPhone } from '../components/phone.js';
import { lkIcon } from '../components/icon.js';
import { lkDialog } from './dialog.js';
import { lkDate } from './date.js';
import { lkPopupProxy } from './popupProxy.js';
import { extractFieldErrors, firstMessage } from '../helpers/validation.js';

const SORT_ANIM_MS = 260;

// Filter operators per column type (first one is the default)
const OPERATORS = {
  string: [
    ['contains', 'Contains'], ['eq', 'Is equal to'], ['ne', 'Is not equal to'],
    ['startsWith', 'Starts with'], ['endsWith', 'Ends with'],
  ],
  number: [
    ['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'],
  ],
  date: [
    ['on', 'Is on'], ['before', 'Is before'], ['after', 'Is after'],
  ],
};

// --- small helpers -------------------------------------------------------------

function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isDataSource(v) {
  return isObject(v) && typeof v.subscribe === 'function' && typeof v.setSort === 'function';
}

function getField(row, field) {
  if (!field) return undefined;
  if (!String(field).includes('.')) return row?.[field];
  return String(field).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), row);
}

function setField(row, field, value) {
  const parts = String(field).split('.');
  let target = row;
  parts.slice(0, -1).forEach((key) => {
    if (!isObject(target[key])) target[key] = {};
    target = target[key];
  });
  target[parts[parts.length - 1]] = value;
}

function titleCase(field) {
  return String(field)
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// Put a template/format result into a cell. Nodes are appended, strings from
// `template` are HTML (like Kendo templates), everything else is plain text.
function fill(target, content, asHtml) {
  if (content == null || content === false) return;
  if (content instanceof Node) target.appendChild(content);
  else if (asHtml) target.innerHTML = String(content);
  else target.textContent = String(content);
}

function normalizeSort(sort) {
  if (!sort) return [];
  const list = Array.isArray(sort) ? sort : [sort];
  return list.filter((s) => isObject(s) && s.field).map((s) => ({
    field: s.field,
    dir: String(s.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
  }));
}

function toDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Local calendar day as YYYY-MM-DD (what the user sees, not the UTC day)
function dayKey(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultFormat(value, type) {
  if (value == null || value === '') return '';
  if (type === 'number' && Number.isFinite(Number(value))) return Number(value).toLocaleString();
  if (type === 'date') {
    const d = toDate(value);
    return d ? d.toLocaleDateString() : String(value);
  }
  if (type === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function toNumberOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Component editors by name: column.editor = 'dropdown' | { type: 'dropdown', options }.
// Any other factory with the (el, opts) → { value, destroy } contract works via { component, options }.
const EDITOR_TYPES = {
  textbox:  { factory: lkTextbox, tag: 'input' },
  textarea: { factory: lkTextbox, tag: 'textarea' },
  number:   { factory: lkTextbox, tag: 'input', inputType: 'number', parse: toNumberOrNull },
  dropdown: { factory: lkDropdown, tag: 'select' },
  checkbox: { factory: lkCheckbox, tag: 'input', inputType: 'checkbox', checkable: true },
  switch:   { factory: lkSwitch, tag: 'input', inputType: 'checkbox', checkable: true },
  rating:   { factory: lkRating, tag: 'div', className: 'lk-rating' },
  phone:    { factory: lkPhone, tag: 'input' },
};

const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])';

function normalizeValues(values) {
  return (values || []).map((v) => (isObject(v) ? { value: v.value, label: String(v.label ?? v.text ?? v.value) } : { value: v, label: String(v) }));
}

/**
 * Data grid (or legacy table enhancer).
 *
 * @param {Element|string} target — empty container for the grid (or an existing <table> for legacy mode)
 * @param {Object} [opts]
 * @param {Object} [opts.dataSource] — lkDataSource instance, or lkDataSource options (e.g. { data, transport, server, pageSize })
 * @param {Array}  [opts.columns] — column definitions (auto-generated from the first record when omitted):
 *   { field, title, width, minWidth, align, type: 'string'|'number'|'date'|'boolean',
 *     sortable, filterable, menu, hidden, format(value, row), template(row, value) → string(HTML)|Node,
 *     headerTemplate, className, headerClassName,
 *     editable, values: [{ value, label }],
 *     editor: (container, { value, row, column, dense, setValue }) → Node | { destroy, focus } | cleanup fn
 *           | 'textbox' | 'textarea' | 'number' | 'dropdown' | 'checkbox' | 'switch' | 'rating' | 'date' | 'phone'
 *           | { type, options } | { component: lkTextPop, options, tag }   (options may be ({ value, row, column }) => ({…})),
 *     validation: { required, min, max, minLength, maxLength, pattern, message } | validate(value, row) → true|string,
 *     defaultValue }
 *   { selectable: true }                      — checkbox column (multiple selection)
 *   { command: ['edit', 'destroy', { name, text, icon, color, click(row, grid, e) }], title, width }
 * @param {boolean|Object} [opts.sortable=true]  — or { mode: 'single'|'multiple', allowUnsort: true }
 * @param {boolean|Object} [opts.pageable=false] — or { pageSizes: [10, 20, 50], info: true, maxVisible: 7 }
 * @param {boolean|Object} [opts.filterable=false] — true (column menu) | { mode: 'menu'|'row' }
 * @param {boolean} [opts.columnMenu=true] — ⋮ menu in each header: sort, filter, column visibility
 * @param {boolean|string|Object} [opts.editable=false] — 'inline' | 'popup' | { mode, createAt: 'top'|'bottom', title }
 * @param {boolean|string} [opts.selectable=false] — true | 'single' | 'multiple'
 * @param {Array}   [opts.toolbar] — 'create' | 'search' | { text, icon, color, click(grid) } | Node
 * @param {string|number} [opts.height] — fixed body height (scrolls with a sticky header)
 * @param {boolean} [opts.striped] [opts.hover=true] [opts.bordered] [opts.dense]
 * @param {boolean} [opts.autoBind=true] — load remote data on creation
 * @param {string}  [opts.keyField] — record key (default: the data source's keyField)
 * @param {string|Function} [opts.noRecords='No records found']
 * @param {string}  [opts.confirmDelete='Delete this record?'] — false to delete without asking
 * @param {Function} [opts.rowClass] — (row) => className
 * @param {Function} [opts.onDataBound] [opts.onChange] [opts.onRowClick] [opts.onSort] [opts.onPage] [opts.onFilter]
 *                   [opts.onEdit] [opts.onSave] (return false to veto) [opts.onCancel] [opts.onError]
 * @returns {Object}
 */
export function lkTable(target, opts = {}) {
  const node = resolveEl(target, 'lkTable');
  if (node.tagName === 'TABLE' && !opts.columns && !opts.dataSource) {
    return enhanceTable(node, opts);
  }
  return createGrid(node, opts);
}

// =============================================================================
// Grid
// =============================================================================

function createGrid(root, opts) {
  const options = {
    columns: null,
    sortable: true,
    pageable: false,
    filterable: false,
    columnMenu: true,
    editable: false,
    selectable: false,
    toolbar: null,
    height: null,
    striped: false,
    hover: true,
    bordered: false,
    dense: false,
    autoBind: true,
    keyField: null,
    noRecords: 'No records found',
    confirmDelete: 'Delete this record?',
    rowClass: null,
    ...opts,
  };

  const sortCfg = {
    enabled: options.sortable !== false,
    mode: isObject(options.sortable) && options.sortable.mode === 'multiple' ? 'multiple' : 'single',
    allowUnsort: !(isObject(options.sortable) && options.sortable.allowUnsort === false),
  };
  const filterMode = !options.filterable ? null
    : (isObject(options.filterable) && options.filterable.mode === 'row' ? 'row' : 'menu');
  const pageCfg = options.pageable
    ? { pageSizes: null, info: true, maxVisible: 7, ...(isObject(options.pageable) ? options.pageable : {}) }
    : null;
  const selectMode = options.selectable === 'multiple' ? 'multiple'
    : (options.selectable ? 'single' : null);
  const editCfg = options.editable
    ? {
      mode: (isObject(options.editable) ? options.editable.mode : options.editable) === 'popup' ? 'popup' : 'inline',
      createAt: isObject(options.editable) && options.editable.createAt === 'bottom' ? 'bottom' : 'top',
      title: isObject(options.editable) ? options.editable.title : null,
    }
    : null;

  // --- Data source ---------------------------------------------------------------

  const ownsDataSource = !isDataSource(options.dataSource);
  const ds = ownsDataSource
    ? lkDataSource({ ...(Array.isArray(options.dataSource) ? { data: options.dataSource } : (options.dataSource || {})), autoLoad: false })
    : options.dataSource;
  // Without a pager, a grid-owned local source shows every record on one page
  if (!pageCfg && ownsDataSource && !ds.server.paging) ds.setPageSize(Number.MAX_SAFE_INTEGER);
  const keyField = options.keyField || ds.keyField || 'id';

  function isRemote(part) {
    return ds.canRead && !!ds.server[part];
  }

  // Server-handled query parts need a fresh read after they change
  function syncRemote(part) {
    if (isRemote(part)) ds.load().catch(() => {});
  }

  // --- Columns ---------------------------------------------------------------------

  let columns = [];
  let colSeq = 0;
  function buildColumns(defs) {
    const list = (defs || []).map((def) => {
      const c = typeof def === 'string' ? { field: def } : { ...def };
      c._id = `c${colSeq++}`;
      if (c.selectable) c._kind = 'select';
      else if (c.command) c._kind = 'command';
      else c._kind = 'data';
      if (c._kind === 'data' && c.title == null) c.title = c.field ? titleCase(c.field) : '';
      if (c.align == null && c.type === 'number') c.align = 'right';
      c.hidden = !!c.hidden;
      return c;
    });
    // Editing needs Edit/Delete buttons somewhere
    if (editCfg && !list.some((c) => c._kind === 'command')) {
      list.push({ _id: `c${colSeq++}`, _kind: 'command', command: ['edit', 'destroy'], title: '', hidden: false, _auto: true });
    }
    columns = list;
  }
  function autoColumns() {
    const first = ds.view[0] || ds.items[0];
    return first && isObject(first) ? Object.keys(first).map((field) => ({ field })) : [];
  }
  buildColumns(options.columns || autoColumns());

  const visibleColumns = () => columns.filter((c) => !c.hidden);
  const colType = (c) => (c.type === 'number' || c.type === 'date' || c.type === 'boolean' ? c.type : 'string');
  const isSortable = (c) => sortCfg.enabled && c._kind === 'data' && c.field && c.sortable !== false;
  const isFilterable = (c) => !!filterMode && c._kind === 'data' && c.field && c.filterable !== false;
  const hasSelectColumn = () => columns.some((c) => c._kind === 'select' && !c.hidden);
  const hasMenu = (c) => options.columnMenu !== false && c.menu !== false && c._kind === 'data'
    && (isSortable(c) || (filterMode === 'menu' && isFilterable(c)) || toggleableColumns().length > 1);
  const toggleableColumns = () => columns.filter((c) => (c._kind === 'data' || (c._kind === 'command' && !c._auto)) && (c.title || c.field));

  // --- DOM -----------------------------------------------------------------------------

  const addedRootClass = !root.classList.contains('lk-datagrid');
  const originalChildren = Array.from(root.childNodes);
  originalChildren.forEach((n) => n.remove());
  root.classList.add('lk-datagrid');
  if (options.dense) root.classList.add('lk-datagrid--dense');

  const toolbarEl = el('div', 'lk-datagrid__toolbar');
  const contentEl = el('div', 'lk-datagrid__content');
  const tableEl = el('table', 'lk-table lk-datagrid__table');
  const colgroup = el('colgroup');
  const thead = el('thead');
  const headRow = el('tr', 'lk-datagrid__head-row');
  const filterRow = el('tr', 'lk-datagrid__filter-row');
  const tbody = el('tbody');
  const loadingEl = el('div', 'lk-datagrid__loading');
  const pagerEl = el('div', 'lk-datagrid__pager');

  tableEl.setAttribute('role', 'grid');
  if (selectMode === 'multiple' || hasSelectColumn()) tableEl.setAttribute('aria-multiselectable', 'true');
  if (options.striped)  tableEl.classList.add('lk-table--striped');
  if (options.hover)    tableEl.classList.add('lk-table--hover');
  if (options.bordered) tableEl.classList.add('lk-table--bordered');
  if (options.dense)    tableEl.classList.add('lk-table--dense');

  thead.appendChild(headRow);
  if (filterMode === 'row') thead.appendChild(filterRow);
  tableEl.append(colgroup, thead, tbody);
  contentEl.appendChild(tableEl);

  loadingEl.hidden = true;
  loadingEl.setAttribute('aria-hidden', 'true');
  loadingEl.appendChild(el('span', 'lk-spinner lk-datagrid__spinner'));

  if (options.height != null) {
    contentEl.style.height = typeof options.height === 'number' ? `${options.height}px` : String(options.height);
    root.classList.add('lk-datagrid--scrollable');
  }

  if (options.toolbar) root.appendChild(toolbarEl);
  root.append(contentEl, loadingEl);
  if (pageCfg) root.appendChild(pagerEl);

  // --- State ---------------------------------------------------------------------------

  const selected = new Map(); // key -> row
  const columnFilters = {};   // field -> { op, value }
  let searchTerm = '';
  let destroyed = false;
  let lastAnchorKey = null;
  let activeRowIndex = 0;
  let sortTimer = null;
  let pager = null;
  let pageSizeDd = null;
  let infoEl = null;
  let syncingPager = false;
  let pendingAnimate = false;
  let editState = null;       // { key, isNew, row, draft, errors, saving, focus }
  let popupDialog = null;
  // Component editors own floating layers in <body>: destroy them with the row / popup
  const inlineEditors = [];
  const popupEditors = [];
  const headerCache = new Map(); // colId -> { th, menuBtn, proxy, menu }
  const cleanups = [];

  function on(target, type, fn, o) {
    target.addEventListener(type, fn, o);
    cleanups.push(() => target.removeEventListener(type, fn, o));
  }

  function rowKey(row) {
    const k = getField(row, keyField);
    return k === undefined ? row : k;
  }

  // --- Toolbar -------------------------------------------------------------------------

  let searchInput = null;
  const applySearch = debounce((term) => {
    searchTerm = term.trim();
    applyFilters();
  }, 300);

  function renderToolbar() {
    if (!options.toolbar) return;
    toolbarEl.textContent = '';
    const items = Array.isArray(options.toolbar) ? options.toolbar : [options.toolbar];
    items.forEach((item) => {
      if (item instanceof Node) {
        toolbarEl.appendChild(item);
      } else if (item === 'search') {
        const wrap = el('div', 'lk-datagrid__search');
        wrap.appendChild(lkIcon('search', { size: 'sm' }));
        searchInput = el('input', 'lk-input lk-input--dense lk-datagrid__search-input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search…';
        searchInput.setAttribute('aria-label', 'Search');
        on(searchInput, 'input', () => applySearch(searchInput.value));
        wrap.appendChild(searchInput);
        toolbarEl.appendChild(wrap);
      } else if (item === 'create' || (isObject(item) && item.name === 'create' && !item.click)) {
        const btn = el('button', 'lk-btn lk-btn--sm lk-btn--primary');
        btn.type = 'button';
        btn.dataset.name = 'create';
        btn.appendChild(lkIcon('plus', { size: 'sm' }));
        btn.appendChild(document.createTextNode(isObject(item) && item.text ? item.text : 'Add new'));
        on(btn, 'click', () => api.addRow());
        toolbarEl.appendChild(btn);
      } else if (isObject(item)) {
        const btn = el('button', `lk-btn lk-btn--sm lk-btn--${item.color || 'secondary'}`);
        btn.type = 'button';
        if (item.icon) btn.appendChild(lkIcon(item.icon, { size: 'sm' }));
        if (item.text) btn.appendChild(document.createTextNode(item.text));
        if (item.name) btn.dataset.name = item.name;
        on(btn, 'click', (e) => item.click?.(api, e));
        toolbarEl.appendChild(btn);
      }
    });
  }

  // --- Filtering ---------------------------------------------------------------------------

  function hasFilter(field) {
    const f = columnFilters[field];
    return !!f && f.value !== '' && f.value != null;
  }

  // Serializable rule for the server (lkDataSource rule syntax)
  function serverRule(c, f) {
    const type = colType(c);
    if (type === 'boolean') return { eq: f.value === true || f.value === 'true' };
    if (type === 'number') return { [f.op || 'eq']: Number(f.value) };
    if (type === 'date') {
      const day = String(f.value);
      const next = new Date(`${day}T00:00:00`);
      next.setDate(next.getDate() + 1);
      const nextDay = dayKey(next);
      if (f.op === 'before') return { lt: day };
      if (f.op === 'after') return { gte: nextDay };
      return { gte: day, lt: nextDay };
    }
    return { [f.op || 'contains']: String(f.value) };
  }

  // Local predicate — compares the way values are displayed (dates by local day)
  function localTest(c, f) {
    const type = colType(c);
    const op = f.op || OPERATORS[type]?.[0]?.[0];
    if (type === 'boolean') {
      const want = f.value === true || f.value === 'true';
      return (v) => !!v === want;
    }
    if (type === 'number') {
      const n = Number(f.value);
      return (v) => {
        const x = Number(v);
        if (op === 'ne') return x !== n;
        if (op === 'gt') return x > n;
        if (op === 'gte') return x >= n;
        if (op === 'lt') return x < n;
        if (op === 'lte') return x <= n;
        return x === n;
      };
    }
    if (type === 'date') {
      const day = String(f.value);
      return (v) => {
        const k = dayKey(v);
        if (!k) return false;
        if (op === 'before') return k < day;
        if (op === 'after') return k > day;
        return k === day;
      };
    }
    const needle = String(f.value).toLowerCase();
    return (v) => {
      const hay = String(v ?? '').toLowerCase();
      if (op === 'eq') return hay === needle;
      if (op === 'ne') return hay !== needle;
      if (op === 'startsWith') return hay.startsWith(needle);
      if (op === 'endsWith') return hay.endsWith(needle);
      return hay.includes(needle);
    };
  }

  function buildFilter() {
    const active = columns.filter((c) => c._kind === 'data' && c.field && hasFilter(c.field));

    if (isRemote('filter')) {
      const rules = {};
      active.forEach((c) => { rules[c.field] = serverRule(c, columnFilters[c.field]); });
      if (searchTerm) rules.$search = searchTerm;
      return Object.keys(rules).length ? rules : null;
    }

    if (!active.length && !searchTerm) return null;
    const tests = active.map((c) => [c.field, localTest(c, columnFilters[c.field])]);
    const term = searchTerm.toLowerCase();
    const searchFields = columns.filter((c) => c._kind === 'data' && c.field && !c.hidden);
    return (row) => tests.every(([field, test]) => test(getField(row, field)))
      && (!term || searchFields.some((c) => {
        const v = getField(row, c.field);
        const shown = typeof c.format === 'function' ? c.format(v, row) : defaultFormat(v, c.type);
        return String(shown ?? '').toLowerCase().includes(term) || String(v ?? '').toLowerCase().includes(term);
      }));
  }

  function applyFilters() {
    if (destroyed) return;
    const filter = buildFilter();
    ds.setFilter(filter);
    syncRemote('filter');
    updateHeaderState();
    if (typeof options.onFilter === 'function') {
      options.onFilter({ filters: { ...columnFilters }, search: searchTerm, filter, grid: api, component: api });
    }
  }

  // Filter row (filterable: { mode: 'row' })
  const applyFiltersDebounced = debounce(() => applyFilters(), 300);

  function renderFilterRow() {
    if (filterMode !== 'row') return;
    filterRow.textContent = '';
    visibleColumns().forEach((c) => {
      const th = el('th', 'lk-datagrid__filter-cell');
      if (isFilterable(c)) {
        const type = colType(c);
        let input;
        if (type === 'boolean') {
          input = el('select', 'lk-input lk-input--dense lk-datagrid__filter-input');
          [['', 'All'], ['true', 'Yes'], ['false', 'No']].forEach(([v, t]) => {
            const o = el('option', null, t);
            o.value = v;
            input.appendChild(o);
          });
          input.value = hasFilter(c.field) ? String(columnFilters[c.field].value) : '';
          on(input, 'change', () => {
            columnFilters[c.field] = { op: 'eq', value: input.value };
            applyFilters();
          });
        } else {
          input = el('input', 'lk-input lk-input--dense lk-datagrid__filter-input');
          input.type = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'search');
          input.placeholder = c.filter?.placeholder ?? (type === 'number' ? '=' : 'Filter…');
          input.value = columnFilters[c.field]?.value ?? '';
          on(input, 'input', () => {
            columnFilters[c.field] = { op: c.filter?.operator || OPERATORS[type][0][0], value: input.value };
            applyFiltersDebounced();
          });
        }
        input.setAttribute('aria-label', `Filter ${c.title || c.field}`);
        th.appendChild(input);
      }
      filterRow.appendChild(th);
    });
  }

  // --- Sorting -------------------------------------------------------------------------------------------

  function currentSort() {
    return normalizeSort(ds.sort);
  }

  function setSort(next) {
    pendingAnimate = true;
    ds.setSort(next.length ? (sortCfg.mode === 'multiple' ? next : next[0]) : null);
    syncRemote('sort');
    updateHeaderState();
    if (typeof options.onSort === 'function') options.onSort({ sort: next, grid: api, component: api });
  }

  function toggleSort(field) {
    const sort = currentSort();
    const idx = sort.findIndex((s) => s.field === field);
    let next;
    if (idx < 0) {
      next = sortCfg.mode === 'multiple' ? [...sort, { field, dir: 'asc' }] : [{ field, dir: 'asc' }];
    } else if (sort[idx].dir === 'asc') {
      next = sort.slice();
      next[idx] = { field, dir: 'desc' };
      if (sortCfg.mode !== 'multiple') next = [next[idx]];
    } else if (sortCfg.allowUnsort) {
      next = sortCfg.mode === 'multiple' ? sort.filter((s) => s.field !== field) : [];
    } else {
      next = sortCfg.mode === 'multiple' ? sort.map((s) => (s.field === field ? { field, dir: 'asc' } : s)) : [{ field, dir: 'asc' }];
    }
    setSort(next);
  }

  // Explicit direction from the column menu (null clears this column's sort)
  function sortColumn(field, dir) {
    const others = sortCfg.mode === 'multiple' ? currentSort().filter((s) => s.field !== field) : [];
    if (!dir) {
      setSort(sortCfg.mode === 'multiple' ? others : []);
      return;
    }
    const existing = currentSort().findIndex((s) => s.field === field);
    if (sortCfg.mode === 'multiple' && existing > -1) {
      const next = currentSort();
      next[existing] = { field, dir };
      setSort(next);
    } else {
      setSort([...others, { field, dir }]);
    }
  }

  // --- Column menu ----------------------------------------------------------------------------

  function menuItem(icon, text, onClick) {
    const btn = el('button', 'lk-datagrid-menu__item');
    btn.type = 'button';
    if (icon) btn.appendChild(lkIcon(icon, { size: 'sm' }));
    btn.appendChild(el('span', null, text));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buildMenu(c, close) {
    const wrap = el('div', 'lk-datagrid-menu');
    wrap.setAttribute('role', 'menu');
    wrap.setAttribute('aria-label', `${c.title || c.field} column options`);
    const refreshers = [];

    // Sort
    if (isSortable(c)) {
      const section = el('div', 'lk-datagrid-menu__section');
      const asc = menuItem('sort-asc', 'Sort ascending', () => { sortColumn(c.field, 'asc'); close(); });
      const desc = menuItem('sort-desc', 'Sort descending', () => { sortColumn(c.field, 'desc'); close(); });
      const clear = menuItem('close', 'Clear sort', () => { sortColumn(c.field, null); close(); });
      section.append(asc, desc, clear);
      wrap.appendChild(section);
      refreshers.push(() => {
        const s = currentSort().find((x) => x.field === c.field);
        asc.classList.toggle('lk-datagrid-menu__item--active', s?.dir === 'asc');
        desc.classList.toggle('lk-datagrid-menu__item--active', s?.dir === 'desc');
        clear.hidden = !s;
      });
    }

    // Filter
    if (filterMode === 'menu' && isFilterable(c)) {
      const type = colType(c);
      const section = el('form', 'lk-datagrid-menu__section lk-datagrid-menu__filter');
      section.setAttribute('novalidate', '');
      section.appendChild(el('div', 'lk-datagrid-menu__title', 'Filter'));

      let opSelect = null;
      let valueInput;
      if (type === 'boolean') {
        valueInput = el('select', 'lk-input lk-input--dense');
        [['', 'All'], ['true', 'Yes'], ['false', 'No']].forEach(([v, t]) => {
          const o = el('option', null, t);
          o.value = v;
          valueInput.appendChild(o);
        });
      } else {
        opSelect = el('select', 'lk-input lk-input--dense');
        opSelect.setAttribute('aria-label', 'Operator');
        OPERATORS[type].forEach(([v, t]) => {
          const o = el('option', null, t);
          o.value = v;
          opSelect.appendChild(o);
        });
        section.appendChild(opSelect);
        valueInput = el('input', 'lk-input lk-input--dense');
        valueInput.type = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text');
        valueInput.placeholder = type === 'string' ? 'Value…' : '';
      }
      valueInput.setAttribute('aria-label', `Filter value for ${c.title || c.field}`);
      section.appendChild(valueInput);

      const actions = el('div', 'lk-datagrid-menu__actions');
      const clearBtn = el('button', 'lk-btn lk-btn--sm lk-btn--secondary', 'Clear');
      clearBtn.type = 'button';
      const applyBtn = el('button', 'lk-btn lk-btn--sm lk-btn--primary', 'Filter');
      applyBtn.type = 'submit';
      actions.append(clearBtn, applyBtn);
      section.appendChild(actions);

      section.addEventListener('submit', (e) => {
        e.preventDefault();
        columnFilters[c.field] = { op: opSelect ? opSelect.value : 'eq', value: valueInput.value };
        applyFilters();
        close();
      });
      clearBtn.addEventListener('click', () => {
        delete columnFilters[c.field];
        applyFilters();
        close();
      });

      wrap.appendChild(section);
      refreshers.push(() => {
        const f = columnFilters[c.field];
        if (opSelect) opSelect.value = f?.op || OPERATORS[type][0][0];
        valueInput.value = f ? String(f.value ?? '') : '';
        clearBtn.disabled = !hasFilter(c.field);
      });
    }

    // Column visibility
    const toggleable = toggleableColumns();
    if (toggleable.length > 1) {
      const section = el('div', 'lk-datagrid-menu__section lk-datagrid-menu__columns');
      section.appendChild(el('div', 'lk-datagrid-menu__title', 'Columns'));
      const boxes = toggleable.map((col) => {
        const label = el('label', 'lk-datagrid-menu__check');
        const cb = el('input', 'lk-checkbox');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => {
          const visibleCount = toggleableColumns().filter((x) => !x.hidden).length;
          if (!cb.checked && visibleCount <= 1) { cb.checked = true; return; } // keep at least one
          setColumnHidden(col._id, !cb.checked);
        });
        label.append(cb, el('span', null, col.title || titleCase(col.field || 'Actions')));
        section.appendChild(label);
        return [col, cb];
      });
      wrap.appendChild(section);
      refreshers.push(() => {
        const visibleCount = toggleableColumns().filter((x) => !x.hidden).length;
        boxes.forEach(([col, cb]) => {
          cb.checked = !col.hidden;
          cb.disabled = !col.hidden && visibleCount <= 1;
        });
      });
    }

    return { el: wrap, refresh: () => refreshers.forEach((fn) => fn()) };
  }

  // --- Header ----------------------------------------------------------------------------

  function renderColgroup() {
    colgroup.textContent = '';
    visibleColumns().forEach((c) => {
      const col = el('col');
      if (c._kind === 'select') col.style.width = '2.75rem';
      if (c.width != null) col.style.width = typeof c.width === 'number' ? `${c.width}px` : c.width;
      if (c.minWidth != null) col.style.minWidth = typeof c.minWidth === 'number' ? `${c.minWidth}px` : c.minWidth;
      colgroup.appendChild(col);
    });
  }

  let headerCheckbox = null;

  // Header cells are built once per column and reused, so an open column menu
  // survives sorting, filtering and toggling other columns.
  function headerCell(c) {
    const cached = headerCache.get(c._id);
    if (cached) return cached;

    const th = el('th', 'lk-datagrid__th');
    th.setAttribute('scope', 'col');
    th.dataset.col = c._id;
    if (c.align) th.classList.add(`lk-datagrid__cell--${c.align}`);
    if (c.headerClassName) th.classList.add(...String(c.headerClassName).split(/\s+/).filter(Boolean));
    const entry = { th, menuBtn: null, proxy: null, menu: null, checkbox: null, badge: null };

    if (c._kind === 'select') {
      th.classList.add('lk-datagrid__select-cell');
      const cb = el('input', 'lk-checkbox lk-datagrid__checkbox');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', 'Select all rows on this page');
      th.appendChild(cb);
      entry.checkbox = cb;
    } else {
      const inner = el('div', 'lk-datagrid__th-inner');
      const label = el('span', 'lk-datagrid__th-label');
      if (c.headerTemplate != null) {
        fill(label, typeof c.headerTemplate === 'function' ? c.headerTemplate(c) : c.headerTemplate, true);
      } else {
        label.textContent = c.title ?? '';
      }
      inner.appendChild(label);

      if (isSortable(c)) {
        th.classList.add('lk-table__th--sortable');
        th.tabIndex = 0;
        inner.appendChild(el('span', 'lk-datagrid__sort-ind'));
        entry.badge = el('span', 'lk-datagrid__sort-index');
        entry.badge.hidden = true;
        inner.appendChild(entry.badge);
      }

      if (hasMenu(c)) {
        const btn = el('button', 'lk-datagrid__menu-btn');
        btn.type = 'button';
        btn.setAttribute('aria-label', `${c.title || c.field} column menu`);
        btn.appendChild(lkIcon('more-vertical', { size: 'sm' }));
        inner.appendChild(btn);
        entry.menuBtn = btn;

        let proxy = null;
        const close = () => proxy?.hide('select');
        const menu = buildMenu(c, close);
        // Refresh menu state before lkPopupProxy's own click handler opens it
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // header click = sort; the menu button must not sort
          menu.refresh();
        });
        proxy = lkPopupProxy(btn, {
          content: '',
          placement: 'bottom-right',
          className: 'lk-datagrid-menu-panel',
          onShow() { btn.classList.add('lk-datagrid__menu-btn--open'); },
          onHide() { btn.classList.remove('lk-datagrid__menu-btn--open'); },
        });
        proxy.panelEl.appendChild(menu.el); // live DOM (setContent would clone and drop listeners)
        entry.proxy = proxy;
        entry.menu = menu;
      }
      th.appendChild(inner);
    }

    headerCache.set(c._id, entry);
    return entry;
  }

  function renderHeader() {
    headRow.textContent = '';
    headerCheckbox = null;
    visibleColumns().forEach((c) => {
      const entry = headerCell(c);
      if (entry.checkbox) headerCheckbox = entry.checkbox;
      headRow.appendChild(entry.th);
    });
    // Menus of columns that just got hidden lose their anchor — close them
    headerCache.forEach((entry, id) => {
      const col = columns.find((c) => c._id === id);
      if ((!col || col.hidden) && entry.proxy) entry.proxy.hide('hidden');
    });
    updateHeaderState();
  }

  // Sort/filter indicators, badges and open-menu contents, without rebuilding cells
  function updateHeaderState() {
    const sort = currentSort();
    visibleColumns().forEach((c) => {
      const entry = headerCache.get(c._id);
      if (!entry || c._kind !== 'data') return;
      const idx = sort.findIndex((s) => s.field === c.field);
      if (isSortable(c)) {
        entry.th.setAttribute('aria-sort', idx < 0 ? 'none' : (sort[idx].dir === 'desc' ? 'descending' : 'ascending'));
        if (entry.badge) {
          const showBadge = idx > -1 && sortCfg.mode === 'multiple' && sort.length > 1;
          entry.badge.hidden = !showBadge;
          entry.badge.textContent = showBadge ? String(idx + 1) : '';
        }
      }
      if (entry.menuBtn) {
        const sorted = idx > -1;
        const filtered = hasFilter(c.field);
        entry.menuBtn.classList.toggle('lk-datagrid__menu-btn--active', sorted || filtered);
        entry.menuBtn.classList.toggle('lk-datagrid__menu-btn--filtered', filtered);
        entry.th.classList.toggle('lk-datagrid__th--filtered', filtered);
        const state = [sorted ? `sorted ${sort[idx].dir === 'desc' ? 'descending' : 'ascending'}` : '', filtered ? 'filtered' : ''].filter(Boolean).join(', ');
        entry.menuBtn.setAttribute('aria-label', `${c.title || c.field} column menu${state ? ` (${state})` : ''}`);
        if (entry.proxy?.isOpen) entry.menu.refresh();
      }
    });
    updateHeaderCheckbox();
  }

  function destroyHeaderCache() {
    headerCache.forEach((entry) => entry.proxy?.destroy());
    headerCache.clear();
  }

  // --- Editors ----------------------------------------------------------------------------------

  function isFieldEditable(c, isNew) {
    if (c._kind !== 'data' || !c.field || c.editable === false) return false;
    if (typeof c.editable === 'function') return !!c.editable(editState?.row ?? null, isNew);
    // The key of an existing record is read-only unless a column opts in explicitly
    if (c.field === keyField && !isNew && c.editable !== true) return false;
    return true;
  }

  function toInputDate(value) {
    return dayKey(value);
  }

  // Keep the original value style: full ISO strings stay full ISO, Date stays Date
  function fromInputDate(str, original) {
    if (!str) return null;
    const d = new Date(`${str}T00:00:00`);
    if (original instanceof Date) return d;
    if (typeof original === 'string' && original.includes('T')) return d.toISOString();
    return str;
  }

  function flushEditors(bucket) {
    while (bucket.length) {
      try { bucket.pop()(); } catch (err) { console.error(err); } // eslint-disable-line no-console
    }
  }

  function dateEditor(host, value, extra, dense, setValue) {
    const { onChange: userChange, placeholder, ...rest } = extra;
    const input = el('input', `lk-input${dense ? ' lk-input--dense' : ''} lk-datagrid__editor lk-datagrid__editor--date`);
    input.type = 'text';
    input.readOnly = true;
    input.placeholder = placeholder || 'YYYY-MM-DD';
    input.value = toInputDate(value);
    host.appendChild(input);
    const picker = lkDate(input, {
      ...rest,
      value: input.value || null,
      onChange(v, meta) {
        if (typeof userChange === 'function') userChange(v, meta);
        if (v instanceof Date) {
          input.value = dayKey(v);
          setValue(fromInputDate(input.value, value));
        }
      },
    });
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        input.value = '';
        setValue(null);
      }
    };
    input.addEventListener('keydown', onKey);
    return { focus: () => input.focus(), destroy: () => { input.removeEventListener('keydown', onKey); picker.destroy(); } };
  }

  function componentEditor(spec, host, ctx) {
    const s = typeof spec === 'string' ? { type: spec } : spec;
    const preset = s.component ? null : EDITOR_TYPES[s.type];
    if (!s.component && !preset && s.type !== 'date') throw new Error(`Look.lkTable: unknown editor "${s.type}".`);
    const { value, row, column, dense, setValue } = ctx;
    const extra = (typeof s.options === 'function' ? s.options({ value, row, column }) : s.options) || {};
    if (s.type === 'date') return dateEditor(host, value, extra, dense, setValue);

    const node = document.createElement(s.tag || preset?.tag || 'input');
    const inputType = s.inputType || preset?.inputType;
    if (inputType) node.type = inputType;
    if (preset?.className) node.className = preset.className;
    if (dense && node.tagName !== 'DIV') node.classList.add('lk-input--dense');
    if (preset?.checkable) node.checked = !!value;
    else if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) node.value = value == null ? '' : String(value);
    host.appendChild(node);

    let comp = null;
    const read = () => (preset?.parse ? preset.parse(comp.value) : comp.value);
    const push = () => { if (comp) setValue(read()); };
    const userChange = extra.onChange;
    comp = (s.component || preset.factory)(node, {
      value,
      dense,
      ...(preset?.checkable ? { checked: !!value } : {}),
      ...extra,
      onChange(...args) {
        if (typeof userChange === 'function') userChange(...args);
        push();
      },
    });
    // Native inputs inside (textbox, checkbox, switch, phone digits) report through events
    host.addEventListener('input', push);
    host.addEventListener('change', push);
    return {
      focus: () => (typeof comp.focus === 'function' ? comp.focus() : host.querySelector(FOCUSABLE)?.focus()),
      destroy: () => {
        host.removeEventListener('input', push);
        host.removeEventListener('change', push);
        comp.destroy?.();
      },
    };
  }

  function createEditor(c, row, value, { dense, onChange, onEnter, onEscape, bucket }) {
    let id = uid('lk-dg-edit');
    const type = colType(c);
    const cls = `lk-input${dense ? ' lk-input--dense' : ''} lk-datagrid__editor`;
    let input;
    let getValue;

    if (c.editor) {
      const host = el('div', 'lk-datagrid__editor-host');
      const ctx = { value, row, column: c, dense, setValue: (v) => onChange(v) };
      const ret = typeof c.editor === 'function' ? c.editor(host, ctx) : componentEditor(c.editor, host, ctx);
      if (ret instanceof Node) {
        if (!host.contains(ret)) host.appendChild(ret);
      } else if (typeof ret === 'function') {
        bucket?.push(ret);
      } else if (ret && typeof ret.destroy === 'function') {
        bucket?.push(() => ret.destroy());
      }

      // Enter saves from text inputs, Escape cancels — unless a picker inside is open (its keys)
      host.addEventListener('keydown', (e) => {
        if (host.querySelector('[aria-expanded="true"]')) return;
        const t = e.target;
        const texty = t.tagName === 'INPUT' && !['checkbox', 'radio', 'hidden'].includes(t.type);
        if (e.key === 'Enter' && texty) { e.preventDefault(); onEnter?.(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape?.(); }
      }, true);

      const focusEl = host.querySelector(FOCUSABLE);
      if (focusEl) {
        if (!focusEl.id) focusEl.id = id;
        id = focusEl.id;
      }
      const focus = () => (ret && !(ret instanceof Node) && typeof ret.focus === 'function'
        ? ret.focus()
        : host.querySelector(FOCUSABLE)?.focus());
      return { el: host, id, focus };
    }

    if (c.values) {
      input = el('select', cls);
      const opts = normalizeValues(c.values);
      if (!c.validation?.required) {
        const blank = el('option', null, '');
        blank.value = '';
        input.appendChild(blank);
      }
      opts.forEach((o, i) => {
        const opt = el('option', null, o.label);
        opt.value = String(i);
        input.appendChild(opt);
      });
      const idx = opts.findIndex((o) => String(o.value) === String(value ?? ''));
      input.value = idx > -1 ? String(idx) : '';
      getValue = () => (input.value === '' ? null : opts[Number(input.value)].value);
    } else if (type === 'boolean') {
      input = el('input', 'lk-checkbox lk-datagrid__editor lk-datagrid__editor--check');
      input.type = 'checkbox';
      input.checked = !!value;
      getValue = () => input.checked;
    } else {
      input = el('input', cls);
      input.type = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text');
      if (type === 'number') {
        input.value = value == null ? '' : String(value);
        if (c.validation?.min != null) input.min = String(c.validation.min);
        if (c.validation?.max != null) input.max = String(c.validation.max);
        if (c.step != null) input.step = String(c.step);
        getValue = () => (input.value === '' ? null : Number(input.value));
      } else if (type === 'date') {
        input.value = toInputDate(value);
        getValue = () => fromInputDate(input.value, value);
      } else {
        input.value = value == null ? '' : String(value);
        if (c.validation?.maxLength != null) input.maxLength = c.validation.maxLength;
        getValue = () => input.value;
      }
    }

    input.id = id;
    input.name = c.field;
    const emit = () => onChange(getValue());
    input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', emit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') { e.preventDefault(); emit(); onEnter?.(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape?.(); }
    });
    return { el: input, id, focus: () => input.focus() };
  }

  function validateValue(c, value, row) {
    const v = c.validation || {};
    const label = c.title || c.field;
    const empty = value == null || value === '' || (typeof value === 'number' && Number.isNaN(value));
    if (v.required && empty && colType(c) !== 'boolean') return v.message || `${label} is required`;
    if (!empty) {
      if (v.min != null && Number(value) < v.min) return v.message || `${label} must be at least ${v.min}`;
      if (v.max != null && Number(value) > v.max) return v.message || `${label} must be at most ${v.max}`;
      if (v.minLength != null && String(value).length < v.minLength) return v.message || `${label} must be at least ${v.minLength} characters`;
      if (v.maxLength != null && String(value).length > v.maxLength) return v.message || `${label} must be at most ${v.maxLength} characters`;
      if (v.pattern) {
        const re = v.pattern instanceof RegExp ? v.pattern : new RegExp(v.pattern);
        if (!re.test(String(value))) return v.message || `${label} is not valid`;
      }
    }
    if (typeof c.validate === 'function') {
      const r = c.validate(value, row);
      if (r !== true && r !== undefined && r !== null) return typeof r === 'string' ? r : `${label} is not valid`;
    }
    return null;
  }

  function validateDraft() {
    const errors = {};
    columns.forEach((c) => {
      if (!isFieldEditable(c, editState.isNew)) return;
      const msg = validateValue(c, getField(editState.draft, c.field), editState.draft);
      if (msg) errors[c.field] = msg;
    });
    return errors;
  }

  // --- Editing ------------------------------------------------------------------------------------

  function generateKey() {
    const keys = ds.items.map((r) => getField(r, keyField)).filter((k) => typeof k === 'number' && Number.isFinite(k));
    return keys.length ? Math.max(...keys) + 1 : uid('new');
  }

  function startEdit(row, isNew = false) {
    if (!editCfg) return;
    if (editState) cancelEdit(true);

    const draft = isNew ? {} : JSON.parse(JSON.stringify(row ?? {}));
    if (isNew) {
      columns.forEach((c) => {
        if (c._kind !== 'data' || !c.field) return;
        let v = typeof c.defaultValue === 'function' ? c.defaultValue() : c.defaultValue;
        if (v === undefined) v = colType(c) === 'boolean' ? false : null;
        setField(draft, c.field, v);
      });
      Object.assign(draft, isObject(row) ? JSON.parse(JSON.stringify(row)) : {});
    }

    editState = {
      key: isNew ? Symbol('new') : rowKey(row),
      isNew,
      row: isNew ? null : row,
      draft,
      errors: {},
      saving: false,
      focus: true,
    };
    if (typeof options.onEdit === 'function') options.onEdit({ row: editState.row, values: draft, isNew, grid: api, component: api });

    if (editCfg.mode === 'popup') openPopup();
    else renderBody(false);
  }

  function cancelEdit(silent = false) {
    if (!editState) return;
    const prev = editState;
    editState = null;
    if (popupDialog) {
      const dlg = popupDialog;
      popupDialog = null;
      dlg.close('cancel');
    }
    renderBody(false);
    if (!silent && typeof options.onCancel === 'function') options.onCancel({ row: prev.row, isNew: prev.isNew, grid: api, component: api });
  }

  async function saveEdit() {
    if (!editState || editState.saving) return false;
    const state = editState;
    state.errors = validateDraft();
    if (Object.keys(state.errors).length) {
      if (editCfg.mode === 'popup') showPopupErrors();
      else renderBody(false);
      return false;
    }

    const values = state.draft;
    const changes = {};
    if (!state.isNew) {
      Object.keys(values).forEach((k) => {
        if (JSON.stringify(values[k]) !== JSON.stringify(state.row?.[k])) changes[k] = values[k];
      });
    }
    if (typeof options.onSave === 'function'
      && options.onSave({ row: state.row, values, changes: state.isNew ? values : changes, isNew: state.isNew, grid: api, component: api }) === false) {
      return false;
    }

    // lkDataSource updates optimistically: leave edit mode first so the record
    // isn't drawn twice (draft + saved), and restore it if the server rejects.
    state.saving = true;
    editState = null;
    try {
      if (state.isNew) {
        const record = { ...values };
        if (getField(record, keyField) == null && !ds.canRead) setField(record, keyField, generateKey());
        await ds.add(record);
      } else if (Object.keys(changes).length) {
        const key = state.key;
        await ds.update((r) => rowKey(r) === key, changes);
      }
      renderBody(false);
      return true;
    } catch (err) {
      state.saving = false;
      state.errors = serverErrors(err, state);
      editState = state;
      if (editCfg.mode === 'popup') showPopupErrors();
      else renderBody(false);
      if (typeof options.onError === 'function') options.onError({ error: err, action: state.isNew ? 'create' : 'update', grid: api, component: api });
      return false;
    }
  }

  // A rejected save may carry field errors ({ errors: { field: [msg] } }, e.g. an HTTP 422 body):
  // show them under the matching editors; anything unmatched goes to the form-level message.
  function serverErrors(err, state) {
    const errors = {};
    const leftover = [];
    Object.entries(extractFieldErrors(err) || {}).forEach(([field, value]) => {
      const msg = firstMessage(value);
      if (!msg) return;
      const col = columns.find((c) => c.field === field && isFieldEditable(c, state.isNew));
      // Inline mode only draws visible columns
      if (col && (editCfg.mode === 'popup' || !col.hidden)) errors[field] = msg;
      else leftover.push(msg);
    });
    if (leftover.length) errors._form = leftover.join(' ');
    else if (!Object.keys(errors).length) errors._form = err?.message || String(err);
    return errors;
  }

  // Popup editor ---------------------------------------------------------------------------------

  let popupFields = null; // field -> { wrap, errorEl }
  let popupFormError = null;

  function openPopup() {
    const state = editState;
    const form = el('form', 'lk-datagrid-form');
    form.setAttribute('novalidate', '');
    popupFields = new Map();
    popupFormError = el('div', 'lk-datagrid-form__error');
    popupFormError.hidden = true;
    form.appendChild(popupFormError);

    let first = null;
    columns.forEach((c) => {
      if (!isFieldEditable(c, state.isNew)) return;
      const wrap = el('div', 'lk-field lk-datagrid-form__field');
      const editor = createEditor(c, state.draft, getField(state.draft, c.field), {
        dense: false,
        onChange: (v) => { setField(state.draft, c.field, v); clearFieldError(c.field); },
        onEnter: () => submit(),
        bucket: popupEditors,
      });
      const label = el('label', 'lk-label', c.title || titleCase(c.field));
      label.htmlFor = editor.id;
      if (c.validation?.required) label.classList.add('lk-label--required');
      const errorEl = el('span', 'lk-field-error');
      errorEl.hidden = true;
      if (colType(c) === 'boolean' && !c.editor && !c.values) {
        wrap.classList.add('lk-datagrid-form__field--check');
        wrap.append(editor.el, label, errorEl);
      } else {
        wrap.append(label, editor.el, errorEl);
      }
      form.appendChild(wrap);
      popupFields.set(c.field, { wrap, errorEl });
      if (!first) first = editor;
    });

    const submit = () => {
      saveEdit().then((ok) => {
        if (ok && popupDialog) {
          const dlg = popupDialog;
          popupDialog = null;
          dlg.close('saved');
        }
      });
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

    const title = typeof editCfg.title === 'function'
      ? editCfg.title({ row: state.row, isNew: state.isNew })
      : (editCfg.title || (state.isNew ? 'Add record' : 'Edit record'));

    popupDialog = lkDialog({
      title,
      content: form,
      confirmText: 'Save',
      cancelText: 'Cancel',
      destroyOnClose: true,
      className: 'lk-datagrid-popup',
      onConfirm() { submit(); return false; }, // stays open until the save succeeds
      onDestroy() { flushEditors(popupEditors); },
      onClose(reason) {
        if (reason === 'saved') return;
        if (popupDialog) {
          popupDialog = null;
          const prev = editState;
          editState = null;
          if (prev && typeof options.onCancel === 'function') options.onCancel({ row: prev.row, isNew: prev.isNew, grid: api, component: api });
        }
      },
    });
    // lkDialog focuses its confirm button after opening; put focus in the first field instead
    setTimeout(() => first?.focus(), 60);
  }

  function clearFieldError(field) {
    const f = popupFields?.get(field);
    if (!f) return;
    f.wrap.classList.remove('lk-field--error');
    f.errorEl.hidden = true;
  }

  function showPopupErrors() {
    if (!popupFields || !editState) return;
    const errors = editState.errors || {};
    let firstBad = null;
    popupFields.forEach((f, field) => {
      const msg = errors[field];
      f.wrap.classList.toggle('lk-field--error', !!msg);
      f.errorEl.hidden = !msg;
      f.errorEl.textContent = msg || '';
      if (msg && !firstBad) firstBad = f.wrap.querySelector(FOCUSABLE);
    });
    popupFormError.hidden = !errors._form;
    popupFormError.textContent = errors._form || '';
    firstBad?.focus();
  }

  // --- Body ------------------------------------------------------------------------------------

  function renderEmpty(cols) {
    const tr = el('tr', 'lk-datagrid__empty-row');
    const td = el('td', 'lk-datagrid__empty');
    td.colSpan = Math.max(1, cols.length);
    if (ds.error) {
      td.classList.add('lk-datagrid__empty--error');
      td.textContent = ds.error.message || String(ds.error);
    } else if (ds.loading) {
      td.textContent = ' ';
    } else {
      fill(td, typeof options.noRecords === 'function' ? options.noRecords(api) : options.noRecords, typeof options.noRecords === 'function');
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function commandDef(cmd) {
    if (cmd === 'destroy') return { name: 'destroy', text: 'Delete', icon: 'delete', color: 'negative' };
    if (cmd === 'edit') return { name: 'edit', text: 'Edit', icon: 'edit' };
    return isObject(cmd) ? cmd : null;
  }

  function cmdButton(def, attrs) {
    const negative = def.color === 'negative';
    const variant = negative ? 'ghost lk-datagrid__cmd--negative' : (def.color || 'ghost');
    const btn = el('button', `lk-btn lk-btn--sm lk-btn--${variant} lk-datagrid__cmd`);
    btn.type = 'button';
    Object.entries(attrs).forEach(([k, v]) => { btn.dataset[k] = v; });
    if (def.icon) btn.appendChild(lkIcon(def.icon, { size: 'sm' }));
    if (def.text && !def.iconOnly) btn.appendChild(document.createTextNode(def.text));
    if (def.text) btn.setAttribute('aria-label', def.text);
    return btn;
  }

  function renderEditRow(rowIndex, cols) {
    const state = editState;
    const tr = el('tr', 'lk-datagrid__row lk-datagrid__row--editing');
    tr.dataset.index = String(rowIndex);
    if (state.isNew) tr.classList.add('lk-datagrid__row--new');
    let firstEditor = null;

    cols.forEach((c) => {
      const td = el('td', 'lk-datagrid__cell');
      if (c.align) td.classList.add(`lk-datagrid__cell--${c.align}`);

      if (c._kind === 'select') {
        td.classList.add('lk-datagrid__select-cell');
      } else if (c._kind === 'command') {
        td.classList.add('lk-datagrid__command-cell');
        td.appendChild(cmdButton({ text: 'Save', icon: 'save', color: 'primary' }, { action: 'save' }));
        td.appendChild(cmdButton({ text: 'Cancel', icon: 'close' }, { action: 'cancel' }));
      } else if (isFieldEditable(c, state.isNew)) {
        const editor = createEditor(c, state.draft, getField(state.draft, c.field), {
          dense: true,
          onChange: (v) => {
            setField(state.draft, c.field, v);
            if (state.errors[c.field]) {
              delete state.errors[c.field];
              td.classList.remove('lk-datagrid__cell--invalid');
              td.querySelector('.lk-datagrid__cell-error')?.remove();
            }
          },
          onEnter: () => saveEdit(),
          onEscape: () => cancelEdit(),
          bucket: inlineEditors,
        });
        editor.el.setAttribute?.('aria-label', c.title || c.field);
        td.appendChild(editor.el);
        const msg = state.errors[c.field];
        if (msg) {
          td.classList.add('lk-datagrid__cell--invalid');
          editor.el.setAttribute?.('aria-invalid', 'true');
          td.appendChild(el('div', 'lk-datagrid__cell-error', msg));
        }
        if (!firstEditor || (msg && !firstEditor.bad)) firstEditor = Object.assign(editor, { bad: !!msg });
      } else {
        const value = getField(state.draft, c.field);
        if (typeof c.template === 'function' && !state.isNew) fill(td, c.template(state.draft, value), true);
        else if (typeof c.format === 'function') fill(td, c.format(value, state.draft), false);
        else td.textContent = defaultFormat(value, c.type);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);

    if (state.errors._form) {
      const errTr = el('tr', 'lk-datagrid__edit-error-row');
      const td = el('td', 'lk-datagrid__edit-error');
      td.colSpan = cols.length;
      td.textContent = state.errors._form;
      errTr.appendChild(td);
      tbody.appendChild(errTr);
    }

    if (state.focus || Object.keys(state.errors).length) {
      state.focus = false;
      firstEditor?.focus();
    }
  }

  function renderBody(animate) {
    flushEditors(inlineEditors);
    tbody.textContent = '';
    const rows = ds.view;
    const cols = visibleColumns();
    const inlineEdit = editState && editCfg?.mode === 'inline' ? editState : null;
    const newRow = inlineEdit?.isNew;

    if (newRow && editCfg.createAt === 'top') renderEditRow(-1, cols);

    if (!rows.length && !newRow) {
      renderEmpty(cols);
      updateHeaderCheckbox();
      return;
    }

    activeRowIndex = Math.min(activeRowIndex, Math.max(0, rows.length - 1));

    rows.forEach((row, i) => {
      const key = rowKey(row);
      if (inlineEdit && !inlineEdit.isNew && key === inlineEdit.key) {
        renderEditRow(i, cols);
        return;
      }
      const isSel = selected.has(key);
      const tr = el('tr', 'lk-datagrid__row');
      tr.dataset.index = String(i);
      if (isSel) {
        tr.classList.add('lk-datagrid__row--selected');
        tr.setAttribute('aria-selected', 'true');
      } else if (selectMode || hasSelectColumn()) {
        tr.setAttribute('aria-selected', 'false');
      }
      if (selectMode) tr.tabIndex = i === activeRowIndex ? 0 : -1;
      if (typeof options.rowClass === 'function') {
        const cls = options.rowClass(row);
        if (cls) tr.classList.add(...String(cls).split(/\s+/).filter(Boolean));
      }
      if (animate) {
        tr.classList.add('lk-table__row--sorted');
        tr.style.setProperty('--lk-sort-i', String(i));
      }

      cols.forEach((c) => {
        const td = el('td', 'lk-datagrid__cell');
        if (c.align) td.classList.add(`lk-datagrid__cell--${c.align}`);
        if (c.className) td.classList.add(...String(c.className).split(/\s+/).filter(Boolean));

        if (c._kind === 'select') {
          td.classList.add('lk-datagrid__select-cell');
          const cb = el('input', 'lk-checkbox lk-datagrid__checkbox');
          cb.type = 'checkbox';
          cb.checked = isSel;
          cb.tabIndex = -1;
          cb.setAttribute('aria-label', 'Select row');
          td.appendChild(cb);
        } else if (c._kind === 'command') {
          td.classList.add('lk-datagrid__command-cell');
          (Array.isArray(c.command) ? c.command : [c.command]).forEach((cmd, ci) => {
            const def = commandDef(cmd);
            if (!def) return;
            if (def.name === 'edit' && !editCfg && !def.click) return; // nothing to do without editing
            td.appendChild(cmdButton(def, { cmd: String(ci), col: c._id }));
          });
        } else {
          const value = getField(row, c.field);
          if (typeof c.template === 'function') fill(td, c.template(row, value), true);
          else if (typeof c.format === 'function') fill(td, c.format(value, row), false);
          else td.textContent = defaultFormat(value, c.type);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    if (newRow && editCfg.createAt === 'bottom') renderEditRow(-1, cols);
    updateHeaderCheckbox();

    if (animate) {
      clearTimeout(sortTimer);
      sortTimer = setTimeout(() => {
        qsa('.lk-table__row--sorted', tbody).forEach((tr) => {
          tr.classList.remove('lk-table__row--sorted');
          tr.style.removeProperty('--lk-sort-i');
        });
      }, SORT_ANIM_MS + 200);
    }
  }

  // --- Pager -------------------------------------------------------------------------------------

  function renderPager() {
    if (!pageCfg) return;
    if (!pager) {
      pagerEl.textContent = '';
      const nav = el('nav', 'lk-datagrid__pager-nav');
      nav.setAttribute('aria-label', 'Pagination');
      const ul = el('ul', 'lk-pagination lk-pagination--dense');
      nav.appendChild(ul);
      pagerEl.appendChild(nav);

      pager = lkPagination(ul, {
        totalPages: ds.totalPages,
        page: ds.page,
        maxVisible: pageCfg.maxVisible,
        onChange(p) {
          if (syncingPager) return;
          if (editState && editCfg.mode === 'inline') cancelEdit();
          ds.setPage(p);
          syncRemote('paging');
          if (typeof options.onPage === 'function') options.onPage({ page: p, grid: api, component: api });
        },
      });

      const right = el('div', 'lk-datagrid__pager-meta');
      if (Array.isArray(pageCfg.pageSizes) && pageCfg.pageSizes.length) {
        const sizeWrap = el('div', 'lk-datagrid__page-size');
        sizeWrap.appendChild(el('span', 'lk-datagrid__page-size-label', 'Rows per page'));
        const host = el('div', 'lk-input--dense');
        sizeWrap.appendChild(host);
        right.appendChild(sizeWrap);
        pageSizeDd = lkDropdown(host, {
          items: pageCfg.pageSizes.map((n) => ({ value: n, label: String(n) })),
          value: ds.pageSize,
          onChange(v) {
            if (v == null) return;
            ds.setPageSize(Number(v));
            syncRemote('paging');
          },
        });
      }
      if (pageCfg.info) {
        infoEl = el('span', 'lk-datagrid__info');
        infoEl.setAttribute('aria-live', 'polite');
        right.appendChild(infoEl);
      }
      pagerEl.appendChild(right);
    }

    syncingPager = true;
    if (pager.totalPages !== ds.totalPages) pager.totalPages = ds.totalPages;
    if (pager.page !== ds.page) pager.page = ds.page;
    syncingPager = false;
    if (pageSizeDd && String(pageSizeDd.value) !== String(ds.pageSize)) {
      // Page size changed elsewhere (e.g. ds.setPageSize) — reflect it without re-emitting
      const known = pageCfg.pageSizes.includes(ds.pageSize);
      if (!known) pageSizeDd.items = [...pageCfg.pageSizes, ds.pageSize].sort((a, b) => a - b).map((n) => ({ value: n, label: String(n) }));
      pageSizeDd.value = ds.pageSize;
    }

    if (infoEl) {
      const total = ds.total;
      const start = total ? (ds.page - 1) * ds.pageSize + 1 : 0;
      const end = Math.min(total, ds.page * ds.pageSize);
      infoEl.textContent = total ? `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}` : 'No items';
    }
  }

  // --- Selection -------------------------------------------------------------------------------------

  function emitSelection() {
    if (typeof options.onChange === 'function') {
      options.onChange({ selectedRows: api.selectedRows, selectedKeys: api.selectedKeys, grid: api, component: api });
    }
  }

  function setRowSelected(row, isOn) {
    const key = rowKey(row);
    if (isOn) selected.set(key, row);
    else selected.delete(key);
  }

  function refreshSelectionView() {
    qsa('.lk-datagrid__row', tbody).forEach((tr) => {
      const row = ds.view[Number(tr.dataset.index)];
      if (!row || tr.classList.contains('lk-datagrid__row--editing')) return;
      const isSel = selected.has(rowKey(row));
      tr.classList.toggle('lk-datagrid__row--selected', isSel);
      tr.setAttribute('aria-selected', String(isSel));
      const cb = tr.querySelector('.lk-datagrid__checkbox');
      if (cb) cb.checked = isSel;
    });
    updateHeaderCheckbox();
  }

  function updateHeaderCheckbox() {
    if (!headerCheckbox) return;
    const rows = ds.view;
    const count = rows.filter((r) => selected.has(rowKey(r))).length;
    headerCheckbox.checked = rows.length > 0 && count === rows.length;
    headerCheckbox.indeterminate = count > 0 && count < rows.length;
  }

  function handleRowSelect(index, e, viaCheckbox) {
    const row = ds.view[index];
    if (!row) return;
    const key = rowKey(row);
    const multi = selectMode === 'multiple' || viaCheckbox || (hasSelectColumn() && !selectMode);

    if (multi) {
      if (e?.shiftKey && lastAnchorKey != null) {
        const keys = ds.view.map(rowKey);
        const a = keys.indexOf(lastAnchorKey);
        const [from, to] = a < 0 ? [index, index] : [Math.min(a, index), Math.max(a, index)];
        for (let i = from; i <= to; i++) setRowSelected(ds.view[i], true);
      } else {
        setRowSelected(row, !selected.has(key));
        lastAnchorKey = key;
      }
    } else {
      const wasOnly = selected.size === 1 && selected.has(key);
      selected.clear();
      if (!wasOnly) selected.set(key, row);
      lastAnchorKey = key;
    }
    refreshSelectionView();
    emitSelection();
  }

  // --- Events ---------------------------------------------------------------------------------------------

  function onHeadClick(e) {
    if (headerCheckbox && e.target === headerCheckbox) {
      const isOn = headerCheckbox.checked;
      ds.view.forEach((r) => setRowSelected(r, isOn));
      refreshSelectionView();
      emitSelection();
      return;
    }
    if (e.target.closest('.lk-datagrid__menu-btn')) return;
    const th = e.target.closest('th.lk-table__th--sortable');
    if (!th || !headRow.contains(th)) return;
    const col = columns.find((c) => c._id === th.dataset.col);
    if (col) toggleSort(col.field);
  }

  function onHeadKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('th.lk-table__th--sortable');
    if (!th || e.target !== th) return;
    e.preventDefault();
    th.click();
  }

  function onBodyClick(e) {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn && tbody.contains(actionBtn)) {
      if (actionBtn.dataset.action === 'save') saveEdit();
      else cancelEdit();
      return;
    }

    const cmdBtn = e.target.closest('.lk-datagrid__cmd');
    const tr = e.target.closest('tr.lk-datagrid__row');
    if (!tr || !tbody.contains(tr) || tr.classList.contains('lk-datagrid__row--editing')) return;
    const index = Number(tr.dataset.index);
    const row = ds.view[index];
    if (!row) return;

    if (cmdBtn) {
      const col = columns.find((c) => c._id === cmdBtn.dataset.col);
      const list = Array.isArray(col?.command) ? col.command : [col?.command];
      const cmd = list[Number(cmdBtn.dataset.cmd)];
      const def = commandDef(cmd);
      if (cmd === 'destroy') removeRow(row);
      else if (cmd === 'edit') startEdit(row, false);
      else if (def && typeof def.click === 'function') def.click(row, api, e);
      return;
    }

    if (e.target.closest('.lk-datagrid__checkbox')) {
      handleRowSelect(index, e, true);
      return;
    }
    if (e.target.closest('a, button, input, select, textarea, label')) return;

    activeRowIndex = index;
    if (selectMode) handleRowSelect(index, e, false);
    if (typeof options.onRowClick === 'function') options.onRowClick({ row, index, event: e, grid: api, component: api });
  }

  function focusRow(index) {
    const rows = qsa('.lk-datagrid__row:not(.lk-datagrid__row--editing)', tbody);
    if (!rows.length) return;
    activeRowIndex = Math.max(0, Math.min(rows.length - 1, index));
    rows.forEach((tr, i) => { tr.tabIndex = i === activeRowIndex ? 0 : -1; });
    rows[activeRowIndex].focus();
  }

  function onBodyKeydown(e) {
    if (!selectMode) return;
    const tr = e.target.closest('tr.lk-datagrid__row');
    if (!tr || e.target !== tr) return;
    const index = Number(tr.dataset.index);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(index + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
    else if (e.key === 'End') { e.preventDefault(); focusRow(Infinity); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleRowSelect(index, e, false); }
  }

  on(thead, 'click', onHeadClick);
  on(thead, 'keydown', onHeadKeydown);
  on(tbody, 'click', onBodyClick);
  on(tbody, 'keydown', onBodyKeydown);

  // --- Delete command ------------------------------------------------------------------------------------

  function removeRow(row) {
    const doRemove = () => {
      const key = rowKey(row);
      selected.delete(key);
      if (editState && editState.key === key) cancelEdit(true);
      ds.remove((r) => r === row || rowKey(r) === key).catch((err) => {
        if (typeof options.onError === 'function') options.onError({ error: err, action: 'delete', grid: api, component: api });
      });
    };
    if (!options.confirmDelete) { doRemove(); return; }
    lkDialog({
      title: 'Confirm',
      content: options.confirmDelete,
      confirmText: 'Delete',
      destroyOnClose: true,
      onConfirm: doRemove,
    });
  }

  // --- Data binding ------------------------------------------------------------------------------------------

  function render(reason) {
    if (destroyed) return;
    // Columns can only be inferred once data exists
    if (!options.columns && !columns.some((c) => c._kind === 'data') && ds.view.length) {
      destroyHeaderCache();
      buildColumns(autoColumns());
      renderColgroup();
      renderHeader();
      renderFilterRow();
    }

    root.classList.toggle('lk-datagrid--loading', ds.loading);
    loadingEl.hidden = !ds.loading;
    if (reason === 'sort' || reason === 'filter') updateHeaderState();

    // A "loading" refresh carries the same rows — keep them (and any animation) on screen
    if (reason !== 'loading') {
      // Re-sorted rows settle in: right away for local sorts, after the read for server sorts
      const animate = pendingAnimate && (reason === 'sort' ? !isRemote('sort') : reason === 'load');
      if (animate) pendingAnimate = false;
      renderBody(animate);
      if (typeof options.onDataBound === 'function') options.onDataBound({ items: ds.view.slice(), reason, grid: api, component: api });
    }
    renderPager();
  }

  // --- Public API ------------------------------------------------------------------------------------------------

  const api = {};
  applyBase(api, root);

  Object.defineProperties(api, {
    dataSource: { get: () => ds, enumerable: true },
    columns: { get: () => columns.filter((c) => !c._auto).map(({ _id, _kind, ...c }) => c), enumerable: true },
    selectedRows: { get: () => Array.from(selected.values()), enumerable: true },
    selectedKeys: { get: () => Array.from(selected.keys()), enumerable: true },
    filters: { get: () => JSON.parse(JSON.stringify(columnFilters)), enumerable: true },
    isEditing: { get: () => !!editState, enumerable: true },
    editingRow: { get: () => editState?.row ?? null, enumerable: true },
    table: { get: () => tableEl, enumerable: true },
  });

  api.refresh = () => { renderBody(false); renderPager(); return api; };
  api.reload = () => (ds.canRead ? ds.load() : Promise.resolve(ds.view.slice()));

  api.select = (keysOrRows) => {
    const list = Array.isArray(keysOrRows) ? keysOrRows : [keysOrRows];
    if (selectMode === 'single' && !hasSelectColumn()) selected.clear();
    list.forEach((k) => {
      const row = isObject(k) ? k : (ds.items.find((r) => rowKey(r) === k) || ds.view.find((r) => rowKey(r) === k));
      if (row) selected.set(rowKey(row), row);
    });
    refreshSelectionView();
    emitSelection();
    return api;
  };

  api.clearSelection = () => {
    selected.clear();
    refreshSelectionView();
    emitSelection();
    return api;
  };

  function setColumnHidden(idOrField, hidden) {
    const col = columns.find((c) => c._id === idOrField || c.field === idOrField);
    if (!col || col.hidden === hidden) return api;
    col.hidden = hidden;
    renderColgroup();
    renderHeader();
    renderFilterRow();
    renderBody(false);
    return api;
  }
  api.showColumn = (field) => setColumnHidden(field, false);
  api.hideColumn = (field) => setColumnHidden(field, true);

  api.setColumns = (defs) => {
    if (editState) cancelEdit(true);
    destroyHeaderCache();
    buildColumns(defs);
    renderColgroup();
    renderHeader();
    renderFilterRow();
    renderBody(false);
    return api;
  };

  api.search = (term) => {
    searchTerm = String(term ?? '').trim();
    if (searchInput) searchInput.value = searchTerm;
    applyFilters();
    return api;
  };

  // Programmatic column filter: filter('salary', { op: 'gte', value: 5000 }) — null clears
  api.filter = (field, rule) => {
    if (rule == null || rule.value === '' || rule.value == null) delete columnFilters[field];
    else columnFilters[field] = { ...rule };
    applyFilters();
    return api;
  };
  api.clearFilters = () => {
    Object.keys(columnFilters).forEach((k) => delete columnFilters[k]);
    searchTerm = '';
    if (searchInput) searchInput.value = '';
    applyFilters();
    return api;
  };
  api.sort = (field, dir) => { sortColumn(field, dir || null); return api; };

  api.editRow = (keyOrRow) => {
    const row = isObject(keyOrRow) ? keyOrRow
      : (ds.view.find((r) => rowKey(r) === keyOrRow) || ds.items.find((r) => rowKey(r) === keyOrRow));
    if (row) startEdit(row, false);
    return api;
  };
  api.addRow = (defaults = {}) => { startEdit(defaults, true); return api; };
  api.saveRow = () => saveEdit();
  api.cancelEdit = () => { cancelEdit(); return api; };

  api.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (popupDialog) { const dlg = popupDialog; popupDialog = null; dlg.destroy(); }
    flushEditors(popupEditors);
    flushEditors(inlineEditors);
    editState = null;
    unsubscribe();
    stopError();
    applySearch.cancel();
    applyFiltersDebounced.cancel();
    clearTimeout(sortTimer);
    cleanups.forEach((fn) => fn());
    destroyHeaderCache();
    pager?.destroy();
    pageSizeDd?.destroy();
    root.textContent = '';
    originalChildren.forEach((n) => root.appendChild(n));
    root.classList.remove('lk-datagrid--dense', 'lk-datagrid--scrollable', 'lk-datagrid--loading');
    if (addedRootClass) root.classList.remove('lk-datagrid');
  };

  // --- Boot --------------------------------------------------------------------------------------------------------

  renderToolbar();
  renderColgroup();
  renderHeader();
  renderFilterRow();

  const unsubscribe = ds.subscribe((state, payload) => render(payload?.reason));
  const stopError = ds.on('error', (e) => {
    if (typeof options.onError === 'function') options.onError({ error: e.error, action: e.action, grid: api, component: api });
  });

  if (options.autoBind && ds.canRead && !ds.loading && !ds.items.length) {
    ds.load().catch(() => {});
  }

  return api;
}

// =============================================================================
// Legacy: enhance an existing <table> with click-to-sort headers
// =============================================================================

function enhanceTable(node, opts = {}) {
  const addedRootClass = !node.classList.contains('lk-table');
  node.classList.add('lk-table');

  const sortable = opts.sortable !== false;
  let sortCol = null;
  let sortOrder = 'asc';
  let sortTimer = null;

  const headers = qsa('thead th', node);
  const tbody = node.querySelector('tbody');

  function compareValues(a, b) {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  }

  function clearSortMotion() {
    if (sortTimer) {
      clearTimeout(sortTimer);
      sortTimer = null;
    }
    node.classList.remove('lk-table--sorting');
    qsa('tbody tr', node).forEach((row) => {
      row.classList.remove('lk-table__row--sorted');
      row.style.removeProperty('--lk-sort-i');
    });
  }

  function applySortMotion(rows) {
    clearSortMotion();
    node.classList.add('lk-table--sorting');
    rows.forEach((row, idx) => {
      row.style.setProperty('--lk-sort-i', String(idx));
      row.classList.add('lk-table__row--sorted');
    });
    sortTimer = setTimeout(clearSortMotion, SORT_ANIM_MS);
  }

  function sortByColumn(colIndex) {
    if (colIndex == null || colIndex === '') return;
    colIndex = Number(colIndex);
    if (!tbody || !Number.isInteger(colIndex) || colIndex < 0 || colIndex >= headers.length) return;

    if (sortCol === colIndex) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = colIndex;
      sortOrder = 'asc';
    }

    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const cellA = a.cells[colIndex]?.textContent.trim() ?? '';
      const cellB = b.cells[colIndex]?.textContent.trim() ?? '';
      const result = compareValues(cellA, cellB);
      return sortOrder === 'asc' ? result : -result;
    });
    rows.forEach((row) => tbody.appendChild(row));

    headers.forEach((th, i) => {
      th.removeAttribute('aria-sort');
      if (i === colIndex) th.setAttribute('aria-sort', sortOrder === 'asc' ? 'ascending' : 'descending');
    });

    applySortMotion(rows);
    if (opts.onSort) opts.onSort({ column: colIndex, order: sortOrder, component: comp });
  }

  function onHeaderClick(e) {
    if (!sortable) return;
    const th = e.target.closest('th');
    if (!th) return;
    const idx = headers.indexOf(th);
    if (idx >= 0) sortByColumn(idx);
  }

  function onHeaderKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('th');
    const idx = headers.indexOf(th);
    if (idx < 0) return;
    e.preventDefault();
    sortByColumn(idx);
  }

  const thead = node.querySelector('thead');
  const addedTabindex = [];

  if (sortable) {
    headers.forEach((th) => {
      th.classList.add('lk-table__th--sortable');
      if (!th.hasAttribute('tabindex')) {
        th.setAttribute('tabindex', '0');
        addedTabindex.push(th);
      }
    });
    thead?.addEventListener('click', onHeaderClick);
    thead?.addEventListener('keydown', onHeaderKeydown);
  }

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    sortBy: {
      get() { return sortCol; },
      set(v) { sortByColumn(v); },
      enumerable: true,
    },
    sortOrder: {
      get() { return sortOrder; },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    clearSortMotion();
    thead?.removeEventListener('click', onHeaderClick);
    thead?.removeEventListener('keydown', onHeaderKeydown);
    headers.forEach((th) => {
      th.classList.remove('lk-table__th--sortable');
      th.removeAttribute('aria-sort');
    });
    addedTabindex.forEach((th) => th.removeAttribute('tabindex'));
    if (addedRootClass) node.classList.remove('lk-table');
  };

  return comp;
}
