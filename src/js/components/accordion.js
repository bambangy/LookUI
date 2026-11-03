// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Accordion — a group of collapsible cards (lkCard) that can keep one or several panels open

import { resolveEl, applyBase } from '../helpers/base.js';
import { createElement } from '../core/index.js';
import { guard } from '../helpers/guard.js';
import { renderContent } from '../helpers/content.js';
import { lkCard } from './card.js';

let uid = 0;

/**
 * Group several accordion cards. The container either holds `.lk-card` children that have a
 * `.lk-card__header` (each becomes an lkCard), or is empty and gets its cards from `items`.
 *
 *   const acc = Look.lkAccordion('#faq', {
 *     multiple: false,
 *     items: [{ id: 'a', title: 'Shipping', subtitle: 'Costs and times', content: 'Free over $50.' }],
 *     onChange(openIds, { source, item, opened, closed }) {},
 *   });
 *
 * In single mode (`multiple: false`) opening an item closes the open sibling at the same time (both
 * slides animate together). Every sibling that would be closed is asked through `beforeToggle` too:
 * a vetoed sibling close vetoes the whole open.
 *
 * @param {Element|string} el — container
 * @param {Object}   [opts]
 * @param {Array}    [opts.items]       — { id?, title, subtitle?, content (text | Node | fn(host, ctx)), html?, template?, url? (loaded on first open), open?, disabled? } to build into an empty container
 * @param {boolean}  [opts.multiple]    — several panels open at once (default false)
 * @param {boolean}  [opts.collapsible] — allow every panel closed (default true; false keeps one open)
 * @param {number|string|Array} [opts.open] — initially open index / id / array of them
 * @param {'separated'|'bordered'|'flush'} [opts.variant] — layout (default 'separated': a gap between cards); `flush: true` is an alias for 'flush'
 * @param {boolean}  [opts.chevron]     — show the rotating chevron (default true)
 * @param {boolean}  [opts.dense]
 * @param {Function} [opts.beforeToggle] — (nextOpen, { item, source, component, reason? }) => false | Promise; also the DOM event 'lk:before-toggle'
 * @param {Function} [opts.onChange]    — (openIds, { source, component, item, opened, closed }) after a user toggle; source 'click' | 'key' | 'api'
 * @returns {{ el: Element, id: string, hidden: boolean, enabled: boolean, value: Array, items: Array, open: Function, close: Function, toggle: Function, openAll: Function, closeAll: Function, get: Function, add: Function, remove: Function, enable: Function, disable: Function, destroy: Function }}
 */
