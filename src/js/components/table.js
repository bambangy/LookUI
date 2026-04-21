// Table component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qsa } from '../core/index.js';

/**
 * Enhance a table with sorting behavior.
 * @param {Element|string} el — .lk-table element
 * @param {Object} [opts]
 * @param {boolean} [opts.sortable]  — enable column header click-to-sort (default true)
 * @param {Function} [opts.onSort]   — callback({ column, order })
 * @returns {Object}
 */
export function lkTable(el, opts = {}) {
  const node = resolveEl(el, 'lkTable');
  node.classList.add('lk-table');

  const sortable = opts.sortable !== false;
  let sortCol    = null;
  let sortOrder  = 'asc';

  const headers = qsa('thead th', node);
  const tbody   = node.querySelector('tbody');

  function compareValues(a, b) {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  }

  function sortByColumn(colIndex) {
    if (sortCol === colIndex) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = colIndex;
      sortOrder = 'asc';
    }

    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
      const cellA = a.cells[colIndex]?.textContent.trim() ?? '';
      const cellB = b.cells[colIndex]?.textContent.trim() ?? '';
      const result = compareValues(cellA, cellB);
      return sortOrder === 'asc' ? result : -result;
    });

    rows.forEach(row => tbody.appendChild(row));

    // Update header indicators
    headers.forEach((th, i) => {
      th.removeAttribute('aria-sort');
      if (i === colIndex) {
        th.setAttribute('aria-sort', sortOrder === 'asc' ? 'ascending' : 'descending');
      }
    });

    if (opts.onSort) opts.onSort({ column: colIndex, order: sortOrder });
  }

  function onHeaderClick(e) {
    if (!sortable) return;
    const th = e.target.closest('th');
    if (!th) return;
    const idx = headers.indexOf(th);
    if (idx >= 0) sortByColumn(idx);
  }

  if (sortable) {
    headers.forEach(th => {
      th.style.cursor = 'pointer';
      th.setAttribute('role', 'columnheader');
    });
    node.querySelector('thead')?.addEventListener('click', onHeaderClick);
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
    node.querySelector('thead')?.removeEventListener('click', onHeaderClick);
    headers.forEach(th => {
      th.style.cursor = '';
      th.removeAttribute('role');
      th.removeAttribute('aria-sort');
    });
    node.classList.remove('lk-table');
  };

  return comp;
}
