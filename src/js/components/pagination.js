// Pagination component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qsa, createElement } from '../core/index.js';
import { lkIcon } from './icon.js';

/**
 * Enhance a pagination container with page navigation.
 * @param {Element|string} el — .lk-pagination container (ul)
 * @param {Object} [opts]
 * @param {number}  [opts.totalPages]   — total number of pages
 * @param {number}  [opts.page]         — current page (1-based, default 1)
 * @param {number}  [opts.maxVisible]   — max page buttons visible (default 7)
 * @param {Function} [opts.onPageChange] — callback(page)
 * @returns {Object}
 */
export function lkPagination(el, opts = {}) {
  const node = resolveEl(el, 'lkPagination');
  node.classList.add('lk-pagination');

  let totalPages = opts.totalPages ?? 1;
  let page       = opts.page ?? 1;
  const maxVis   = opts.maxVisible ?? 7;

  function buildPages() {
    node.innerHTML = '';

    // Prev button
    const prevLi = createElement('li', { class: 'lk-pagination__item' });
    const prevBtn = createElement('button', {
      class: 'lk-pagination__link' + (page <= 1 ? ' lk-pagination__link--disabled' : ''),
      type: 'button',
      'aria-label': 'Previous page',
    });
    prevBtn.appendChild(lkIcon('chevron-left', { size: 'sm' }));
    prevLi.appendChild(prevBtn);
    node.appendChild(prevLi);

    // Calculate visible range
    let startPage = Math.max(1, page - Math.floor(maxVis / 2));
    let endPage   = Math.min(totalPages, startPage + maxVis - 1);
    if (endPage - startPage + 1 < maxVis) {
      startPage = Math.max(1, endPage - maxVis + 1);
    }

    // First page + ellipsis
    if (startPage > 1) {
      appendPageBtn(1);
      if (startPage > 2) appendEllipsis();
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
      appendPageBtn(i);
    }

    // Last page + ellipsis
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) appendEllipsis();
      appendPageBtn(totalPages);
    }

    // Next button
    const nextLi = createElement('li', { class: 'lk-pagination__item' });
    const nextBtn = createElement('button', {
      class: 'lk-pagination__link' + (page >= totalPages ? ' lk-pagination__link--disabled' : ''),
      type: 'button',
      'aria-label': 'Next page',
    });
    nextBtn.appendChild(lkIcon('chevron-right', { size: 'sm' }));
    nextLi.appendChild(nextBtn);
    node.appendChild(nextLi);
  }

  function appendPageBtn(p) {
    const li  = createElement('li', { class: 'lk-pagination__item' });
    const btn = createElement('button', {
      class: 'lk-pagination__link' + (p === page ? ' lk-pagination__link--active' : ''),
      type: 'button',
      'data-page': String(p),
      'aria-label': `Page ${p}`,
      'aria-current': p === page ? 'page' : undefined,
    }, String(p));
    li.appendChild(btn);
    node.appendChild(li);
  }

  function appendEllipsis() {
    const li = createElement('li', { class: 'lk-pagination__item' });
    const span = createElement('span', { class: 'lk-pagination__ellipsis' }, '…');
    li.appendChild(span);
    node.appendChild(li);
  }

  function goTo(p) {
    p = Math.max(1, Math.min(totalPages, p));
    if (p === page) return;
    page = p;
    buildPages();
    if (opts.onPageChange) opts.onPageChange(page);
  }

  function onClick(e) {
    const btn = e.target.closest('.lk-pagination__link');
    if (!btn || btn.classList.contains('lk-pagination__link--disabled')) return;

    const label = btn.getAttribute('aria-label');
    if (label === 'Previous page') { goTo(page - 1); return; }
    if (label === 'Next page')     { goTo(page + 1); return; }

    const p = parseInt(btn.dataset.page, 10);
    if (!isNaN(p)) goTo(p);
  }

  node.addEventListener('click', onClick);
  buildPages();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    page: {
      get() { return page; },
      set(v) { goTo(v); },
      enumerable: true,
    },
    totalPages: {
      get() { return totalPages; },
      set(v) { totalPages = Math.max(1, v); page = Math.min(page, totalPages); buildPages(); },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    node.removeEventListener('click', onClick);
    node.classList.remove('lk-pagination');
  };

  return comp;
}