export function lkAccordion(el, opts = {}) {
  const node = resolveEl(el, 'lkAccordion');
  const multiple = !!opts.multiple;
  const collapsible = opts.collapsible !== false;
  const variant = opts.flush ? 'flush' : (opts.variant || 'separated');

  const hadClass = node.hasAttribute('class');
  const classBefore = node.getAttribute('class');
  node.classList.add('lk-accordion', `lk-accordion--${variant}`);
  if (opts.dense) node.classList.add('lk-accordion--dense');

  const comp = {};
  applyBase(comp, node);

  const records = [];
  let viaKey = false;
  let destroyed = false;

  // --- Items --------------------------------------------------------------------
  function makeRecord(card, spec, built) {
    const header = card.querySelector(':scope > .lk-card__header');
    const rec = {
      id: spec.id != null ? spec.id : null,
      title: spec.title,
      el: card,
      header,
      card: null,
      disabled: !!spec.disabled,
      built,
      spec,
      content: null,
      loaded: false,
      addedHeaderId: false,
    };
    return rec;
  }

  function wire(rec, initiallyOpen) {
    const card = rec.el;
    rec.card = lkCard(card, {
      collapsed: !initiallyOpen,
      chevron: opts.chevron,
      beforeToggle: (next, ctx) => {
        if (rec.disabled) return false;
        // Take over: the accordion runs the guards (own + siblings) and applies the result
        userToggle(rec, next, ctx.source === 'header' && viaKey ? 'key' : 'click');
        return false;
      },
    });
    const header = rec.header;
    if (!header.id) { header.id = `lk-accordion-h-${++uid}`; rec.addedHeaderId = true; }
    const panel = card.querySelector(':scope > .lk-card__collapse');
    rec.panel = panel;
    if (panel) {
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', header.id);
    }
    card.classList.add('lk-accordion__item');
    paintDisabled(rec);
    if (initiallyOpen || !rec.spec.url) ensureContent(rec);
  }

  function paintDisabled(rec) {
    rec.el.classList.toggle('lk-accordion__item--disabled', rec.disabled);
    if (rec.disabled) {
      rec.header.setAttribute('aria-disabled', 'true');
      rec.header.setAttribute('tabindex', '-1');
    } else {
      rec.header.removeAttribute('aria-disabled');
      rec.header.setAttribute('tabindex', '0');
    }
  }

  function ensureContent(rec) {
    if (!rec.built || rec.loaded) return;
    rec.loaded = true;
    const s = rec.spec;
    const spec = {};
    ['url', 'html', 'template', 'content', 'select', 'fetchOptions', 'transform', 'scripts'].forEach((k) => { if (s[k] != null) spec[k] = s[k]; });
    rec.content = renderContent(rec.body, spec, { ctx: { item: rec, component: comp } });
  }

  function buildCard(spec) {
    const card = createElement('div', { class: 'lk-card' });
    const header = createElement('div', { class: 'lk-card__header' });
    if (spec.subtitle != null) {
      header.appendChild(createElement('div', { class: 'lk-card__title' }, String(spec.title ?? '')));
      header.appendChild(createElement('div', { class: 'lk-card__subtitle' }, String(spec.subtitle)));
    } else {
      header.appendChild(createElement('span', { class: 'lk-card__title' }, String(spec.title ?? '')));
    }
    const body = createElement('div', { class: 'lk-card__body' });
    card.append(header, body);
    return { card, body };
  }

  function openFlags(list) {
    // Which records start open: opts.open wins, then per-item `open` / data-open
    let ids = null;
    if (opts.open != null) ids = new Set((Array.isArray(opts.open) ? opts.open : [opts.open]).map(String));
    const flags = list.map((rec, i) => {
      if (ids) return ids.has(String(rec.id)) || ids.has(String(i));
      return !!rec.spec.open || rec.el.hasAttribute('data-open');
    });
    if (!multiple) {
      const first = flags.indexOf(true);
      flags.forEach((f, i) => { if (f && i !== first) flags[i] = false; });
    }
    if (!collapsible && !flags.includes(true)) {
      const i = list.findIndex((r) => !r.disabled);
      if (i >= 0) flags[i] = true;
    }
    return flags;
  }

  function assignId(rec, index) {
    if (rec.id == null) rec.id = rec.el.getAttribute('data-id') || rec.el.id || index;
  }

  // Initial population
  const startBuilt = [];
  const startMarkup = Array.from(node.children).filter((c) => c.classList.contains('lk-card') && c.querySelector(':scope > .lk-card__header'));
  if (Array.isArray(opts.items) && opts.items.length) {
    opts.items.forEach((spec) => {
      const { card, body } = buildCard(spec);
      const rec = makeRecord(card, spec, true);
      rec.body = body;
      node.appendChild(card);
      startBuilt.push(rec);
    });
  }
  startMarkup.forEach((card) => {
    const rec = makeRecord(card, { disabled: card.hasAttribute('data-disabled') || card.classList.contains('lk-accordion__item--disabled') }, false);
    records.push(rec);
  });
  // DOM order: markup cards and built cards interleave by position in the container
  startBuilt.forEach((r) => records.push(r));
  records.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  records.forEach((rec, i) => assignId(rec, i));
  const flags = openFlags(records);
  records.forEach((rec, i) => wire(rec, flags[i]));

  // --- Helpers --------------------------------------------------------------------
  function resolve(ref) {
    if (ref == null) return null;
    if (typeof ref === 'object' && ref.card && records.includes(ref)) return ref;
    if (typeof Node !== 'undefined' && ref instanceof Node) return records.find((r) => r.el === ref || r.header === ref || r.el.contains(ref)) || null;
    return records.find((r) => r.id === ref) || records.find((r) => String(r.id) === String(ref))
      || (typeof ref === 'number' ? records[ref] || null : null);
  }
  const isOpen = (rec) => rec.card.expanded;
  const openIds = () => records.filter(isOpen).map((r) => r.id);
  const view = (rec) => rec;

  function setOpenSilent(rec, next) {
    if (next) ensureContent(rec);
    rec.card.expanded = next;
  }

  /** Ask own + sibling guards in order; apply() runs when all agreed (possibly async). */
  function askAll(entries, source, apply) {
    let i = 0;
    const step = () => {
      if (destroyed) return;
      if (i >= entries.length) { apply(); return; }
      const e = entries[i++];
      guard(node, opts, 'toggle', e.next, { item: e.rec, source, component: comp, ...(e.reason ? { reason: e.reason } : {}) }, step);
    };
    step();
  }

  function change(targets, source, emit) {
    // targets: [{ rec, next, reason? }] already filtered to real changes
    if (!targets.length) return;
    const run = () => {
      targets.forEach((t) => setOpenSilent(t.rec, t.next));
      if (!emit) return;
      const main = targets[0].rec;
      const opened = targets.filter((t) => t.next).map((t) => t.rec);
      const closed = targets.filter((t) => !t.next).map((t) => t.rec);
      if (typeof opts.onChange === 'function') opts.onChange(openIds(), { source, component: comp, item: main, opened, closed });
    };
    askAll(targets, source, run);
  }

  function plan(rec, next) {
    if (next === isOpen(rec)) return [];
    const out = [{ rec, next }];
    if (next && !multiple) {
      records.filter((r) => r !== rec && isOpen(r)).forEach((r) => out.push({ rec: r, next: false, reason: 'sibling' }));
    }
    if (!next && !collapsible && records.filter(isOpen).length <= 1) return [];
    return out;
  }

  function userToggle(rec, next, source) {
    if (destroyed) return;
    change(plan(rec, next), source, true);
  }

  // --- Keyboard (WAI-ARIA accordion): Arrow Up/Down, Home, End between headers -----
  function onKeyCapture(e) {
    if ((e.key === 'Enter' || e.key === ' ') && records.some((r) => r.header === e.target)) {
      viaKey = true;
      Promise.resolve().then(() => { viaKey = false; });
    }
  }
  function onKey(e) {
    const idx = records.findIndex((r) => r.header === e.target);
    if (idx < 0) return;
    const enabled = records.filter((r) => !r.disabled);
    if (!enabled.length) return;
    const cur = enabled.indexOf(records[idx]);
    let target = null;
    if (e.key === 'ArrowDown') target = enabled[(cur + 1) % enabled.length];
    else if (e.key === 'ArrowUp') target = enabled[(cur - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') target = enabled[0];
    else if (e.key === 'End') target = enabled[enabled.length - 1];
    if (!target) return;
    e.preventDefault();
    target.header.focus();
  }
  node.addEventListener('keydown', onKeyCapture, true);
  node.addEventListener('keydown', onKey);

  // --- API ----------------------------------------------------------------------
  Object.defineProperty(comp, 'value', {
    get() { return openIds(); },
    set(v) {
      const want = new Set((Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => { const r = resolve(x); return r ? r.id : x; }));
      let kept = false;
      records.forEach((rec) => {
        let next = want.has(rec.id);
        if (!multiple && next) { if (kept) next = false; kept = true; }
        setOpenSilent(rec, next);
      });
      if (!collapsible && !records.some(isOpen)) { const f = records.find((r) => !r.disabled); if (f) setOpenSilent(f, true); }
    },
    enumerable: true,
  });
  Object.defineProperty(comp, 'items', { get() { return records.slice(); }, enumerable: true });
  Object.defineProperty(comp, 'multiple', { value: multiple, enumerable: true });

  const need = (ref, caller) => {
    const rec = resolve(ref);
    if (!rec) throw new Error(`Look.lkAccordion.${caller}: item not found - "${ref}"`);
    return rec;
  };

  comp.get = (ref) => { const r = resolve(ref); return r ? view(r) : null; };
  comp.open = (ref) => { const r = need(ref, 'open'); change(plan(r, true), 'api', true); };
  comp.close = (ref) => { const r = need(ref, 'close'); change(plan(r, false), 'api', true); };
  comp.toggle = (ref) => { const r = need(ref, 'toggle'); change(plan(r, !isOpen(r)), 'api', true); };
  comp.openAll = () => {
    if (!multiple) return;
    change(records.filter((r) => !isOpen(r) && !r.disabled).map((r) => ({ rec: r, next: true })), 'api', true);
  };
  comp.closeAll = () => {
    let list = records.filter(isOpen);
    if (!collapsible) list = list.slice(1);
    change(list.map((r) => ({ rec: r, next: false })), 'api', true);
  };
  comp.enable = (ref) => { const r = need(ref, 'enable'); r.disabled = false; paintDisabled(r); };
  comp.disable = (ref) => { const r = need(ref, 'disable'); r.disabled = true; paintDisabled(r); };

  /**
   * Add an item (silent). `index` defaults to the end.
   * @param {Object} spec — { id?, title, subtitle?, content, open?, disabled? }
   * @param {number} [index]
   */
  comp.add = (spec, index) => {
    const { card, body } = buildCard(spec);
    const rec = makeRecord(card, spec, true);
    rec.body = body;
    const at = index == null || index < 0 || index > records.length ? records.length : index;
    const before = records[at];
    if (before) node.insertBefore(card, before.el); else node.appendChild(card);
    records.splice(at, 0, rec);
    assignId(rec, `item-${++uid}`);
    let open = !!spec.open;
    if (open && !multiple) records.forEach((r) => { if (r !== rec && isOpen(r)) setOpenSilent(r, false); });
    if (!open && !collapsible && !records.some((r) => r !== rec && isOpen(r))) open = true;
    wire(rec, open);
    return view(rec);
  };

  comp.remove = (ref) => {
    const rec = need(ref, 'remove');
    unwire(rec);
    rec.content?.destroy();
    records.splice(records.indexOf(rec), 1);
    rec.el.remove();
    if (!collapsible && !records.some(isOpen)) { const f = records.find((r) => !r.disabled); if (f) setOpenSilent(f, true); }
  };

  function unwire(rec) {
    rec.card.destroy();
    if (rec.addedHeaderId) rec.header.removeAttribute('id');
    rec.header.removeAttribute('aria-disabled');
    rec.el.classList.remove('lk-accordion__item', 'lk-accordion__item--disabled');
    if (!rec.el.getAttribute('class')) rec.el.removeAttribute('class');
  }

  comp.destroy = function () {
    if (destroyed) return;
    destroyed = true;
    node.removeEventListener('keydown', onKeyCapture, true);
    node.removeEventListener('keydown', onKey);
    records.forEach((rec) => {
      rec.content?.destroy();
      unwire(rec);
      if (rec.built) rec.el.remove();
    });
    records.length = 0;
    if (hadClass) node.setAttribute('class', classBefore);
    else node.removeAttribute('class');
  };

  return comp;
}
