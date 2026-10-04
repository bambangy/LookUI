// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
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

  let totalPages = Math.max(1, Math.floor(opts.totalPages ?? 1));
  let page = Math.max(1, Math.min(totalPages, Math.floor(opts.page ?? 1)));
  const maxVis = Math.max(1, Math.floor(opts.maxVisible ?? 7));

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
    if (page <= 1) prevBtn.disabled = true;
    prevBtn.appendChild(lkIcon('chevron-left', { size: 'sm' }));
    prevLi.appendChild(prevBtn);
    appendItem(prevLi);

    // Page slots (numbers and ellipses) never exceed maxVisible, so the
    // control keeps a constant width while paging.
    getSlots().forEach((slot) => {
      if (slot === null) appendEllipsis(appendItem);
      else appendPageBtn(slot, appendItem);
    });

    // Next button
    const nextLi = createElement('li', { class: 'lk-pagination__item' });
    const nextBtn = createElement('button', {
      class: 'lk-pagination__link' + (page >= totalPages ? ' lk-pagination__link--disabled' : ''),
      type: 'button',
      'aria-label': 'Next page',
    });
    if (page >= totalPages) nextBtn.disabled = true;
    nextBtn.appendChild(lkIcon('chevron-right', { size: 'sm' }));
    nextLi.appendChild(nextBtn);
    appendItem(nextLi);
  }

  // Returns page numbers with `null` for an ellipsis, e.g. [1, null, 9, 10, 11, null, 20]
  function getSlots() {
    const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

    if (totalPages <= maxVis) return range(1, totalPages);

    // Too few slots for first/last + ellipses: plain sliding window
    if (maxVis < 5) {
      let start = Math.max(1, page - Math.floor((maxVis - 1) / 2));
      start = Math.min(start, totalPages - maxVis + 1);
      return range(start, start + maxVis - 1);
    }

    const inner = maxVis - 4; // pages between the two ellipses
    if (page <= maxVis - 3) {
      return [...range(1, maxVis - 2), null, totalPages];
    }
    if (page >= totalPages - (maxVis - 4)) {
      return [1, null, ...range(totalPages - maxVis + 3, totalPages)];
    }
    const start = page - Math.floor((inner - 1) / 2);
    return [1, null, ...range(start, start + inner - 1), null, totalPages];
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
    const span = createElement('span', { class: 'lk-pagination__ellipsis', 'aria-hidden': 'true' }, '…');
    li.appendChild(span);
    appendItem(li);
  }

  function animateChange(direction) {
    clearAnimTimers();
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

    if (popTimer) clearTimeout(popTimer);
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
    const next = Math.max(1, Math.min(totalPages, Math.floor(Number(p) || 1)));
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
        totalPages = Math.max(1, Math.floor(Number(v) || 1));
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
    // Remove the auto-generated items
    node.innerHTML = '';
  };

  return comp;
}
