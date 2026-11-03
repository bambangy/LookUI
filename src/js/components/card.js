// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Card component — accordion header (click to slide the rest of the card open/closed)

import { resolveEl, applyBase } from '../helpers/base.js';
import { createElement } from '../core/index.js';
import { guard } from '../helpers/guard.js';
import { lkIcon } from './icon.js';

let uid = 0;
const INTERACTIVE = 'a[href], button, input, select, textarea, label, [data-no-toggle]';

/**
 * Make a card's header an accordion toggle. Everything after the header (body, footer, …)
 * slides away when the header is clicked; the media before the header stays.
 *
 *   const card = Look.lkCard('#details', { collapsed: true, onOpen: (c) => {} });
 *
 * Clicks on links, buttons and form controls inside the header (or anything marked
 * `data-no-toggle`) do not toggle the card.
 *
 * @param {Element|string} el — .lk-card element
 * @param {Object}   [opts]
 * @param {boolean}  [opts.collapsed]  — start closed (default false; also `data-collapsed` / `.lk-card--collapsed`)
 * @param {boolean}  [opts.chevron]    — show the rotating chevron in the header (default true)
 * @param {Function} [opts.beforeToggle] — (nextExpanded, { source, component }) => false | Promise — veto opening / closing (also the DOM event 'lk:before-toggle')
 * @param {Function} [opts.onOpen]     — (component) after the card opens
 * @param {Function} [opts.onClose]    — (reason, component) after it closes; reason 'header' | 'api'
 * @returns {{ el: Element, id: string, hidden: boolean, enabled: boolean, expanded: boolean, open: Function, close: Function, toggle: Function, destroy: Function }}
 */
export function lkCard(el, opts = {}) {
  const node = resolveEl(el, 'lkCard');
  const header = node.querySelector(':scope > .lk-card__header');
  if (!header) throw new Error('Look.lkCard: the card needs a .lk-card__header to toggle');

  const hadCardClass = node.classList.contains('lk-card');
  node.classList.add('lk-card', 'lk-card--collapsible');

  // --- Markup: wrap everything after the header in a sliding panel -------------
  const panel = createElement('div', { class: 'lk-collapse lk-card__collapse' });
  const inner = createElement('div', { class: 'lk-collapse__inner' });
  panel.appendChild(inner);
  const moved = [];
  for (let n = header.nextSibling; n; n = n.nextSibling) moved.push(n);
  moved.forEach((n) => inner.appendChild(n));
  header.after(panel);

  panel.id = `lk-card-panel-${++uid}`;

  const hadAttrs = {
    role: header.getAttribute('role'),
    tabindex: header.getAttribute('tabindex'),
  };
  header.classList.add('lk-card__header--toggle');
  header.setAttribute('role', 'button');
  if (!header.hasAttribute('tabindex')) header.setAttribute('tabindex', '0');
  header.setAttribute('aria-controls', panel.id);

  let chevron = null;
  if (opts.chevron !== false) {
    chevron = createElement('span', { class: 'lk-card__chevron' });
    chevron.appendChild(lkIcon('chevron-down'));
    header.appendChild(chevron);
  }

  const comp = {};
  applyBase(comp, node);

  let expanded = !(opts.collapsed ?? (node.hasAttribute('data-collapsed') || node.classList.contains('lk-card--collapsed')));

  function paint() {
    node.classList.toggle('lk-card--collapsed', !expanded);
    panel.classList.toggle('lk-collapse--open', expanded);
    header.setAttribute('aria-expanded', String(expanded));
  }

  function set(next, reason, emit) {
    next = !!next;
    if (next === expanded) return;
    if (!emit) { apply(next, reason, false); return; }
    guard(node, opts, 'toggle', next, { source: reason, component: comp }, () => apply(next, reason, true));
  }

  function apply(next, reason, emit) {
    if (next === expanded) return;
    expanded = next;
    paint();
    if (!emit) return;
    if (expanded) {
      if (typeof opts.onOpen === 'function') opts.onOpen(comp);
    } else if (typeof opts.onClose === 'function') {
      opts.onClose(reason, comp);
    }
  }

  paint();

  function onClick(e) {
    const hit = e.target.closest?.(INTERACTIVE);
    if (hit && header.contains(hit)) return;
    set(!expanded, 'header', true);
  }
  function onKey(e) {
    if (e.target !== header) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      set(!expanded, 'header', true);
    }
  }
  header.addEventListener('click', onClick);
  header.addEventListener('keydown', onKey);

  Object.defineProperty(comp, 'expanded', {
    get() { return expanded; },
    set(v) { set(v, 'api', false); },
    enumerable: true,
  });
  comp.open = () => set(true, 'api', true);
  comp.close = () => set(false, 'api', true);
  comp.toggle = () => set(!expanded, 'api', true);

  comp.destroy = function () {
    header.removeEventListener('click', onClick);
    header.removeEventListener('keydown', onKey);
    Array.from(inner.childNodes).forEach((n) => panel.before(n));
    panel.remove();
    chevron?.remove();
    header.classList.remove('lk-card__header--toggle');
    header.removeAttribute('aria-controls');
    header.removeAttribute('aria-expanded');
    for (const [name, v] of Object.entries(hadAttrs)) {
      if (v == null) header.removeAttribute(name);
      else header.setAttribute(name, v);
    }
    node.classList.remove('lk-card--collapsible', 'lk-card--collapsed');
    if (!hadCardClass) node.classList.remove('lk-card');
    if (!node.getAttribute('class')) node.removeAttribute('class');
  };

  return comp;
}
