// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Tabs component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { renderContent, hasContent, contentUid } from '../helpers/content.js';

const RENDER_ALIASES = { once: 'lazy', first: 'lazy', always: 'eager', each: 'active', reload: 'active' };
const VARIANTS = ['line', 'pill', 'box'];

function normRender(v) {
  const r = RENDER_ALIASES[v] || v;
  return r === 'eager' || r === 'active' ? r : 'lazy';
}

function resolveContainer(ref) {
  if (!ref) return null;
  if (ref instanceof Element) return ref;
  const s = String(ref);
  return document.getElementById(s.replace(/^#/, '')) || (/^[#.[]/.test(s) ? document.querySelector(s) : null);
}

/**
 * Tabs: a tab list (built from options or an existing <ul>/<ol>) plus one panel per tab,
 * rendered into a container element.
 *
 * Content per tab (one of): `content` (text | Node | (panel, ctx) => …), `html`, `url` (fetched, async),
 * `template`, or `panel` (an existing element that is shown/hidden as-is).
 *
 * @param {Element|string} el — a <ul>/<ol> to enhance, or a container to build the tab list in
 * @param {Object} [opts]
 * @param {Array}   [opts.tabs]         — [{ name, title, icon, badge, disabled, content|html|url|template|panel, render, select, fetchOptions, transform, scripts }]
 * @param {Element|string} [opts.container] — element / element id receiving the panels
 * @param {string}  [opts.orientation]  — 'horizontal' (default) | 'vertical'
 * @param {string}  [opts.variant]      — 'line' (default) | 'pill' | 'box'
 * @param {string}  [opts.render]       — 'lazy' (default: on first activation) | 'eager' (all at once) | 'active' (on every activation; destroyed on leave)
 * @param {string|number} [opts.active] — tab shown first (name or index)
 * @param {string}  [opts.activation]   — 'auto' (arrow keys select, default) | 'manual' (arrows move focus, Enter/Space select)
 * @param {boolean} [opts.fill]         — stretch tabs over the full width
 * @param {boolean} [opts.dense]
 * @param {string}  [opts.loadingText]
 * @param {Function} [opts.beforeChange] — (next, { prev, source, component }) => false to cancel
 * @param {Function} [opts.onChange]    — (name, { source, component, prev, tab }); prev = previous tab name
 * @param {Function} [opts.onLoad]      — (panel, { name, tab, component }) after a tab's content is in place
 * @param {Function} [opts.onError]     — (error, { name, panel, tab, component })
 * @returns {Object}
 */
export function lkTabs(el, opts = {}) {
  const node = resolveEl(el, 'lkTabs');
  const isList = node.tagName === 'UL' || node.tagName === 'OL';
  const vertical = opts.orientation === 'vertical' || opts.vertical === true;
  const variant = VARIANTS.includes(opts.variant) ? opts.variant : 'line';
  const activation = opts.activation === 'manual' ? 'manual' : 'auto';
  const defaultRender = normRender(opts.render);

  const created = [];   // nodes this instance added (removed on destroy)
  const restore = [];   // undo functions for markup it changed

  // --- Structure -------------------------------------------------------------------

  let list = node;
  if (!isList) {
    list = node.querySelector(':scope > ul, :scope > ol');
    if (!list) {
      list = document.createElement('ul');
      node.prepend(list);
      created.push(list);
    }
    const layoutClasses = ['lk-tabs-layout', ...(vertical ? ['lk-tabs-layout--vertical'] : [])]
      .filter((c) => !node.classList.contains(c));
    node.classList.add(...layoutClasses);
    restore.push(() => node.classList.remove(...layoutClasses));
  }

  const listClasses = ['lk-tabs', `lk-tabs--${variant}`];
  if (vertical) listClasses.push('lk-tabs--vertical');
  if (opts.fill) listClasses.push('lk-tabs--fill');
  if (opts.dense) listClasses.push('lk-tabs--dense');
  const listHadClass = list.hasAttribute('class');
  const addedListClasses = listClasses.filter((c) => !list.classList.contains(c));
  list.classList.add(...addedListClasses);
  const prevRole = list.getAttribute('role');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  restore.push(() => {
    list.classList.remove(...addedListClasses, 'lk-tabs--ready');
    if (!listHadClass && !list.classList.length) list.removeAttribute('class');
    if (prevRole == null) list.removeAttribute('role'); else list.setAttribute('role', prevRole);
    list.removeAttribute('aria-orientation');
  });

  let container = resolveContainer(opts.container);
  if (opts.container && !container) throw new Error(`Look.lkTabs: container not found — "${opts.container}"`);
  if (!container) {
    container = document.createElement('div');
    if (isList) list.insertAdjacentElement('afterend', container);
    else node.appendChild(container);
    created.push(container);
  }
  const addedContainerClass = !container.classList.contains('lk-tabs__panels');
  container.classList.add('lk-tabs__panels');
  if (opts.dense) container.classList.add('lk-tabs__panels--dense');
  if (variant === 'box') container.classList.add('lk-tabs__panels--box');
  restore.push(() => {
    if (addedContainerClass) container.classList.remove('lk-tabs__panels');
    container.classList.remove('lk-tabs__panels--dense', 'lk-tabs__panels--box');
  });

  const indicator = document.createElement('li');
  indicator.className = 'lk-tabs__indicator';
  indicator.setAttribute('role', 'presentation');
  indicator.setAttribute('aria-hidden', 'true');

  // --- Tabs ------------------------------------------------------------------------

  const tabs = [];
  let active = null;
  let destroyed = false;

  function liSpec(li) {
    const d = li.dataset;
    const spec = {};
    if (d.url) spec.url = d.url;
    if (d.select) spec.select = d.select;
    if (d.template) spec.template = d.template;
    const href = li.querySelector('a[href^="#"]')?.getAttribute('href');
    const panelRef = d.panel || (href && href.length > 1 ? href : null);
    if (panelRef) spec.panel = panelRef;
    if (d.render) spec.render = d.render;
    if (d.name) spec.name = d.name;
    if (d.disabled != null || li.getAttribute('aria-disabled') === 'true') spec.disabled = true;
    return spec;
  }

  function fillLi(li, o) {
    if (o.icon) {
      const i = document.createElement('span');
      i.className = `lk-icon lk-icon--${o.icon}`;
      i.setAttribute('aria-hidden', 'true');
      li.appendChild(i);
    }
    const label = document.createElement('span');
    label.className = 'lk-tabs__label';
    if (o.title instanceof Node) label.appendChild(o.title);
    else label.textContent = o.title ?? o.name ?? '';
    li.appendChild(label);
    if (o.badge != null && o.badge !== '') {
      const b = document.createElement('span');
      b.className = 'lk-tabs__badge';
      b.textContent = String(o.badge);
      li.appendChild(b);
    }
  }

  function setupTab(li, o, ownLi) {
    const t = {
      li,
      ownLi,
      name: o.name ?? o.id ?? li.id ?? null,
      title: o.title ?? li.textContent.trim(),
      options: o,
      spec: o,
      render: normRender(o.render ?? defaultRender),
      disabled: !!o.disabled,
      panel: null,
      ownPanel: false,
      handle: null,
      undo: [],
    };
    if (!t.name) t.name = null;

    // The tab
    const id = li.id || contentUid('lk-tab');
    const hadId = !!li.id;
    const hadClass = li.hasAttribute('class');
    li.id = id;
    li.classList.add('lk-tabs__tab');
    li.setAttribute('role', 'tab');
    li.setAttribute('tabindex', '-1');
    li.setAttribute('aria-selected', 'false');
    li.querySelectorAll('a, button').forEach((a) => {
      const prev = a.getAttribute('tabindex');
      a.setAttribute('tabindex', '-1');
      t.undo.push(() => { if (prev == null) a.removeAttribute('tabindex'); else a.setAttribute('tabindex', prev); });
    });

    // The panel
    const existing = o.panel != null ? resolveContainer(o.panel) : null;
    if (existing) {
      t.panel = existing;
      const wasHidden = existing.hidden;
      t.undo.push(() => { existing.hidden = wasHidden; });
    } else {
      t.panel = document.createElement('div');
      t.ownPanel = true;
      container.appendChild(t.panel);
    }
    const panelId = t.panel.id || contentUid('lk-tabpanel');
    const hadPanelId = !!t.panel.id;
    t.panel.id = panelId;
    t.panel.classList.add('lk-tabs__panel');
    t.panel.setAttribute('role', 'tabpanel');
    t.panel.setAttribute('aria-labelledby', id);
    if (!t.panel.hasAttribute('tabindex')) t.panel.setAttribute('tabindex', '0');
    t.panel.hidden = true;
    li.setAttribute('aria-controls', panelId);

    t.undo.push(() => {
      if (!hadId) li.removeAttribute('id');
      li.classList.remove('lk-tabs__tab', 'lk-tabs__tab--active', 'lk-tabs__tab--disabled');
      if (!hadClass && !li.classList.length) li.removeAttribute('class');
      ['role', 'tabindex', 'aria-selected', 'aria-controls', 'aria-disabled'].forEach((a) => li.removeAttribute(a));
      if (!t.ownPanel) {
        if (!hadPanelId) t.panel.removeAttribute('id');
        t.panel.classList.remove('lk-tabs__panel', 'lk-tabs__panel--enter');
        ['role', 'aria-labelledby', 'tabindex'].forEach((a) => t.panel.removeAttribute(a));
      }
    });

    applyDisabled(t);
    return t;
  }

  function applyDisabled(t) {
    t.li.classList.toggle('lk-tabs__tab--disabled', t.disabled);
    if (t.disabled) t.li.setAttribute('aria-disabled', 'true');
    else t.li.removeAttribute('aria-disabled');
  }

  function publicTab(t) {
    if (!t) return null;
    return { name: t.name, index: tabs.indexOf(t), title: t.title, el: t.li, panel: t.panel, disabled: t.disabled, options: t.options };
  }

  function find(ref) {
    if (ref == null) return null;
    if (tabs.includes(ref)) return ref;
    if (typeof ref === 'object') return tabs.find((t) => t.li === ref || t.panel === ref || t.options === ref) || null;
    const byName = tabs.find((t) => t.name != null && String(t.name) === String(ref));
    if (byName) return byName;
    return typeof ref === 'number' || /^\d+$/.test(String(ref)) ? tabs[Number(ref)] || null : null;
  }

  // --- Content -----------------------------------------------------------------------

  function render(t) {
    if (!hasContent(t.spec) || t.handle) return;
    t.handle = renderContent(t.panel, t.spec, {
      ctx: { name: t.name, tab: publicTab(t), tabs: comp },
      loadingText: opts.loadingText,
      onLoad: () => {
        const ctx = { name: t.name, tab: publicTab(t), component: comp };
        t.options.onLoad?.(t.panel, ctx);
        opts.onLoad?.(t.panel, ctx);
      },
      onError: (err) => opts.onError?.(err, { name: t.name, panel: t.panel, tab: publicTab(t), component: comp }),
    });
  }

  function unrender(t) {
    t.handle?.destroy();
    t.handle = null;
  }

  // --- Selection ---------------------------------------------------------------------

  let indicatorReady = false;
  function placeIndicator() {
    if (destroyed || !list.isConnected) return;
    const li = active?.li;
    if (!li || variant === 'box') { indicator.hidden = true; return; }
    indicator.hidden = false;
    const s = indicator.style;
    s.setProperty('--lk-tabs-ind-x', `${li.offsetLeft}px`);
    s.setProperty('--lk-tabs-ind-y', `${li.offsetTop}px`);
    s.setProperty('--lk-tabs-ind-w', `${li.offsetWidth}px`);
    s.setProperty('--lk-tabs-ind-h', `${li.offsetHeight}px`);
    if (!indicatorReady && li.offsetWidth) {
      indicatorReady = true;
      requestAnimationFrame(() => list.classList.add('lk-tabs--ready'));
    }
  }

  function revealTab(li) {
    // Scroll the tab list only (never the page)
    if (vertical) {
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    } else if (li.offsetLeft < list.scrollLeft) list.scrollLeft = li.offsetLeft;
    else if (li.offsetLeft + li.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = li.offsetLeft + li.offsetWidth - list.clientWidth;
  }

  // source: 'click' | 'key' | 'api' | 'disable' (removing the active tab moves silently)
  function select(ref, { focus = false, silent = false, source = 'api' } = {}) {
    const t = find(ref);
    if (!t || t.disabled || destroyed) return false;
    if (t === active) {
      if (focus) t.li.focus({ preventScroll: true });
      return true;
    }
    const prev = active;
    if (!silent && typeof opts.beforeChange === 'function'
      && opts.beforeChange(publicTab(t), { prev: publicTab(prev), source, component: comp }) === false) return false;

    if (prev) {
      prev.li.classList.remove('lk-tabs__tab--active');
      prev.li.setAttribute('aria-selected', 'false');
      prev.li.setAttribute('tabindex', '-1');
      prev.panel.hidden = true;
      prev.panel.classList.remove('lk-tabs__panel--enter');
      if (prev.render === 'active') unrender(prev);
    }
    active = t;
    t.li.classList.add('lk-tabs__tab--active');
    t.li.setAttribute('aria-selected', 'true');
    t.li.setAttribute('tabindex', '0');
    t.panel.hidden = false;
    if (prev) {
      // Replay the enter animation
      t.panel.classList.remove('lk-tabs__panel--enter');
      void t.panel.offsetWidth;
      t.panel.classList.add('lk-tabs__panel--enter');
    }
    render(t);
    placeIndicator();
    revealTab(t.li);
    if (focus) t.li.focus({ preventScroll: true });
    if (!silent && prev) opts.onChange?.(t.name, { source, component: comp, prev: prev.name, tab: publicTab(t) });
    return true;
  }

  // --- Events ------------------------------------------------------------------------

  function tabOf(target) {
    const li = target.closest?.('.lk-tabs__tab');
    return li && li.parentElement === list ? tabs.find((t) => t.li === li) : null;
  }

  function onClick(e) {
    const t = tabOf(e.target);
    if (!t) return;
    if (e.target.closest('a[href]')) e.preventDefault();
    select(t, { focus: true, source: 'click' });
  }

  function onKeydown(e) {
    const t = tabOf(e.target);
    if (!t) return;
    const enabled = tabs.filter((x) => !x.disabled);
    const i = enabled.indexOf(t);
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    let target = null;
    if (e.key === prevKey) target = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === nextKey) target = enabled[(i + 1) % enabled.length];
    else if (e.key === 'Home') target = enabled[0];
    else if (e.key === 'End') target = enabled[enabled.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(t, { focus: true, source: 'key' });
      return;
    } else return;
    e.preventDefault();
    if (!target) return;
    if (activation === 'auto') select(target, { focus: true, source: 'key' });
    else target.li.focus({ preventScroll: true });
  }

  // --- Build -------------------------------------------------------------------------

  const markupItems = Array.from(list.children).filter((c) => c.tagName === 'LI');
  const optionTabs = Array.isArray(opts.tabs) ? opts.tabs : [];
  const total = Math.max(markupItems.length, optionTabs.length);
  for (let i = 0; i < total; i++) {
    const li = markupItems[i];
    const o = { ...(li ? liSpec(li) : {}), ...(optionTabs[i] || {}) };
    if (li) {
      tabs.push(setupTab(li, o, false));
    } else {
      const newLi = document.createElement('li');
      fillLi(newLi, o);
      list.appendChild(newLi);
      tabs.push(setupTab(newLi, o, true));
    }
  }
  list.appendChild(indicator);

  list.addEventListener('click', onClick);
  list.addEventListener('keydown', onKeydown);

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeIndicator()) : null;
  ro?.observe(list);
  const onWinResize = () => placeIndicator();
  if (!ro) window.addEventListener('resize', onWinResize);
  document.fonts?.ready?.then(() => placeIndicator());

  // --- API ---------------------------------------------------------------------------

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    active: { get() { return active?.name ?? (active ? tabs.indexOf(active) : null); }, set(v) { select(v); }, enumerable: true },
    activeIndex: { get() { return active ? tabs.indexOf(active) : -1; }, set(v) { select(Number(v)); }, enumerable: true },
    tabs: { get() { return tabs.map(publicTab); }, enumerable: true },
    count: { get() { return tabs.length; }, enumerable: true },
    list: { get() { return list; }, enumerable: true },
    container: { get() { return container; }, enumerable: true },
  });

  comp.select = (ref) => select(ref);
  comp.get = (ref) => publicTab(find(ref));
  comp.panel = (ref) => find(ref)?.panel ?? null;

  /** Render a tab's content again (URL tabs fetch again). */
  comp.reload = (ref) => {
    const t = ref == null ? active : find(ref);
    if (!t || !hasContent(t.spec)) return Promise.resolve(false);
    unrender(t);
    if (t === active || t.render === 'eager') { render(t); return t.handle.promise; }
    return Promise.resolve(true); // rendered again on next activation
  };

  comp.disable = (ref) => {
    const t = find(ref);
    if (!t) return comp;
    t.disabled = true;
    applyDisabled(t);
    if (t === active) {
      const next = tabs.find((x) => !x.disabled);
      if (next) select(next, { source: 'disable' });
    }
    return comp;
  };
  comp.enable = (ref) => {
    const t = find(ref);
    if (!t) return comp;
    t.disabled = false;
    applyDisabled(t);
    if (!active) select(t);
    return comp;
  };

  /** Add a tab (same shape as an `opts.tabs` item) at `index` (default: end). */
  comp.add = (o, index) => {
    const li = document.createElement('li');
    fillLi(li, o);
    const at = Number.isInteger(index) ? Math.max(0, Math.min(index, tabs.length)) : tabs.length;
    list.insertBefore(li, tabs[at]?.li || indicator);
    const t = setupTab(li, o, true);
    if (tabs[at] && t.ownPanel) container.insertBefore(t.panel, tabs[at].panel.parentElement === container ? tabs[at].panel : null);
    tabs.splice(at, 0, t);
    if (t.render === 'eager') render(t);
    if (!active || o.active) select(t);
    placeIndicator();
    return publicTab(t);
  };

  /** Remove a tab and its panel. The neighbour becomes active when it was the active one. */
  comp.remove = (ref) => {
    const t = find(ref);
    if (!t) return false;
    const i = tabs.indexOf(t);
    if (t === active) {
      const others = tabs.filter((x) => x !== t && !x.disabled);
      const next = others.find((x) => tabs.indexOf(x) > i) || others[others.length - 1];
      if (next) select(next, { silent: true });
      else active = null;
    }
    unrender(t);
    t.undo.forEach((fn) => fn());
    if (t.ownPanel) t.panel.remove();
    if (t.ownLi) t.li.remove();
    tabs.splice(i, 1);
    placeIndicator();
    return true;
  };

  comp.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    list.removeEventListener('click', onClick);
    list.removeEventListener('keydown', onKeydown);
    ro?.disconnect();
    window.removeEventListener('resize', onWinResize);
    tabs.forEach((t) => {
      unrender(t);
      t.undo.forEach((fn) => fn());
      if (t.ownPanel) t.panel.remove();
      if (t.ownLi) t.li.remove();
    });
    tabs.length = 0;
    indicator.remove();
    restore.forEach((fn) => fn());
    created.forEach((n) => n.remove());
  };

  // Initial state
  tabs.forEach((t) => { if (t.render === 'eager') render(t); });
  const first = find(opts.active) || tabs.find((t) => t.options.active && !t.disabled) || tabs.find((t) => !t.disabled);
  if (first) select(first, { silent: true });

  return comp;
}
