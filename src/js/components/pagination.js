// Pagination component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';

const CHANGE_ANIM_MS = 280;
const POP_ANIM_MS = 220;

/**
 * Enhance a pagination container with page navigation.
 * @param {Element|string} el - .lk-pagination container (ul)
 * @param {Object} [opts]
 * @param {number} [opts.totalPages] - total number of pages
 * @param {number} [opts.page] - current page (1-based, default 1)
 * @param {number} [opts.maxVisible] - max page buttons visible (default 7)
 * @param {Function} [opts.onPageChange] - callback(page)
 * @returns {Object}
 */
export function lkPagination(el, opts = {}) {
  const node = resolveEl(el, 'lkPagination');
  node.classList.add('lk-pagination');

  let totalPages = opts.totalPages ?? 1;
  let page = opts.page ?? 1;
  const maxVis = opts.maxVisible ?? 7;

  let changeTimer = null;
  let popTimer = null;

  function clearAnimTimers() {
    if (changeTimer) {
      clearTimeout(changeTimer);
      changeTimer = null;
    }
    if (popTimer) {
      clearTimeout(popTimer);
      popTimer = null;
    }
  }

  function buildPages() {
    node.innerHTML = '';
    let itemIndex = 0;

    function appendItem(li) {
      li.style.setProperty('--lk-page-i', String(itemIndex));
      itemIndex += 1;
      node.appendChild(li);
    }

    // Prev button
    const prevLi = createElement('li', { class: 'lk-pagination__item' });
    const prevBtn = createElement('button', {
      class: 'lk-pagination__link' + (page <= 1 ? ' lk-pagination__link--disabled' : ''),
      type: 'button',
      'aria-label': 'Previous page',
    });
    prevBtn.appendChild(lkIcon('chevron-left', { size: 'sm' }));
    prevLi.appendChild(prevBtn);
    appendItem(prevLi);

    // Calculate visible range
    let startPage = Math.max(1, page - Math.floor(maxVis / 2));
    let endPage = Math.min(totalPages, startPage + maxVis - 1);
    if (endPage - startPage + 1 < maxVis) {
      startPage = Math.max(1, endPage - maxVis + 1);
    }

    // First page + ellipsis
    if (startPage > 1) {
      appendPageBtn(1, appendItem);
      if (startPage > 2) appendEllipsis(appendItem);
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i += 1) {
      appendPageBtn(i, appendItem);
    }

    // Last page + ellipsis
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) appendEllipsis(appendItem);
      appendPageBtn(totalPages, appendItem);
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
    appendItem(nextLi);
  }

  function appendPageBtn(p, appendItem) {
    const li = createElement('li', { class: 'lk-pagination__item' });
    const btn = createElement('button', {
      class: 'lk-pagination__link' + (p === page ? ' lk-pagination__link--active' : ''),
      type: 'button',
      'data-page': String(p),
      'aria-label': `Page ${p}`,
      'aria-current': p === page ? 'page' : undefined,
    }, String(p));
    li.appendChild(btn);
    appendItem(li);
  }

  function appendEllipsis(appendItem) {
    const li = createElement('li', { class: 'lk-pagination__item' });
    const span = createElement('span', { class: 'lk-pagination__ellipsis' }, '...');
    li.appendChild(span);
    appendItem(li);
  }

  function animateChange(direction) {
    node.classList.remove('lk-pagination--changing', 'lk-pagination--next', 'lk-pagination--prev');
    // Force reflow so the same class can retrigger if users click quickly.
    // eslint-disable-next-line no-unused-expressions
    node.offsetHeight;

    node.classList.add('lk-pagination--changing');
    node.classList.add(direction === 'next' ? 'lk-pagination--next' : 'lk-pagination--prev');

    changeTimer = setTimeout(() => {
      node.classList.remove('lk-pagination--changing', 'lk-pagination--next', 'lk-pagination--prev');
      changeTimer = null;
    }, CHANGE_ANIM_MS);
  }

  function animateActivePage() {
    const active = node.querySelector('.lk-pagination__link--active');
    if (!active) return;

    active.classList.remove('lk-pagination__link--pop');
    // eslint-disable-next-line no-unused-expressions
    active.offsetHeight;
    active.classList.add('lk-pagination__link--pop');

    popTimer = setTimeout(() => {
      active.classList.remove('lk-pagination__link--pop');
      popTimer = null;
    }, POP_ANIM_MS);
  }

  function goTo(p) {
    const next = Math.max(1, Math.min(totalPages, p));
    if (next === page) return;

    const direction = next > page ? 'next' : 'prev';
    page = next;

    animateChange(direction);
    buildPages();
    animateActivePage();

    if (opts.onPageChange) opts.onPageChange(page);
  }

  function onClick(e) {
    const btn = e.target.closest('.lk-pagination__link');
    if (!btn || btn.classList.contains('lk-pagination__link--disabled')) return;

    btn.classList.add('lk-pagination__link--press');
    setTimeout(() => btn.classList.remove('lk-pagination__link--press'), 120);

    const label = btn.getAttribute('aria-label');
    if (label === 'Previous page') { goTo(page - 1); return; }
    if (label === 'Next page') { goTo(page + 1); return; }

    const p = parseInt(btn.dataset.page, 10);
    if (!Number.isNaN(p)) goTo(p);
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
      set(v) {
        totalPages = Math.max(1, v);
        page = Math.min(page, totalPages);
        buildPages();
        animateActivePage();
      },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    clearAnimTimers();
    node.removeEventListener('click', onClick);
    node.classList.remove('lk-pagination', 'lk-pagination--changing', 'lk-pagination--next', 'lk-pagination--prev');
  };

  return comp;
}
