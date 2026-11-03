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
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard, guardSync } from '../helpers/guard.js';
import { lkStorage } from './storage.js';

lkI18n.define('table', {
  noRecords: 'No records found',
  confirmDelete: 'Delete this record?',
  actions: 'Actions',
  'toolbar.add': 'Add new',
  'search.placeholder': 'Search…',
  'op.contains': 'Contains',
  'op.eq': 'Is equal to',
  'op.ne': 'Is not equal to',
  'op.startsWith': 'Starts with',
  'op.endsWith': 'Ends with',
  'op.on': 'Is on',
  'op.before': 'Is before',
  'op.after': 'Is after',
  'filter.title': 'Filter',
  'filter.apply': 'Filter',
  'filter.all': 'All',
  'filter.placeholder': 'Filter…',
  'filter.valuePlaceholder': 'Value…',
  'filter.operator': 'Operator',
  'filter.column': 'Filter {column}',
  'filter.value': 'Filter value for {column}',
  'menu.sortAsc': 'Sort ascending',
  'menu.sortDesc': 'Sort descending',
  'menu.clearSort': 'Clear sort',
  'menu.columns': 'Columns',
  'menu.label': '{column} column options',
  'menu.button': '{column} column menu',
  'menu.buttonState': '{column} column menu ({state})',
  'state.sortedAsc': 'sorted ascending',
  'state.sortedDesc': 'sorted descending',
  'state.filtered': 'filtered',
  'select.all': 'Select all rows on this page',
  'select.row': 'Select row',
  'edit.add': 'Add record',
  'edit.edit': 'Edit record',
  'pager.label': 'Pagination',
  'pager.pageSize': 'Rows per page',
  'pager.info': '{from}–{to} of {total}',
  'pager.none': 'No items',
  'resize.label': 'Resize {column} column',
  'reorder.hint': 'Press Alt+Left or Alt+Right to move this column.',
  'reorder.moved': 'Column {column} moved to position {to} of {total}',
  'rowReorder.header': 'Reorder',
  'rowReorder.grip': 'Reorder row {n}. Press Space to pick up.',
  'rowReorder.disabled': 'Row reordering is unavailable while the grid is sorted or filtered',
  'rowReorder.pickedUp': 'Picked up row {n}. Use Up and Down to move, Space to drop, Escape to cancel.',
  'rowReorder.position': 'Position {to} of {total}',
  'rowReorder.moved': 'Row moved to position {to} of {total}',
  'rowReorder.cancelled': 'Move cancelled',
});

const SORT_ANIM_MS = 260;
const DEFAULT_COL_PX = 120;

// "120", 120, "120px", "8rem" → pixels (null when not a plain length)
function toPx(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /^([\d.]+)\s*(px|rem|em)?$/.exec(String(v).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (m[2] === 'rem' || m[2] === 'em') {
    return n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  }
  return n;
}

function prefersReducedMotion() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

// Filter operators per column type (first one is the default).
// A label starting with 'op.' is a text key (resolved when rendered); symbols are language-neutral.
const OPERATORS = {
  string: [
    ['contains', 'op.contains'], ['eq', 'op.eq'], ['ne', 'op.ne'],
    ['startsWith', 'op.startsWith'], ['endsWith', 'op.endsWith'],
  ],
  number: [
    ['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'],
  ],
  date: [
    ['on', 'op.on'], ['before', 'op.before'], ['after', 'op.after'],
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

// Numbers and dates follow the active Look.i18n locale (falls back to the browser's on a bad tag)
function localeNumber(n) {
  try { return Number(n).toLocaleString(lkI18n.locale); } catch (e) { return Number(n).toLocaleString(); }
}

function localeDate(d) {
  try { return d.toLocaleDateString(lkI18n.locale); } catch (e) { return d.toLocaleDateString(); }
}

// `t` = the grid's absolute-key translator (tx.tf) for the Yes / No words
function defaultFormat(value, type, t) {
  if (value == null || value === '') return '';
  if (type === 'number' && Number.isFinite(Number(value))) return localeNumber(value);
  if (type === 'date') {
    const d = toDate(value);
    return d ? localeDate(d) : String(value);
  }
  if (type === 'boolean') return value ? t('common.yes') : t('common.no');
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
 * @param {boolean|Object} [opts.resizable=false] — column resize handles: true | { minWidth, maxWidth, mode: 'expand'|'fit' }
 *   (per column: resizable: false, width, minWidth, maxWidth). Events: onColumnResize; guard: beforeColumnResize.
 * @param {boolean} [opts.reorderable=false] — drag a header (or Alt+Left/Right) to move a column (per column: reorderable: false).
 *   Events: onColumnReorder; guard: beforeColumnReorder.
 * @param {boolean|Object} [opts.rowReorder=false] — drag rows (grip column, or the whole row with handle: false): true | { handle, field }.
 *   Local data only; disabled while sorted/filtered. Events: onRowReorder; guard: beforeRowReorder.
 * @param {string|Object} [opts.persist] — storage key (or { key, session }) saving column widths, order and visibility
 * @param {string|number} [opts.height] — fixed body height (scrolls with a sticky header)
 * @param {boolean} [opts.striped] [opts.hover=true] [opts.bordered] [opts.dense]
 * @param {boolean} [opts.autoBind=true] — load remote data on creation
 * @param {string}  [opts.keyField] — record key (default: the data source's keyField)
 * @param {string|Function} [opts.noRecords] — empty text (wins over the localized 'table.noRecords')
 * @param {string}  [opts.confirmDelete] — confirmation text (wins over 'table.confirmDelete'); false to delete without asking
 * @param {Object}  [opts.text] — text overrides, see Look.i18n (namespace 'table'); explicit options above win
 * @param {Function} [opts.rowClass] — (row) => className
 * @param {Function} [opts.onDataBound] [opts.onChange] [opts.onRowClick] [opts.onSort] [opts.onPage] [opts.onFilter]
 *                   [opts.onEdit] [opts.onSave] (return false to veto — legacy, same as beforeSave) [opts.onCancel] [opts.onError]
 * Overridable events — each takes ONE event object (incl. `component`, `source`) and may return false / a Promise
 * (also the cancelable DOM event 'lk:before-<name>' on the grid root); the matching on* callback fires only if it went through:
 * @param {Function} [opts.beforeSort] [opts.beforeFilter] [opts.beforePage] [opts.beforeSelect] [opts.beforeEdit]
 *                   [opts.beforeSave] [opts.beforeDelete] [opts.beforeCancel]
 *                   [opts.beforeColumnResize] [opts.beforeColumnReorder] [opts.beforeRowReorder]
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
    resizable: false,
    reorderable: false,
    rowReorder: false,
    persist: null,
    keyField: null,
    noRecords: undefined,      // default: the localized 'table.noRecords'
    confirmDelete: undefined,  // default: the localized 'table.confirmDelete'; false = delete without asking
    rowClass: null,
    ...opts,
  };

  // Texts: explicit options (noRecords, confirmDelete, editable.title, column titles…) win,
  // then opts.text, then the Look.i18n locale.
  const tx = bindText('table', opts.text, () => refreshTexts());
  const fmtDefault = (v, type) => defaultFormat(v, type, tx.tf);
  const opLabel = (label) => (String(label).startsWith('op.') ? tx.t(label) : label);
  const noRecordsOf = () => (options.noRecords === undefined ? tx.t('noRecords') : options.noRecords);
  const confirmDeleteOf = () => (options.confirmDelete === undefined ? tx.t('confirmDelete') : options.confirmDelete);
  const colLabel = (c) => c.title || c.field || tx.t('actions');

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

  // Column resize / reorder, row reorder (all opt-in)
  const resizeCfg = options.resizable ? {
    minWidth: 48, maxWidth: Infinity, mode: 'expand',
    ...(isObject(options.resizable) ? options.resizable : {}),
  } : null;
  if (resizeCfg) {
    resizeCfg.minWidth = toPx(resizeCfg.minWidth) ?? 48;
    resizeCfg.maxWidth = toPx(resizeCfg.maxWidth) ?? Infinity;
    resizeCfg.mode = resizeCfg.mode === 'fit' ? 'fit' : 'expand';
  }
  const reorderCfg = !!options.reorderable;
  let rowCfg = options.rowReorder
    ? { handle: true, field: null, ...(isObject(options.rowReorder) ? options.rowReorder : {}) }
    : null;
  if (rowCfg && ds.server.paging) {
    // eslint-disable-next-line no-console
    console.warn('Look.lkTable: rowReorder needs a local (non server-paged) data source — row reordering is disabled.');
    rowCfg = null;
  }
  const persistCfg = options.persist
    ? (isObject(options.persist) ? { ...options.persist } : { key: String(options.persist) })
    : null;

  // Feature state (declared before the first buildColumns call)
  let frozen = false;          // column widths pinned in px + fixed table layout (after the first resize)
  let kbSession = null;        // keyboard column resize in progress
  let kbRow = null;            // keyboard row move in progress
  let dragCleanup = null;      // active pointer session (resize / column drag / row drag)
  let suppressClick = false;   // swallow the click that follows a drag
  let movedKey;                // key of the row that was just moved (highlight)
  let movedTimer = null;
  let gripIndex = 0;           // roving tabindex among the row grips
  let restoring = false;       // applying persisted state (no save)
  let initialCols = null;      // { order, hidden } as configured, for resetColumns()
  const colEls = new Map();    // colId -> <col>
  const ghosts = new Set();    // floating drag ghosts (in <body>)

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
    // Row reordering with a grip: a leading, always-fixed handle column
    if (rowCfg && rowCfg.handle) {
      list.unshift({ _id: `c${colSeq++}`, _kind: 'grip', title: '', hidden: false, _auto: true });
    }
    if (frozen) unfreeze();
    columns = list;
    initialCols = { order: list.slice(), hidden: new Map(list.map((c) => [c, c.hidden])) };
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
  const isResizable = (c) => !!resizeCfg && c.resizable !== false
    && (c._kind === 'data' || (c._kind === 'command' && !c._auto));
  const isReorderable = (c) => reorderCfg && c._kind === 'data' && c.reorderable !== false && !c.frozen;
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
  const liveEl = el('div', 'lk-datagrid__live');   // polite announcements (reorder)
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  const hintEl = el('span', 'lk-datagrid__sr', tx.t('reorder.hint'));
  hintEl.id = uid('lk-dg-hint');
  const featureClasses = [
    resizeCfg && 'lk-datagrid--resizable',
    reorderCfg && 'lk-datagrid--reorderable',
    rowCfg && 'lk-datagrid--row-reorder',
  ].filter(Boolean);
  root.classList.add(...featureClasses);

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
  loadingEl.title = tx.tf('common.loading');
  loadingEl.appendChild(el('span', 'lk-spinner lk-datagrid__spinner'));

  if (options.height != null) {
    contentEl.style.height = typeof options.height === 'number' ? `${options.height}px` : String(options.height);
    root.classList.add('lk-datagrid--scrollable');
  }

  if (options.toolbar) root.appendChild(toolbarEl);
  root.append(contentEl, loadingEl);
  if (pageCfg) root.appendChild(pagerEl);
  if (reorderCfg || rowCfg) root.append(liveEl, hintEl);

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
  let pagerNav = null;
  let pageSizeLabel = null;
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

  // Overridable events: before<Name>(event) / DOM 'lk:before-<name>' on the grid root. The event object
  // always carries `component`. `proceed()` runs when allowed (maybe later for async guards); `revert()`
  // puts the UI back when the action is vetoed (now, or when a Promise guard resolves false).
  function ask(name, event, proceed, revert) {
    const ev = { ...event, grid: api, component: api };
    const r = guard(root, options, name, undefined, ev, proceed);
    if (r === false) { if (revert) revert(); } else if (r && typeof r.then === 'function') {
      r.then((ok) => { if (ok === false && revert) revert(); });
    }
    return r;
  }

  function rowKey(row) {
    const k = getField(row, keyField);
    return k === undefined ? row : k;
  }

  // --- Toolbar -------------------------------------------------------------------------

  let searchInput = null;
  const applySearch = debounce((term) => {
    changeFilters({ search: term.trim() }, 'search');
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
        searchInput.placeholder = tx.t('search.placeholder');
        searchInput.setAttribute('aria-label', tx.tf('common.search'));
        on(searchInput, 'input', () => applySearch(searchInput.value));
        wrap.appendChild(searchInput);
        toolbarEl.appendChild(wrap);
      } else if (item === 'create' || (isObject(item) && item.name === 'create' && !item.click)) {
        const btn = el('button', 'lk-btn lk-btn--sm lk-btn--primary');
        btn.type = 'button';
        btn.dataset.name = 'create';
        btn.appendChild(lkIcon('plus', { size: 'sm' }));
        const caption = document.createTextNode(isObject(item) && item.text ? item.text : tx.t('toolbar.add'));
        if (!(isObject(item) && item.text)) btn.dataset.i18n = 'toolbar.add';
        btn.appendChild(caption);
        on(btn, 'click', () => startEdit({}, true, 'toolbar'));
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
        const shown = typeof c.format === 'function' ? c.format(v, row) : fmtDefault(v, c.type);
        return String(shown ?? '').toLowerCase().includes(term) || String(v ?? '').toLowerCase().includes(term);
      }));
  }

  // Ask before changing the filters. `next` = { filters?, search? } (what the grid would end up with);
  // a veto puts the search box / filter row back to the current state.
  function changeFilters(next, source) {
    if (destroyed) return;
    const filters = next.filters ? { ...next.filters } : { ...columnFilters };
    const search = next.search != null ? next.search : searchTerm;
    ask('filter', { filters, search, source }, () => {
      Object.keys(columnFilters).forEach((k) => delete columnFilters[k]);
      Object.assign(columnFilters, filters);
      searchTerm = search;
      if (searchInput && searchInput.value.trim() !== searchTerm) searchInput.value = searchTerm;
      applyFilters();
    }, () => {
      if (searchInput) searchInput.value = searchTerm;
      renderFilterRow();
    });
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
  const pendingRow = {}; // filter-row edits waiting for the debounce
  const applyFiltersDebounced = debounce(() => {
    const filters = { ...columnFilters, ...pendingRow };
    Object.keys(pendingRow).forEach((k) => delete pendingRow[k]);
    changeFilters({ filters }, 'filterRow');
  }, 300);

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
          [['', tx.t('filter.all')], ['true', tx.tf('common.yes')], ['false', tx.tf('common.no')]].forEach(([v, t]) => {
            const o = el('option', null, t);
            o.value = v;
            input.appendChild(o);
          });
          input.value = hasFilter(c.field) ? String(columnFilters[c.field].value) : '';
          on(input, 'change', () => {
            changeFilters({ filters: { ...columnFilters, [c.field]: { op: 'eq', value: input.value } } }, 'filterRow');
          });
        } else {
          input = el('input', 'lk-input lk-input--dense lk-datagrid__filter-input');
          input.type = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'search');
          input.placeholder = c.filter?.placeholder ?? (type === 'number' ? '=' : tx.t('filter.placeholder'));
          input.value = pendingRow[c.field]?.value ?? columnFilters[c.field]?.value ?? '';
          on(input, 'input', () => {
            pendingRow[c.field] = { op: c.filter?.operator || OPERATORS[type][0][0], value: input.value };
            applyFiltersDebounced();
          });
        }
        input.setAttribute('aria-label', tx.t('filter.column', { column: c.title || c.field }));
        th.appendChild(input);
      }
      filterRow.appendChild(th);
    });
  }

  // --- Sorting -------------------------------------------------------------------------------------------

  function currentSort() {
    return normalizeSort(ds.sort);
  }

  function setSort(next, source = 'api') {
    ask('sort', { sort: next, source }, () => {
      pendingAnimate = true;
      ds.setSort(next.length ? (sortCfg.mode === 'multiple' ? next : next[0]) : null);
      syncRemote('sort');
      updateHeaderState();
      if (typeof options.onSort === 'function') options.onSort({ sort: next, grid: api, component: api });
    });
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
    setSort(next, 'header');
  }

  // Explicit direction from the column menu (null clears this column's sort)
  function sortColumn(field, dir, source = 'menu') {
    const others = sortCfg.mode === 'multiple' ? currentSort().filter((s) => s.field !== field) : [];
    if (!dir) {
      setSort(sortCfg.mode === 'multiple' ? others : [], source);
      return;
    }
    const existing = currentSort().findIndex((s) => s.field === field);
    if (sortCfg.mode === 'multiple' && existing > -1) {
      const next = currentSort();
      next[existing] = { field, dir };
      setSort(next, source);
    } else {
      setSort([...others, { field, dir }], source);
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
    wrap.setAttribute('aria-label', tx.t('menu.label', { column: colLabel(c) }));
    const refreshers = [];

    // Sort
    if (isSortable(c)) {
      const section = el('div', 'lk-datagrid-menu__section');
      const asc = menuItem('sort-asc', tx.t('menu.sortAsc'), () => { sortColumn(c.field, 'asc'); close(); });
      const desc = menuItem('sort-desc', tx.t('menu.sortDesc'), () => { sortColumn(c.field, 'desc'); close(); });
      const clear = menuItem('close', tx.t('menu.clearSort'), () => { sortColumn(c.field, null); close(); });
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
      section.appendChild(el('div', 'lk-datagrid-menu__title', tx.t('filter.title')));

      let opSelect = null;
      let valueInput;
      if (type === 'boolean') {
        valueInput = el('select', 'lk-input lk-input--dense');
        [['', tx.t('filter.all')], ['true', tx.tf('common.yes')], ['false', tx.tf('common.no')]].forEach(([v, t]) => {
          const o = el('option', null, t);
          o.value = v;
          valueInput.appendChild(o);
        });
      } else {
        opSelect = el('select', 'lk-input lk-input--dense');
        opSelect.setAttribute('aria-label', tx.t('filter.operator'));
        OPERATORS[type].forEach(([v, t]) => {
          const o = el('option', null, opLabel(t));
          o.value = v;
          opSelect.appendChild(o);
        });
        section.appendChild(opSelect);
        valueInput = el('input', 'lk-input lk-input--dense');
        valueInput.type = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text');
        valueInput.placeholder = type === 'string' ? tx.t('filter.valuePlaceholder') : '';
      }
      valueInput.setAttribute('aria-label', tx.t('filter.value', { column: colLabel(c) }));
      section.appendChild(valueInput);

      const actions = el('div', 'lk-datagrid-menu__actions');
      const clearBtn = el('button', 'lk-btn lk-btn--sm lk-btn--secondary', tx.tf('common.clear'));
      clearBtn.type = 'button';
      const applyBtn = el('button', 'lk-btn lk-btn--sm lk-btn--primary', tx.t('filter.apply'));
      applyBtn.type = 'submit';
      actions.append(clearBtn, applyBtn);
      section.appendChild(actions);

      section.addEventListener('submit', (e) => {
        e.preventDefault();
        changeFilters({ filters: { ...columnFilters, [c.field]: { op: opSelect ? opSelect.value : 'eq', value: valueInput.value } } }, 'menu');
        close();
      });
      clearBtn.addEventListener('click', () => {
        const rest = { ...columnFilters };
        delete rest[c.field];
        changeFilters({ filters: rest }, 'menu');
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
      section.appendChild(el('div', 'lk-datagrid-menu__title', tx.t('menu.columns')));
      const boxes = toggleable.map((col) => {
        const label = el('label', 'lk-datagrid-menu__check');
        const cb = el('input', 'lk-checkbox');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => {
          const visibleCount = toggleableColumns().filter((x) => !x.hidden).length;
          if (!cb.checked && visibleCount <= 1) { cb.checked = true; return; } // keep at least one
          setColumnHidden(col._id, !cb.checked);
        });
        label.append(cb, el('span', null, col.title || (col.field ? titleCase(col.field) : tx.t('actions'))));
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
    colEls.clear();
    visibleColumns().forEach((c) => {
      const col = el('col');
      if (c._kind === 'select') col.style.width = '2.75rem';
      if (c._kind === 'grip') col.style.width = '2.5rem';
      // Once widths are pinned, a column that appeared later (shown / restored) needs a pixel width too
      if (frozen && c._width == null && c._kind !== 'select' && c._kind !== 'grip') c._width = toPx(c.width) || DEFAULT_COL_PX;
      const w = c._width != null ? c._width : c.width;
      if (w != null) col.style.width = typeof w === 'number' ? `${w}px` : w;
      if (c.minWidth != null) col.style.minWidth = typeof c.minWidth === 'number' ? `${c.minWidth}px` : c.minWidth;
      colgroup.appendChild(col);
      colEls.set(c._id, col);
    });
    applyTableWidth();
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
      cb.setAttribute('aria-label', tx.t('select.all'));
      th.appendChild(cb);
      entry.checkbox = cb;
    } else if (c._kind === 'grip') {
      th.classList.add('lk-datagrid__grip-cell');
      th.appendChild(el('span', 'lk-datagrid__sr', tx.t('rowReorder.header')));
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
        btn.setAttribute('aria-label', tx.t('menu.button', { column: colLabel(c) }));
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

      if (isReorderable(c)) {
        th.classList.add('lk-datagrid__th--reorderable');
        if (th.tabIndex < 0 || !th.hasAttribute('tabindex')) th.tabIndex = 0;
        th.setAttribute('aria-describedby', hintEl.id);
      }
      if (isResizable(c)) {
        th.classList.add('lk-datagrid__th--resizable');
        const r = el('span', 'lk-datagrid__resizer');
        r.setAttribute('role', 'separator');
        r.setAttribute('aria-orientation', 'vertical');
        r.tabIndex = 0;
        th.appendChild(r);
        entry.resizer = r;
      }
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
    updateHandles();
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
        const state = [sorted ? tx.t(sort[idx].dir === 'desc' ? 'state.sortedDesc' : 'state.sortedAsc') : '', filtered ? tx.t('state.filtered') : ''].filter(Boolean).join(', ');
        entry.menuBtn.setAttribute('aria-label', state
          ? tx.t('menu.buttonState', { column: colLabel(c), state })
          : tx.t('menu.button', { column: colLabel(c) }));
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
    if (v.required && empty && colType(c) !== 'boolean') return v.message || tx.tf('validation.required', { label });
    if (!empty) {
      if (v.min != null && Number(value) < v.min) return v.message || tx.tf('validation.min', { label, min: v.min });
      if (v.max != null && Number(value) > v.max) return v.message || tx.tf('validation.max', { label, max: v.max });
      if (v.minLength != null && String(value).length < v.minLength) return v.message || tx.tf('validation.minLength', { label, min: v.minLength });
      if (v.maxLength != null && String(value).length > v.maxLength) return v.message || tx.tf('validation.maxLength', { label, max: v.maxLength });
      if (v.pattern) {
        const re = v.pattern instanceof RegExp ? v.pattern : new RegExp(v.pattern);
        if (!re.test(String(value))) return v.message || tx.tf('validation.pattern', { label });
      }
    }
    if (typeof c.validate === 'function') {
      const r = c.validate(value, row);
      if (r !== true && r !== undefined && r !== null) return typeof r === 'string' ? r : tx.tf('validation.pattern', { label });
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

  // Enter edit mode (existing row, or a new record when isNew). Guarded by beforeEdit.
  function startEdit(row, isNew = false, source = 'api') {
    if (!editCfg) return;

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

    ask('edit', { row: isNew ? null : row, values: draft, isNew, source }, () => {
      if (destroyed) return;
      if (editState) discardEdit(true);
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
    });
  }

  // Leave edit mode without asking (internal: row switch, paging, delete, destroy)
  function discardEdit(silent = false) {
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

  // User-driven cancel (button, Escape, API): guarded by beforeCancel
  function cancelEdit(silent = false, source = 'user') {
    if (!editState) return;
    if (silent) { discardEdit(true); return; }
    ask('cancel', { row: editState.row, isNew: editState.isNew, source }, () => discardEdit(false));
  }

  async function saveEdit(source = 'user') {
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
    const saveEvent = { row: state.row, values, changes: state.isNew ? values : changes, isNew: state.isNew };

    // beforeSave (option / DOM event 'lk:before-save') may veto or hold the save (Promise)
    state.saving = true;
    const allowed = await new Promise((resolve) => {
      const r = ask('save', { ...saveEvent, source }, () => resolve(true), () => resolve(false));
      if (r === true) resolve(true);
    });
    if (!allowed || editState !== state || destroyed) {
      state.saving = false;
      return false;
    }
    // Legacy: onSave returning false still vetoes
    if (typeof options.onSave === 'function'
      && options.onSave({ ...saveEvent, grid: api, component: api }) === false) {
      state.saving = false;
      return false;
    }

    // lkDataSource updates optimistically: leave edit mode first so the record
    // isn't drawn twice (draft + saved), and restore it if the server rejects.
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
      const label = el('label', 'lk-label', c.title || titleCase(c.field)); // column titles are the caller's data
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
      saveEdit('popup').then((ok) => {
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
      : (editCfg.title || tx.t(state.isNew ? 'edit.add' : 'edit.edit'));

    popupDialog = lkDialog({
      title,
      content: form,
      confirmText: tx.tf('common.save'),
      cancelText: tx.tf('common.cancel'),
      destroyOnClose: true,
      className: 'lk-datagrid-popup',
      onConfirm() { submit(); return false; }, // stays open until the save succeeds
      onCancel() { // Cancel button: beforeCancel can keep the popup open (Escape / overlay close cannot be vetoed here)
        const g = guardSync(root, options, 'cancel', undefined, { row: state.row, isNew: state.isNew, source: 'popup', grid: api, component: api });
        return g.allowed ? undefined : false;
      },
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
      const noRecords = noRecordsOf();
      fill(td, typeof noRecords === 'function' ? noRecords(api) : noRecords, typeof noRecords === 'function');
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function commandDef(cmd) {
    if (cmd === 'destroy') return { name: 'destroy', text: tx.tf('common.delete'), icon: 'delete', color: 'negative' };
    if (cmd === 'edit') return { name: 'edit', text: tx.tf('common.edit'), icon: 'edit' };
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
        td.appendChild(cmdButton({ text: tx.tf('common.save'), icon: 'save', color: 'primary' }, { action: 'save' }));
        td.appendChild(cmdButton({ text: tx.tf('common.cancel'), icon: 'close' }, { action: 'cancel' }));
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
          onEnter: () => saveEdit('keyboard'),
          onEscape: () => cancelEdit(false, 'keyboard'),
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
        else td.textContent = fmtDefault(value, c.type);
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
    gripIndex = Math.min(gripIndex, Math.max(0, rows.length - 1));
    const reorderOn = rowReorderOn();

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
      if (selectMode || (rowCfg && !rowCfg.handle)) tr.tabIndex = i === activeRowIndex ? 0 : -1;
      if (rowCfg && !rowCfg.handle && reorderOn) tr.classList.add('lk-datagrid__row--draggable');
      if (movedKey !== undefined && key === movedKey) tr.classList.add('lk-datagrid__row--moved');
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
          cb.setAttribute('aria-label', tx.t('select.row'));
          td.appendChild(cb);
        } else if (c._kind === 'grip') {
          td.classList.add('lk-datagrid__grip-cell');
          const g = el('button', 'lk-datagrid__grip');
          g.type = 'button';
          g.tabIndex = i === gripIndex ? 0 : -1;
          if (reorderOn) {
            g.setAttribute('aria-label', tx.t('rowReorder.grip', { n: (ds.page - 1) * ds.pageSize + i + 1 }));
          } else {
            g.setAttribute('aria-label', tx.t('rowReorder.disabled'));
            g.setAttribute('aria-disabled', 'true');
            g.title = tx.t('rowReorder.disabled');
            g.classList.add('lk-datagrid__grip--disabled');
          }
          td.appendChild(g);
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
          else td.textContent = fmtDefault(value, c.type);
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
      nav.setAttribute('aria-label', tx.t('pager.label'));
      pagerNav = nav;
      const ul = el('ul', 'lk-pagination lk-pagination--dense');
      nav.appendChild(ul);
      pagerEl.appendChild(nav);

      pager = lkPagination(ul, {
        totalPages: ds.totalPages,
        page: ds.page,
        maxVisible: pageCfg.maxVisible,
        onChange(p) {
          if (syncingPager) return;
          ask('page', { page: p, pageSize: ds.pageSize, source: 'pager' }, () => {
            if (editState && editCfg.mode === 'inline') discardEdit(false);
            ds.setPage(p);
            syncRemote('paging');
            if (typeof options.onPage === 'function') options.onPage({ page: p, grid: api, component: api });
          }, () => { // vetoed: move the pager back to the current page
            syncingPager = true;
            pager.page = ds.page;
            syncingPager = false;
          });
        },
      });

      const right = el('div', 'lk-datagrid__pager-meta');
      if (Array.isArray(pageCfg.pageSizes) && pageCfg.pageSizes.length) {
        const sizeWrap = el('div', 'lk-datagrid__page-size');
        pageSizeLabel = el('span', 'lk-datagrid__page-size-label', tx.t('pager.pageSize'));
        sizeWrap.appendChild(pageSizeLabel);
        const host = el('div', 'lk-input--dense');
        sizeWrap.appendChild(host);
        right.appendChild(sizeWrap);
        pageSizeDd = lkDropdown(host, {
          items: pageCfg.pageSizes.map((n) => ({ value: n, label: String(n) })),
          value: ds.pageSize,
          onChange(v) {
            if (v == null) return;
            ask('page', { page: 1, pageSize: Number(v), source: 'pageSize' }, () => {
              ds.setPageSize(Number(v));
              syncRemote('paging');
            }, () => { pageSizeDd.value = ds.pageSize; });
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
      infoEl.textContent = total
        ? tx.t('pager.info', { from: localeNumber(start), to: localeNumber(end), total: localeNumber(total), count: total })
        : tx.t('pager.none');
    }
  }

  // --- Selection -------------------------------------------------------------------------------------

  function emitSelection() {
    if (typeof options.onChange === 'function') {
      options.onChange({ selectedRows: api.selectedRows, selectedKeys: api.selectedKeys, grid: api, component: api });
    }
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

  // Selection changes are staged on a copy, offered to beforeSelect (selectedRows / selectedKeys = what
  // the selection WOULD be), then committed. A veto repaints the checkboxes from the real selection.
  function requestSelection(mutate, source, extra) {
    const next = new Map(selected);
    mutate(next);
    ask('select', { selectedRows: Array.from(next.values()), selectedKeys: Array.from(next.keys()), ...extra, source }, () => {
      selected.clear();
      next.forEach((v, k) => selected.set(k, v));
      refreshSelectionView();
      emitSelection();
    }, refreshSelectionView);
  }

  function handleRowSelect(index, e, viaCheckbox) {
    const row = ds.view[index];
    if (!row) return;
    const key = rowKey(row);
    const multi = selectMode === 'multiple' || viaCheckbox || (hasSelectColumn() && !selectMode);

    requestSelection((next) => {
      if (multi) {
        if (e?.shiftKey && lastAnchorKey != null) {
          const keys = ds.view.map(rowKey);
          const a = keys.indexOf(lastAnchorKey);
          const [from, to] = a < 0 ? [index, index] : [Math.min(a, index), Math.max(a, index)];
          for (let i = from; i <= to; i++) next.set(rowKey(ds.view[i]), ds.view[i]);
        } else {
          if (next.has(key)) next.delete(key); else next.set(key, row);
          lastAnchorKey = key;
        }
      } else {
        const wasOnly = next.size === 1 && next.has(key);
        next.clear();
        if (!wasOnly) next.set(key, row);
        lastAnchorKey = key;
      }
    }, viaCheckbox ? 'checkbox' : (e?.type === 'keydown' ? 'keyboard' : 'click'), { row, index });
  }

  // --- Events ---------------------------------------------------------------------------------------------

  function onHeadClick(e) {
    if (e.target.closest('.lk-datagrid__resizer')) return;
    if (headerCheckbox && e.target === headerCheckbox) {
      const isOn = headerCheckbox.checked;
      requestSelection((next) => {
        ds.view.forEach((r) => { if (isOn) next.set(rowKey(r), r); else next.delete(rowKey(r)); });
      }, 'selectAll', {});
      return;
    }
    if (e.target.closest('.lk-datagrid__menu-btn')) return;
    const th = e.target.closest('th.lk-table__th--sortable');
    if (!th || !headRow.contains(th)) return;
    const col = columns.find((c) => c._id === th.dataset.col);
    if (col) toggleSort(col.field);
  }

  function onHeadKeydown(e) {
    const handle = e.target.closest('.lk-datagrid__resizer');
    if (handle) { resizerKeydown(e, handle); return; }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && reorderCfg) {
      const rth = e.target.closest('th');
      const rcol = rth && e.target === rth ? columns.find((c) => c._id === rth.dataset.col) : null;
      if (rcol && isReorderable(rcol)) {
        e.preventDefault();
        const rtl = getComputedStyle(root).direction === 'rtl';
        keyMoveColumn(rcol, (e.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1));
      }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('th.lk-table__th--sortable');
    if (!th || e.target !== th) return;
    e.preventDefault();
    th.click();
  }

  function onBodyClick(e) {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn && tbody.contains(actionBtn)) {
      if (actionBtn.dataset.action === 'save') saveEdit('button');
      else cancelEdit(false, 'button');
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
      else if (cmd === 'edit') startEdit(row, false, 'button');
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

  const swallowClick = (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  on(thead, 'click', swallowClick, true);
  on(tbody, 'click', swallowClick, true);
  on(thead, 'click', onHeadClick);
  on(thead, 'keydown', onHeadKeydown);
  on(tbody, 'click', onBodyClick);
  on(tbody, 'keydown', onBodyKeydown);
  if (resizeCfg || reorderCfg) on(thead, 'pointerdown', onHeadPointerDown);
  if (resizeCfg) {
    on(thead, 'dblclick', (e) => {
      const handle = e.target.closest('.lk-datagrid__resizer');
      const c = handle && columns.find((x) => x._id === handle.closest('th')?.dataset.col);
      if (c) { e.preventDefault(); autoFit(c); }
    });
    on(thead, 'focusin', (e) => {
      const handle = e.target.closest('.lk-datagrid__resizer');
      const c = handle && columns.find((x) => x._id === handle.closest('th')?.dataset.col);
      if (c) updateResizer(c);
    });
    on(thead, 'focusout', (e) => {
      if (kbSession && e.target === kbSession.handle) commitKb();
    });
  }
  if (rowCfg) {
    on(tbody, 'pointerdown', onBodyPointerDown);
    on(tbody, 'keydown', onRowKeydown);
    on(tbody, 'focusin', (e) => {
      const g = e.target.closest?.('.lk-datagrid__grip');
      const tr = g && g.closest('tr.lk-datagrid__row');
      if (tr) gripIndex = Number(tr.dataset.index) || 0;
    });
    on(tbody, 'focusout', (e) => {
      if (kbRow && !kbRow.moving && e.target === kbRow.grip) cancelKbRow(false);
    });
  }

  // --- Column resize ----------------------------------------------------------------------------------------

  // Public copy of a column definition (what events and `grid.columns` expose)
  function pub(c) {
    const { _id, _kind, _auto, _width, ...rest } = c;
    if (_width != null) rest.width = Math.round(_width);
    return rest;
  }

  const isRtl = () => getComputedStyle(root).direction === 'rtl';
  const colOf = (th) => columns.find((x) => x._id === th?.dataset.col) || null;
  const minOf = (c) => { const v = toPx(c.minWidth); return v != null ? v : resizeCfg.minWidth; };
  const maxOf = (c) => { const v = toPx(c.maxWidth); return v != null ? v : resizeCfg.maxWidth; };

  function announce(text) {
    liveEl.textContent = '';
    liveEl.textContent = text;
  }

  // Current pixel width: the pinned one, else what is rendered
  function colWidth(c) {
    if (c._width != null) return c._width;
    const w = headerCache.get(c._id)?.th.getBoundingClientRect().width || 0;
    return w || toPx(c.width) || DEFAULT_COL_PX;
  }

  // Pin every visible column to its rendered pixel width and switch to a fixed table layout, so
  // header and body stay aligned while a column changes. Done lazily on the first resize.
  function freeze() {
    if (frozen || !resizeCfg) return;
    const vis = visibleColumns();
    const measured = vis.map((c) => Math.round(headerCache.get(c._id)?.th.getBoundingClientRect().width || 0));
    frozen = true;
    vis.forEach((c, i) => { if (c._width == null) c._width = measured[i] || toPx(c.width) || DEFAULT_COL_PX; });
    tableEl.classList.add('lk-datagrid__table--fixed');
    renderColgroup();
  }

  function unfreeze() {
    frozen = false;
    columns.forEach((c) => { delete c._width; });
    tableEl.classList.remove('lk-datagrid__table--fixed');
    tableEl.style.width = '';
  }

  function applyTableWidth() {
    if (!frozen) return;
    if (resizeCfg.mode === 'fit') { tableEl.style.width = ''; return; }
    tableEl.style.width = `${visibleColumns().reduce((sum, c) => sum + (c._width || 0), 0)}px`;
  }

  function updateResizer(c) {
    const r = headerCache.get(c._id)?.resizer;
    if (!r) return;
    const w = Math.round(colWidth(c));
    const mx = maxOf(c);
    r.setAttribute('aria-valuenow', String(w));
    r.setAttribute('aria-valuemin', String(Math.round(minOf(c))));
    r.setAttribute('aria-valuemax', String(Number.isFinite(mx) ? Math.round(mx) : Math.max(w, Math.round(contentEl.clientWidth) || w)));
    r.setAttribute('aria-label', tx.t('resize.label', { column: colLabel(c) }));
  }

  function nextResizable(c) {
    const v = visibleColumns();
    for (let i = v.indexOf(c) + 1; i < v.length; i++) if (isResizable(v[i])) return v[i];
    return null;
  }

  function updateHandles() {
    if (!resizeCfg) return;
    visibleColumns().forEach((c) => {
      const r = headerCache.get(c._id)?.resizer;
      if (!r) return;
      r.hidden = resizeCfg.mode === 'fit' && !nextResizable(c); // nothing to take width from
      updateResizer(c);
    });
  }

  function setColWidth(c, w) {
    c._width = w;
    const col = colEls.get(c._id);
    if (col) col.style.width = `${w}px`;
    updateResizer(c);
  }

  // Widths for a target width of `c`; in 'fit' mode the neighbour `n` gives / takes the difference
  function resolveWidths(s, target) {
    const startC = s.w0;
    let lo = minOf(s.c) - startC;
    let hi = maxOf(s.c) - startC;
    if (s.n) {
      lo = Math.max(lo, s.nw0 - maxOf(s.n));
      hi = Math.min(hi, s.nw0 - minOf(s.n));
    }
    const delta = Math.max(Math.min(lo, hi), Math.min(hi, target - startC));
    return { w: Math.round(startC + delta), nw: s.n ? Math.round(s.nw0 - delta) : null };
  }

  function applyResize(s, target) {
    const r = resolveWidths(s, target);
    setColWidth(s.c, r.w);
    if (s.n) setColWidth(s.n, r.nw);
    applyTableWidth();
    s.width = r.w;
  }

  function restoreWidths(s) {
    setColWidth(s.c, s.w0);
    if (s.n) setColWidth(s.n, s.nw0);
    applyTableWidth();
    s.width = s.w0;
  }

  // The state that exists once the guard allowed the resize: widths are pinned, the neighbour is known
  function armResize(s) {
    freeze();
    s.allowed = true;
    s.w0 = colWidth(s.c);
    s.n = resizeCfg.mode === 'fit' ? nextResizable(s.c) : null;
    s.nw0 = s.n ? colWidth(s.n) : 0;
  }

  function emitResize(c, width, source) {
    if (typeof options.onColumnResize === 'function') {
      options.onColumnResize({ column: pub(c), width, source, grid: api, component: api });
    }
    savePersist();
  }

  function startResize(e, handle) {
    const c = colOf(handle.closest('th'));
    if (!c || dragCleanup) return;
    e.preventDefault();
    e.stopPropagation();
    const s = {
      c, handle, id: e.pointerId, x0: e.clientX, x: e.clientX, w0: colWidth(c), width: colWidth(c),
      dir: isRtl() ? -1 : 1, allowed: false, released: false, done: false, n: null, nw0: 0,
    };
    let untrack = null;
    const end = () => {
      s.done = true;
      untrack?.();
      root.classList.remove('lk-datagrid--resizing');
      handle.classList.remove('lk-datagrid__resizer--active');
      try { handle.releasePointerCapture(s.id); } catch (err) { /* not captured */ }
      dragCleanup = null;
    };
    const finish = (commit) => {
      if (s.done) return;
      if (!commit) restoreWidths(s);
      end();
      if (commit && Math.round(s.width) !== Math.round(s.w0)) emitResize(s.c, Math.round(s.width), 'pointer');
    };
    untrack = trackPointer(s, {
      move(ev) { s.x = ev.clientX; if (s.allowed && !s.done) applyResize(s, s.w0 + (s.x - s.x0) * s.dir); },
      up() { s.released = true; if (s.allowed) finish(true); },
      cancel() { if (s.allowed) finish(false); else end(); },
    });
    dragCleanup = () => { if (!s.done) { if (s.allowed) restoreWidths(s); end(); } };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    handle.classList.add('lk-datagrid__resizer--active');

    ask('columnResize', { column: pub(c), width: s.w0, source: 'pointer' }, () => {
      if (s.done) return;
      armResize(s);
      root.classList.add('lk-datagrid--resizing');
      applyResize(s, s.w0 + (s.x - s.x0) * s.dir);
      if (s.released) finish(true);
    }, () => { if (!s.done) end(); });
  }

  // Width the column needs for its widest content (header included)
  function measureColumn(c) {
    const idx = visibleColumns().indexOf(c);
    const col = colEls.get(c._id);
    if (idx < 0 || !col) return colWidth(c);
    const old = colWidth(c);
    const prevTable = tableEl.style.width;
    root.classList.add('lk-datagrid--measuring');
    col.style.width = '1px';
    if (prevTable) tableEl.style.width = `${Math.max(1, parseFloat(prevTable) - old + 1)}px`;
    let max = 0;
    [headRow, ...Array.from(tbody.rows)].forEach((tr) => {
      const cell = tr.cells[idx];
      if (cell && cell.colSpan === 1) max = Math.max(max, cell.scrollWidth);
    });
    root.classList.remove('lk-datagrid--measuring');
    col.style.width = `${old}px`;
    tableEl.style.width = prevTable;
    return Math.ceil(max);
  }

  // Double-click on the handle: fit the column to its content
  function autoFit(c) {
    ask('columnResize', { column: pub(c), width: colWidth(c), source: 'autofit' }, () => {
      const s = { c, id: 0 };
      armResize(s);
      applyResize(s, measureColumn(c));
      if (Math.round(s.width) !== Math.round(s.w0)) emitResize(c, Math.round(s.width), 'autofit');
    });
  }

  // Keyboard: Left/Right (Shift = x10) resize live, Enter / blur commits, Escape reverts
  function keyResize(c, handle, delta) {
    let s = kbSession;
    if (s && s.c !== c) commitKb();
    if (!kbSession) {
      s = { c, handle, delta: 0, allowed: false, asked: false, dead: false, w0: colWidth(c), width: colWidth(c), n: null, nw0: 0 };
      kbSession = s;
    }
    s = kbSession;
    s.delta += delta;
    if (!s.asked) {
      s.asked = true;
      ask('columnResize', { column: pub(c), width: s.w0, source: 'keyboard' }, () => {
        if (s.dead) return;
        armResize(s);
        applyResize(s, s.w0 + s.delta);
      }, () => { s.dead = true; if (kbSession === s) kbSession = null; });
    } else if (s.allowed) {
      applyResize(s, s.w0 + s.delta);
    }
  }

  function commitKb() {
    const s = kbSession;
    if (!s) return;
    kbSession = null;
    s.dead = true;
    if (s.allowed && Math.round(s.width) !== Math.round(s.w0)) emitResize(s.c, Math.round(s.width), 'keyboard');
  }

  function cancelKb() {
    const s = kbSession;
    if (!s) return;
    kbSession = null;
    s.dead = true;
    if (s.allowed) restoreWidths(s);
  }

  function resizerKeydown(e, handle) {
    const c = colOf(handle.closest('th'));
    if (!c) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = (e.key === 'ArrowRight' ? 1 : -1) * (isRtl() ? -1 : 1);
      keyResize(c, handle, dir * (e.shiftKey ? 100 : 10));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitKb();
    } else if (e.key === 'Escape' && kbSession) {
      e.preventDefault();
      e.stopPropagation();
      cancelKb();
    }
  }

  // --- Drag plumbing (column reorder, row reorder, resize) ------------------------------------------------------

  // Document-level pointer listeners for one drag session; returns the remover
  function trackPointer(s, h) {
    const move = (e) => { if (e.pointerId === s.id) h.move(e); };
    const up = (e) => { if (e.pointerId === s.id) h.up(e); };
    const cancel = (e) => { if (e.pointerId === s.id) h.cancel(e); };
    const key = (e) => { if (e.key === 'Escape') h.cancel(e); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', key);
    };
  }

  function makeGhost(cls, rect) {
    const g = el('div', `lk-datagrid__ghost ${cls}`);
    if (options.dense) g.classList.add('lk-datagrid__ghost--dense');
    g.style.width = `${rect.width}px`;
    g.style.height = `${rect.height}px`;
    g.style.left = `${rect.left}px`;
    g.style.top = `${rect.top}px`;
    document.body.appendChild(g);
    ghosts.add(g);
    return g;
  }

  function dropGhost(g) {
    if (!g) return;
    g.remove();
    ghosts.delete(g);
  }

  // A vetoed / cancelled drag: the ghost glides back to where the item came from
  function flyBack(g, rect) {
    if (!g) return;
    if (prefersReducedMotion() || typeof g.animate !== 'function') { dropGhost(g); return; }
    const from = g.getBoundingClientRect();
    const done = () => dropGhost(g);
    try {
      const a = g.animate(
        [{ transform: 'translate(0, 0)' }, { transform: `translate(${rect.left - from.left}px, ${rect.top - from.top}px)` }],
        { duration: 180, easing: 'ease-out' },
      );
      a.onfinish = done;
      a.oncancel = done;
    } catch (err) { done(); return; }
    setTimeout(done, 400);
  }

  // Scroll the grid while the pointer rests near its edge. `pos` = { x, y }; `onScroll` re-targets the drop.
  function startAutoScroll(axis, pos, onScroll) {
    let raf = 0;
    let alive = true;
    const zone = 40;
    const speed = (d) => Math.max(2, Math.min(24, Math.round(d / 2)));
    const tick = () => {
      if (!alive) return;
      const r = contentEl.getBoundingClientRect();
      let moved = false;
      if (axis === 'x') {
        const before = contentEl.scrollLeft;
        if (pos.x < r.left + zone) contentEl.scrollLeft -= speed(r.left + zone - pos.x);
        else if (pos.x > r.right - zone) contentEl.scrollLeft += speed(pos.x - (r.right - zone));
        moved = contentEl.scrollLeft !== before;
      } else if (contentEl.scrollHeight > contentEl.clientHeight + 1) {
        const before = contentEl.scrollTop;
        if (pos.y < r.top + zone) contentEl.scrollTop -= speed(r.top + zone - pos.y);
        else if (pos.y > r.bottom - zone) contentEl.scrollTop += speed(pos.y - (r.bottom - zone));
        moved = contentEl.scrollTop !== before;
      } else {
        const vh = window.innerHeight;
        if (pos.y < zone) { window.scrollBy(0, -speed(zone - pos.y)); moved = true; }
        else if (pos.y > vh - zone) { window.scrollBy(0, speed(pos.y - (vh - zone))); moved = true; }
      }
      if (moved) onScroll();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }

  function swallowNextClick() {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 80);
  }

  // --- Column reorder -------------------------------------------------------------------------------------------

  // New visible order when `c` takes slot `b` among the movable columns; fixed columns keep their place
  function planMove(c, b) {
    const vis = visibleColumns();
    const movable = vis.filter(isReorderable);
    const a = movable.indexOf(c);
    const next = movable.slice();
    next.splice(a, 1);
    next.splice(b, 0, c);
    let k = 0;
    return vis.map((col) => (isReorderable(col) ? next[k++] : col));
  }

  function applyVisibleOrder(newVisible) {
    const slots = [];
    columns.forEach((c, i) => { if (!c.hidden) slots.push(i); });
    const next = columns.slice();
    slots.forEach((idx, k) => { next[idx] = newVisible[k]; });
    columns = next;
    renderColgroup();
    renderHeader();
    renderFilterRow();
    renderBody(false);
  }

  function emitReorder(c, from, to, source) {
    if (typeof options.onColumnReorder === 'function') {
      options.onColumnReorder({ column: pub(c), from, to, columns: api.columns, source, grid: api, component: api });
    }
    savePersist();
  }

  function keyMoveColumn(c, dir) {
    const movable = visibleColumns().filter(isReorderable);
    const a = movable.indexOf(c);
    const b = a + dir;
    if (a < 0 || b < 0 || b >= movable.length) return;
    const plan = planMove(c, b);
    const from = visibleColumns().indexOf(c);
    const to = plan.indexOf(c);
    ask('columnReorder', { column: pub(c), from, to, source: 'keyboard' }, () => {
      applyVisibleOrder(plan);
      headerCache.get(c._id)?.th.focus();
      announce(tx.t('reorder.moved', { column: colLabel(c), to: b + 1, total: movable.length }));
      emitReorder(c, from, to, 'keyboard');
    });
  }

  function startColumnDrag(e) {
    if (!reorderCfg || dragCleanup) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, input, a, select, textarea, .lk-datagrid__resizer')) return;
    const th = e.target.closest('th');
    if (!th || !headRow.contains(th)) return;
    const c = colOf(th);
    if (!c || !isReorderable(c)) return;

    const s = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      active: false, ghost: null, ind: null, stopScroll: null, rect: null, a: 0, b: 0,
    };
    let untrack = null;

    const update = () => {
      s.ghost.style.left = `${s.rect.left + (s.x - s.x0)}px`;
      s.ghost.style.top = `${s.rect.top + (s.y - s.y0)}px`;
      const movable = visibleColumns().filter(isReorderable);
      const rects = movable.map((m) => headerCache.get(m._id).th.getBoundingClientRect());
      const rtl = isRtl();
      let j = 0;
      rects.forEach((r, k) => {
        const center = r.left + r.width / 2;
        if (rtl ? s.x < center : s.x > center) j = k + 1;
      });
      s.a = movable.indexOf(c);
      s.b = j > s.a ? j - 1 : j;
      if (s.b === s.a || !rects.length) { s.ind.hidden = true; return; }
      const edge = j < rects.length ? (rtl ? rects[j].right : rects[j].left) : (rtl ? rects[rects.length - 1].left : rects[rects.length - 1].right);
      const cr = contentEl.getBoundingClientRect();
      s.ind.hidden = false;
      s.ind.style.left = `${edge - cr.left + contentEl.scrollLeft - 1}px`;
      s.ind.style.top = `${contentEl.scrollTop}px`;
      s.ind.style.height = `${contentEl.clientHeight}px`;
    };

    const begin = () => {
      s.active = true;
      s.rect = th.getBoundingClientRect();
      s.ghost = makeGhost('lk-datagrid__ghost--col', s.rect);
      s.ghost.textContent = th.querySelector('.lk-datagrid__th-label')?.textContent || th.textContent;
      th.classList.add('lk-datagrid__th--dragging');
      root.classList.add('lk-datagrid--dragging');
      s.ind = el('div', 'lk-datagrid__drop lk-datagrid__drop--col');
      s.ind.hidden = true;
      contentEl.appendChild(s.ind);
      s.stopScroll = startAutoScroll('x', s, update);
    };

    const end = () => {
      untrack?.();
      s.stopScroll?.();
      s.ind?.remove();
      th.classList.remove('lk-datagrid__th--dragging');
      root.classList.remove('lk-datagrid--dragging');
      dragCleanup = null;
    };

    untrack = trackPointer(s, {
      move(ev) {
        s.x = ev.clientX;
        s.y = ev.clientY;
        if (!s.active) {
          if (Math.hypot(s.x - s.x0, s.y - s.y0) < 4) return;
          begin();
        }
        update();
      },
      up() {
        if (!s.active) { end(); return; }
        update();
        swallowNextClick();
        const { a, b, ghost } = s;
        end();
        if (b === a) { flyBack(ghost, th.getBoundingClientRect()); return; }
        const plan = planMove(c, b);
        const from = visibleColumns().indexOf(c);
        const to = plan.indexOf(c);
        ask('columnReorder', { column: pub(c), from, to, source: 'pointer' }, () => {
          dropGhost(ghost);
          applyVisibleOrder(plan);
          emitReorder(c, from, to, 'pointer');
        }, () => flyBack(ghost, th.getBoundingClientRect()));
      },
      cancel() {
        if (s.active) { swallowNextClick(); flyBack(s.ghost, th.getBoundingClientRect()); }
        end();
      },
    });
    dragCleanup = () => { dropGhost(s.ghost); end(); };
  }

  function onHeadPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const handle = e.target.closest('.lk-datagrid__resizer');
    if (handle && headRow.contains(handle)) { if (resizeCfg) startResize(e, handle); return; }
    startColumnDrag(e);
  }

  // --- Row reorder ------------------------------------------------------------------------------------------------

  // Only meaningful while the visible order IS the data order: not sorted, not filtered, not editing
  function rowReorderOn() {
    return !!rowCfg && !currentSort().length && !ds.filter && !searchTerm && !editState;
  }

  const dataRows = () => Array.from(tbody.querySelectorAll('tr.lk-datagrid__row'));

  function focusRowControl(key) {
    const tr = dataRows().find((t) => rowKey(ds.view[Number(t.dataset.index)]) === key);
    if (!tr) return;
    const g = tr.querySelector('.lk-datagrid__grip');
    (g || tr).focus();
  }

  // Ask, then move `row` to the position of the row currently at view index `toView`
  function requestRowMove(row, toView, source, o = {}) {
    const from = ds.items.indexOf(row);
    const to = ds.items.indexOf(ds.view[toView]);
    if (from < 0 || to < 0 || from === to) { o.onVeto?.(); return; }
    const key = rowKey(row);
    ask('rowReorder', { row, from, to, source }, () => {
      clearTimeout(movedTimer);
      movedKey = key;
      movedTimer = setTimeout(() => { movedKey = undefined; }, 900);
      o.onMoved?.();
      ds.move(from, to);
      if (rowCfg.field) {
        ds.items.forEach((r, i) => setField(r, rowCfg.field, i + 1));
        renderBody(false);
      }
      announce(tx.t('rowReorder.moved', { to: to + 1, total: ds.items.length }));
      if (o.refocus) focusRowControl(key);
      if (typeof options.onRowReorder === 'function') {
        options.onRowReorder({ row, from, to, rows: ds.items.slice(), source, grid: api, component: api });
      }
    }, o.onVeto);
  }

  function onBodyPointerDown(e) {
    if (!rowCfg || dragCleanup) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const tr = e.target.closest('tr.lk-datagrid__row');
    if (!tr || !tbody.contains(tr) || tr.classList.contains('lk-datagrid__row--editing')) return;
    const grip = e.target.closest('.lk-datagrid__grip');
    if (grip) {
      if (!rowReorderOn()) return;
    } else if (rowCfg.handle || !rowReorderOn()
      || e.target.closest('a, button, input, select, textarea, label, .lk-datagrid__cmd')) {
      return;
    }
    const index = Number(tr.dataset.index);
    const row = ds.view[index];
    if (!row) return;

    const s = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      active: false, ghost: null, ind: null, stopScroll: null, rect: null, k: index, t: index,
    };
    let untrack = null;

    const update = () => {
      s.ghost.style.top = `${s.rect.top + (s.y - s.y0)}px`;
      const trs = dataRows();
      const rects = trs.map((t) => t.getBoundingClientRect());
      let k = 0;
      rects.forEach((r, i) => { if (s.y > r.top + r.height / 2) k = i + 1; });
      s.k = k;
      s.t = k > index ? k - 1 : k;
      if (s.t === index || !rects.length) { s.ind.hidden = true; return; }
      const edge = k < rects.length ? rects[k].top : rects[rects.length - 1].bottom;
      const cr = contentEl.getBoundingClientRect();
      s.ind.hidden = false;
      s.ind.style.top = `${edge - cr.top + contentEl.scrollTop - 1}px`;
      s.ind.style.width = `${tableEl.offsetWidth}px`;
    };

    const begin = () => {
      s.active = true;
      s.rect = tr.getBoundingClientRect();
      s.ghost = makeGhost('lk-datagrid__ghost--row', s.rect);
      const gt = el('table', `lk-table lk-datagrid__ghost-table${options.dense ? ' lk-table--dense' : ''}`);
      const gb = el('tbody');
      const clone = tr.cloneNode(true);
      clone.removeAttribute('tabindex');
      Array.from(tr.cells).forEach((td, i) => { if (clone.cells[i]) clone.cells[i].style.width = `${td.getBoundingClientRect().width}px`; });
      gb.appendChild(clone);
      gt.appendChild(gb);
      gt.style.width = `${s.rect.width}px`;
      s.ghost.appendChild(gt);
      tr.classList.add('lk-datagrid__row--dragging');
      root.classList.add('lk-datagrid--dragging');
      s.ind = el('div', 'lk-datagrid__drop lk-datagrid__drop--row');
      s.ind.hidden = true;
      contentEl.appendChild(s.ind);
      s.stopScroll = startAutoScroll('y', s, update);
    };

    const end = () => {
      untrack?.();
      s.stopScroll?.();
      s.ind?.remove();
      tr.classList.remove('lk-datagrid__row--dragging');
      root.classList.remove('lk-datagrid--dragging');
      dragCleanup = null;
    };

    untrack = trackPointer(s, {
      move(ev) {
        s.x = ev.clientX;
        s.y = ev.clientY;
        if (!s.active) {
          if (Math.hypot(s.x - s.x0, s.y - s.y0) < 4) return;
          begin();
        }
        update();
      },
      up() {
        if (!s.active) { end(); return; }
        update();
        swallowNextClick();
        const { t, ghost } = s;
        end();
        const back = () => flyBack(ghost, tr.isConnected ? tr.getBoundingClientRect() : s.rect);
        if (t === index) { back(); return; }
        // The ghost stays until the guard decided (a pending Promise guard keeps it on screen)
        requestRowMove(row, t, 'pointer', { onVeto: back, onMoved: () => dropGhost(ghost) });
      },
      cancel() {
        if (s.active) { swallowNextClick(); flyBack(s.ghost, tr.getBoundingClientRect()); }
        end();
      },
    });
    dragCleanup = () => { dropGhost(s.ghost); end(); };
  }

  // Keyboard: focus the grip, Space picks the row up, Up/Down move it, Space drops, Escape cancels
  function onRowKeydown(e) {
    const grip = e.target.closest?.('.lk-datagrid__grip');
    if (grip && tbody.contains(grip)) {
      const tr = grip.closest('tr.lk-datagrid__row');
      const index = Number(tr.dataset.index);
      if (kbRow) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveKbRow(e.key === 'ArrowUp' ? -1 : 1); }
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); dropKbRow(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelKbRow(true); }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!rowReorderOn()) { announce(tx.t('rowReorder.disabled')); return; }
        pickUpRow(tr, index, grip);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const grips = dataRows().map((t) => t.querySelector('.lk-datagrid__grip'));
        let next = index + (e.key === 'ArrowDown' ? 1 : (e.key === 'ArrowUp' ? -1 : 0));
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = grips.length - 1;
        next = Math.max(0, Math.min(grips.length - 1, next));
        grips.forEach((g, i) => { if (g) g.tabIndex = i === next ? 0 : -1; });
        gripIndex = next;
        grips[next]?.focus();
      }
      return;
    }
    // Whole-row mode: Alt+Up / Alt+Down on the focused row
    if (rowCfg && !rowCfg.handle && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const tr = e.target.closest('tr.lk-datagrid__row');
      if (!tr || e.target !== tr || !rowReorderOn()) return;
      e.preventDefault();
      const index = Number(tr.dataset.index);
      const to = index + (e.key === 'ArrowUp' ? -1 : 1);
      const row = ds.view[index];
      if (row && to >= 0 && to < ds.view.length) requestRowMove(row, to, 'keyboard', { refocus: true });
    }
  }

  function pickUpRow(tr, index, grip) {
    kbRow = { row: ds.view[index], from: index, cur: index, tr, grip, moving: false };
    tr.classList.add('lk-datagrid__row--picked');
    grip.setAttribute('aria-pressed', 'true');
    announce(tx.t('rowReorder.pickedUp', { n: ds.items.indexOf(kbRow.row) + 1 }));
  }

  function moveKbRow(dir) {
    const s = kbRow;
    const trs = dataRows();
    const next = s.cur + dir;
    if (next < 0 || next >= trs.length) return;
    s.moving = true;
    const ref = trs[next];
    tbody.insertBefore(s.tr, dir > 0 ? ref.nextSibling : ref);
    s.cur = next;
    s.grip.focus();
    s.moving = false;
    s.tr.scrollIntoView?.({ block: 'nearest' });
    announce(tx.t('rowReorder.position', { to: ds.items.indexOf(ds.view[next]) + 1, total: ds.items.length }));
  }

  function dropKbRow() {
    const s = kbRow;
    kbRow = null;
    const key = rowKey(s.row);
    if (s.cur === s.from) { renderBody(false); focusRowControl(key); return; }
    requestRowMove(s.row, s.cur, 'keyboard', {
      refocus: true,
      onVeto: () => { renderBody(false); focusRowControl(key); },
    });
  }

  function cancelKbRow(refocus) {
    const s = kbRow;
    if (!s) return;
    kbRow = null;
    renderBody(false);
    announce(tx.t('rowReorder.cancelled'));
    if (refocus) focusRowControl(rowKey(s.row));
  }

  // --- Column state (widths, order, visibility) ---------------------------------------------------------------------

  let store = null;
  if (persistCfg && persistCfg.key) {
    try {
      store = lkStorage({ namespace: persistCfg.namespace || 'look-grid', encrypted: false, useSession: !!persistCfg.session });
    } catch (err) { store = null; }
  }

  const stateColumns = () => columns.filter((c) => c._kind === 'data' && c.field);

  function getColumnState() {
    return stateColumns().map((c, i) => {
      const w = c._width != null ? c._width : toPx(c.width);
      return { field: c.field, width: w != null ? Math.round(w) : null, order: i, visible: !c.hidden };
    });
  }

  function savePersist() {
    if (!store || restoring || destroyed) return;
    try {
      Promise.resolve(store.set(persistCfg.key, getColumnState())).catch(() => {});
    } catch (err) { /* storage unavailable */ }
  }

  // Apply a saved state: unknown fields are ignored, columns missing from it keep their place
  function applyColumnState(state) {
    if (!Array.isArray(state)) return;
    const byField = new Map(state.filter((s) => s && s.field != null).map((s) => [String(s.field), s]));
    const fielded = stateColumns();
    const slots = [];
    columns.forEach((c, i) => { if (fielded.includes(c)) slots.push(i); });
    const ordered = fielded
      .map((c, i) => ({ c, o: Number.isFinite(byField.get(String(c.field))?.order) ? byField.get(String(c.field)).order : i, i }))
      .sort((a, b) => a.o - b.o || a.i - b.i);
    const next = columns.slice();
    slots.forEach((idx, k) => { next[idx] = ordered[k].c; });

    const widths = [];
    fielded.forEach((c) => {
      const s = byField.get(String(c.field));
      if (!s) return;
      if (typeof s.visible === 'boolean') c.hidden = !s.visible;
      const w = Number(s.width);
      if (Number.isFinite(w) && w > 0) widths.push([c, w]);
    });
    if (!next.some((c) => !c.hidden && c._kind === 'data')) {
      const first = next.find((c) => c._kind === 'data');
      if (first) first.hidden = false;
    }
    columns = next;
    if (widths.length) {
      freeze();
      widths.forEach(([c, w]) => { c._width = resizeCfg ? Math.max(minOf(c), Math.min(maxOf(c), Math.round(w))) : Math.round(w); });
    }
    renderColgroup();
    renderHeader();
    renderFilterRow();
    renderBody(false);
  }

  function resetColumns() {
    if (editState) discardEdit(true);
    if (frozen) unfreeze();
    else columns.forEach((c) => { delete c._width; });
    if (initialCols) {
      columns = initialCols.order.slice();
      columns.forEach((c) => { c.hidden = initialCols.hidden.get(c); });
    }
    renderColgroup();
    renderHeader();
    renderFilterRow();
    renderBody(false);
    if (store) { try { store.remove(persistCfg.key); } catch (err) { /* ignore */ } }
  }

  // --- Delete command ------------------------------------------------------------------------------------

  // beforeDelete runs first (veto / take over, e.g. with your own confirmation), then the confirm dialog
  function removeRow(row, source = 'button') {
    const doRemove = () => {
      const key = rowKey(row);
      selected.delete(key);
      if (editState && editState.key === key) discardEdit(true);
      ds.remove((r) => r === row || rowKey(r) === key).catch((err) => {
        if (typeof options.onError === 'function') options.onError({ error: err, action: 'delete', grid: api, component: api });
      });
    };
    ask('delete', { row, key: rowKey(row), source }, () => {
      const confirmText = confirmDeleteOf();
      if (!confirmText) { doRemove(); return; }
      lkDialog({
        title: tx.tf('common.confirm'),
        content: confirmText,
        confirmText: tx.tf('common.delete'),
        cancelText: tx.tf('common.cancel'),
        destroyOnClose: true,
        onConfirm: doRemove,
      });
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
    columns: { get: () => columns.filter((c) => !c._auto).map(pub), enumerable: true },
    selectedRows: { get: () => Array.from(selected.values()), enumerable: true },
    selectedKeys: { get: () => Array.from(selected.keys()), enumerable: true },
    filters: { get: () => JSON.parse(JSON.stringify(columnFilters)), enumerable: true },
    isEditing: { get: () => !!editState, enumerable: true },
    editingRow: { get: () => editState?.row ?? null, enumerable: true },
    table: { get: () => tableEl, enumerable: true },
    text: { get: () => tx.get(), set: (v) => tx.set(v), enumerable: true },
  });

  // Re-apply every localized text to what is already rendered (locale / dictionary / `text` change).
  // Selection, filters, sort, paging and an edit in progress are kept; an open column menu closes.
  function refreshTexts() {
    if (destroyed) return;
    if (searchInput) {
      searchInput.placeholder = tx.t('search.placeholder');
      searchInput.setAttribute('aria-label', tx.tf('common.search'));
    }
    toolbarEl.querySelectorAll('[data-i18n]').forEach((btn) => {
      const last = btn.lastChild;
      if (last && last.nodeType === Node.TEXT_NODE) last.textContent = tx.t(btn.dataset.i18n);
    });
    loadingEl.title = tx.tf('common.loading');
    hintEl.textContent = tx.t('reorder.hint');
    if (pagerNav) pagerNav.setAttribute('aria-label', tx.t('pager.label'));
    if (pageSizeLabel) pageSizeLabel.textContent = tx.t('pager.pageSize');
    destroyHeaderCache();
    renderHeader();
    renderFilterRow();
    renderBody(false);
    renderPager();
  }

  api.refresh = () => { renderBody(false); renderPager(); return api; };
  api.reload = () => (ds.canRead ? ds.load() : Promise.resolve(ds.view.slice()));

  api.select = (keysOrRows) => {
    const list = Array.isArray(keysOrRows) ? keysOrRows : [keysOrRows];
    requestSelection((next) => {
      if (selectMode === 'single' && !hasSelectColumn()) next.clear();
      list.forEach((k) => {
        const row = isObject(k) ? k : (ds.items.find((r) => rowKey(r) === k) || ds.view.find((r) => rowKey(r) === k));
        if (row) next.set(rowKey(row), row);
      });
    }, 'api', {});
    return api;
  };

  api.clearSelection = () => {
    requestSelection((next) => next.clear(), 'api', {});
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
    savePersist();
    return api;
  }
  api.showColumn = (field) => setColumnHidden(field, false);
  api.hideColumn = (field) => setColumnHidden(field, true);

  // Column state: [{ field, width, order, visible }] — widths in px (null = not set), order = position among data columns
  api.getColumnState = () => getColumnState();
  api.setColumnState = (state) => {
    restoring = true;
    try { applyColumnState(state); } finally { restoring = false; }
    savePersist();
    return api;
  };
  api.resetColumns = () => { resetColumns(); return api; };

  api.setColumns = (defs) => {
    if (editState) discardEdit(true);
    destroyHeaderCache();
    buildColumns(defs);
    renderColgroup();
    renderHeader();
    renderFilterRow();
    renderBody(false);
    return api;
  };

  api.search = (term) => {
    const next = String(term ?? '').trim();
    if (searchInput) searchInput.value = next;
    changeFilters({ search: next }, 'api');
    return api;
  };

  // Programmatic column filter: filter('salary', { op: 'gte', value: 5000 }) — null clears
  api.filter = (field, rule) => {
    const filters = { ...columnFilters };
    if (rule == null || rule.value === '' || rule.value == null) delete filters[field];
    else filters[field] = { ...rule };
    changeFilters({ filters }, 'api');
    return api;
  };
  api.clearFilters = () => {
    changeFilters({ filters: {}, search: '' }, 'api');
    return api;
  };
  api.sort = (field, dir) => { sortColumn(field, dir || null, 'api'); return api; };

  api.editRow = (keyOrRow) => {
    const row = isObject(keyOrRow) ? keyOrRow
      : (ds.view.find((r) => rowKey(r) === keyOrRow) || ds.items.find((r) => rowKey(r) === keyOrRow));
    if (row) startEdit(row, false, 'api');
    return api;
  };
  api.removeRow = (keyOrRow) => {
    const row = isObject(keyOrRow) ? keyOrRow
      : (ds.view.find((r) => rowKey(r) === keyOrRow) || ds.items.find((r) => rowKey(r) === keyOrRow));
    if (row) removeRow(row, 'api');
    return api;
  };
  api.addRow = (defaults = {}) => { startEdit(defaults, true, 'api'); return api; };
  api.saveRow = () => saveEdit('api');
  api.cancelEdit = () => { cancelEdit(false, 'api'); return api; };

  api.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    tx.destroy();
    dragCleanup?.();
    kbSession = null;
    kbRow = null;
    clearTimeout(movedTimer);
    ghosts.forEach((g) => g.remove());
    ghosts.clear();
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
    root.classList.remove('lk-datagrid--dense', 'lk-datagrid--scrollable', 'lk-datagrid--loading',
      'lk-datagrid--resizing', 'lk-datagrid--dragging', 'lk-datagrid--measuring', ...featureClasses);
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

  // Saved widths / order / visibility (lkStorage is async: applied as soon as it resolves; `grid.ready` waits for it)
  api.ready = store
    ? Promise.resolve().then(() => store.get(persistCfg.key, null)).then((state) => {
      if (destroyed || !Array.isArray(state)) return;
      restoring = true;
      try { applyColumnState(state); } finally { restoring = false; }
    }).catch(() => {})
    : Promise.resolve();

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
