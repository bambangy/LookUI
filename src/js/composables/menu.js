// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Menu — dropdown / context menu with submenus, built on lkPopupProxy

import { resolveEl } from '../helpers/base.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkIcon } from '../components/icon.js';
import { lkPopupProxy } from './popupProxy.js';

lkI18n.define('menu', {
  label: 'Menu',
});

let uid = 0;
const TYPEAHEAD_MS = 700;
const SELECTABLE = new Set(['item', 'checkbox', 'radio']);

/**
 * Dropdown menu or context menu. The menu DOM is built live inside an lkPopupProxy panel
 * (one proxy per nesting level), so it flips near the viewport edges and stacks above dialogs.
 *
 *   const menu = Look.lkMenu('#more', {
 *     items: [
 *       { id: 'rename', text: 'Rename', icon: 'edit', shortcut: 'F2' },
 *       { type: 'separator' },
 *       { id: 'share', text: 'Share', items: [{ id: 'link', text: 'Copy link' }] },
 *     ],
 *     onAction(item, { source, component }) {},
 *   });
 *
 *   Look.lkMenu('#canvas', { trigger: 'contextmenu', items });   // opens at the pointer
 *   Look.lkMenu({ items }).open(120, 80);                         // manual, no trigger element
 *
 * Keyboard: Up/Down/Home/End, Right opens a submenu, Left closes it, Enter/Space activate,
 * type-ahead, Escape closes the innermost submenu (then the menu) and returns focus to the trigger,
 * Tab closes. Disabled items are skipped by the keyboard.
 *
 * Signatures: lkMenu(target, opts) | lkMenu(opts)
 *
 * @param {Element|string|Object} [target] — trigger element / selector (omit for a manual menu)
 * @param {Object}   [opts]
 * @param {Array}    [opts.items]        — { id?, text, icon?, shortcut?, type?: 'item' | 'separator' | 'header' | 'checkbox' | 'radio', checked?, group?, disabled?, hidden?, items? (submenu), keepOpen?, onClick? }; '-' is a separator
 * @param {'click'|'contextmenu'|'hover'|'manual'} [opts.trigger] — default 'click' with a target, else 'manual'
 * @param {string}   [opts.placement='bottom-left'] — lkPopupProxy placement of the root menu ('bottom-right', 'top-left', …)
 * @param {boolean}  [opts.closeOnAction=true] — close after an item is activated (an item can opt out with `keepOpen`)
 * @param {number}   [opts.hoverDelay=120]  — ms before a hovered submenu opens (hover intent)
 * @param {number}   [opts.closeDelay=250]  — trigger 'hover': ms before leaving closes the menu
 * @param {string}   [opts.ariaLabel]       — accessible name (default: the `label` text)
 * @param {string}   [opts.className]       — extra class on the panel
 * @param {boolean}  [opts.dense]
 * @param {Object}   [opts.text]            — text overrides ('label')
 * @param {Function} [opts.beforeOpen]      — ({ source, component, anchor, x, y }) false cancels
 * @param {Function} [opts.beforeClose]     — (reason, { source, component }) false keeps it open
 * @param {Function} [opts.beforeAction]    — (item, { source, component, event, checked }) false keeps the menu open and skips the action
 * @param {Function} [opts.onAction]        — (item, { source: 'click' | 'key' | 'api', component, event, checked })
 * @param {Function} [opts.onOpen]          — (component)
 * @param {Function} [opts.onClose]         — (reason, component); reason 'escape' | 'outside' | 'action' | 'tab' | 'toggle' | 'hover' | 'api' | 'destroy'
 * @returns {{ el: Element, isOpen: boolean, open: Function, close: Function, toggle: Function, setItems: Function, get: Function, setChecked: Function, enable: Function, disable: Function, show: Function, hide: Function, activate: Function, destroy: Function }}
 */
export function lkMenu(targetOrOpts, maybeOpts) {
  let target = null;
  let o;
  if (maybeOpts === undefined && targetOrOpts && typeof targetOrOpts === 'object' && !(typeof Node !== 'undefined' && targetOrOpts instanceof Node)) o = targetOrOpts;
  else { target = targetOrOpts || null; o = maybeOpts || {}; }
  const triggerEl = target ? resolveEl(target, 'lkMenu') : null;
  const mode = o.trigger || (triggerEl ? 'click' : 'manual');
  if (mode !== 'manual' && !triggerEl) throw new Error(`Look.lkMenu: trigger "${mode}" needs a target element`);

  const hostEl = triggerEl || document.body;
  const baseId = `lk-menu-${++uid}`;
  const dummy = document.createElement('span');   // inert "trigger" handed to the popup proxies; real anchors are passed to show()

  const comp = {};
  const tx = bindText('menu', o.text, refresh);

  // --- Model --------------------------------------------------------------------------
  const byId = new Map();
  let rootItems = [];
  let counter = 0;

  function norm(raw, parent) {
    if (raw === '-' || raw === 'separator') raw = { type: 'separator' };
    const r = raw && typeof raw === 'object' ? raw : { text: String(raw) };
    const type = r.type || 'item';
    const it = {
      id: r.id != null ? r.id : `${baseId}-i${++counter}`,
      type,
      text: r.text != null ? String(r.text) : '',
      icon: r.icon || null,
      shortcut: r.shortcut || '',
      checked: !!r.checked,
      group: r.group != null ? r.group : null,
      disabled: !!r.disabled,
      hidden: !!r.hidden,
      keepOpen: !!r.keepOpen,
      onClick: typeof r.onClick === 'function' ? r.onClick : null,
      data: r,
      parent,
      items: [],
      el: null,
    };
    if (Array.isArray(r.items) && it.type !== 'separator' && it.type !== 'header') it.items = r.items.map((c) => norm(c, it));
    byId.set(it.id, it);
    return it;
  }

  function setModel(items) {
    byId.clear();
    rootItems = (Array.isArray(items) ? items : []).map((r) => norm(r, null));
  }
  setModel(o.items);

  const need = (id, caller) => {
    const it = typeof id === 'object' && id && byId.get(id.id) === id ? id : byId.get(id);
    if (!it) throw new Error(`Look.lkMenu.${caller}: item not found - "${id}"`);
    return it;
  };

  // --- Levels (one popup proxy + one menu element per nesting depth) --------------------
  const levels = [];
  let pointEl = null;
  let openFlag = false;
  let destroyed = false;
  let hoverTimer = null;
  let closeTimer = null;
  let typed = '';
  let typedTimer = null;

  function makeLevel(depth, gapMode) {
    const gap = depth === 0 ? (gapMode === 'point' ? 0 : 4) : 0;
    const proxy = lkPopupProxy(dummy, {
      content: '',
      placement: depth === 0 ? (o.placement || 'bottom-left') : 'right-top',
      gap,
      offsetY: depth === 0 ? 0 : -5,
      offsetX: depth === 0 ? 0 : -2,
      closeOnOutside: false,
      closeOnEscape: false,
      toggleOnTrigger: false,
      allowHtml: false,
      className: `lk-menu__panel${o.dense ? ' lk-menu__panel--dense' : ''}${o.className ? ` ${o.className}` : ''}`,
    });
    const menuEl = document.createElement('div');
    menuEl.className = 'lk-menu';
    if (o.dense) menuEl.classList.add('lk-menu--dense');
    menuEl.setAttribute('role', 'menu');
    menuEl.tabIndex = -1;
    menuEl.id = `${baseId}-l${depth}`;
    proxy.panelEl.replaceChildren(menuEl);   // live DOM — never setContent (it would clone and drop listeners)
    const lv = { depth, proxy, menuEl, items: [], owner: null, open: false, gapMode, handlers: null };
    lv.handlers = {
      click: (e) => onItemClick(lv, e),
      key: (e) => onItemKey(lv, e),
      over: (e) => onItemOver(lv, e),
      enter: () => { clearTimeout(closeTimer); },
      leave: () => { if (mode === 'hover') scheduleClose(); },
      ctx: (e) => e.preventDefault(),
    };
    menuEl.addEventListener('click', lv.handlers.click);
    menuEl.addEventListener('keydown', lv.handlers.key);
    menuEl.addEventListener('mouseover', lv.handlers.over);
    proxy.panelEl.addEventListener('mouseenter', lv.handlers.enter);
    proxy.panelEl.addEventListener('mouseleave', lv.handlers.leave);
    menuEl.addEventListener('contextmenu', lv.handlers.ctx);
    return lv;
  }

  function disposeLevel(lv) {
    lv.menuEl.removeEventListener('click', lv.handlers.click);
    lv.menuEl.removeEventListener('keydown', lv.handlers.key);
    lv.menuEl.removeEventListener('mouseover', lv.handlers.over);
    lv.proxy.panelEl.removeEventListener('mouseenter', lv.handlers.enter);
    lv.proxy.panelEl.removeEventListener('mouseleave', lv.handlers.leave);
    lv.menuEl.removeEventListener('contextmenu', lv.handlers.ctx);
    lv.proxy.destroy();
  }

  function ensureLevel(depth, gapMode) {
    let lv = levels[depth];
    if (lv && depth === 0 && lv.gapMode !== gapMode && !lv.open) { disposeLevel(lv); lv = null; }
    if (!lv) { lv = makeLevel(depth, gapMode); levels[depth] = lv; }
    return lv;
  }

  // --- Rendering ---------------------------------------------------------------------------
  function paintItem(it) {
    const el = it.el;
    if (!el) return;
    el.hidden = it.hidden;
    if (it.type === 'separator' || it.type === 'header') return;
    el.classList.toggle('lk-menu__item--disabled', it.disabled);
    if (it.disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    if (it.type === 'checkbox' || it.type === 'radio') {
      el.setAttribute('aria-checked', String(it.checked));
      el.classList.toggle('lk-menu__item--checked', it.checked);
    }
  }

  function buildItem(it, lead) {
    if (it.type === 'separator') {
      const s = document.createElement('div');
      s.className = 'lk-menu__separator';
      s.setAttribute('role', 'separator');
      it.el = s;
      s.hidden = it.hidden;
      return s;
    }
    if (it.type === 'header') {
      const h = document.createElement('div');
      h.className = 'lk-menu__header';
      h.setAttribute('role', 'presentation');
      h.textContent = it.text;
      it.el = h;
      h.hidden = it.hidden;
      return h;
    }
    const el = document.createElement('div');
    el.className = 'lk-menu__item';
    el.id = `${baseId}-e${++counter}`;
    el.setAttribute('role', it.type === 'checkbox' ? 'menuitemcheckbox' : it.type === 'radio' ? 'menuitemradio' : 'menuitem');
    el.tabIndex = -1;
    el.dataset.id = String(it.id);
    if (lead) {
      const l = document.createElement('span');
      l.className = 'lk-menu__lead';
      l.setAttribute('aria-hidden', 'true');
      if (it.type === 'checkbox' || it.type === 'radio') {
        const mark = document.createElement('span');
        mark.className = `lk-menu__mark lk-menu__mark--${it.type}`;
        if (it.type === 'checkbox') mark.appendChild(lkIcon('check', { size: 'sm' }));
        l.appendChild(mark);
      } else if (it.icon) l.appendChild(lkIcon(it.icon, { size: 'sm' }));
      el.appendChild(l);
    }
    const text = document.createElement('span');
    text.className = 'lk-menu__label';
    text.textContent = it.text;
    el.appendChild(text);
    if (it.shortcut) {
      const k = document.createElement('span');
      k.className = 'lk-menu__shortcut';
      k.setAttribute('aria-hidden', 'true');
      k.textContent = it.shortcut;
      el.setAttribute('aria-keyshortcuts', it.shortcut);
      el.appendChild(k);
    }
    if (it.items.length) {
      const c = document.createElement('span');
      c.className = 'lk-menu__caret';
      c.setAttribute('aria-hidden', 'true');
      c.appendChild(lkIcon('chevron-right', { size: 'sm' }));
      el.appendChild(c);
      el.setAttribute('aria-haspopup', 'menu');
      el.setAttribute('aria-expanded', 'false');
    }
    it.el = el;
    paintItem(it);
    return el;
  }

  function renderLevel(lv, items, owner) {
    lv.items = items;
    lv.owner = owner;
    items.forEach((it) => { it.el = null; });
    lv.menuEl.replaceChildren();
    const lead = items.some((it) => it.icon || it.type === 'checkbox' || it.type === 'radio');
    lv.menuEl.classList.toggle('lk-menu--lead', lead);
    items.forEach((it) => lv.menuEl.appendChild(buildItem(it, lead)));
    if (owner) lv.menuEl.setAttribute('aria-labelledby', owner.el.id); else {
      lv.menuEl.removeAttribute('aria-labelledby');
      lv.menuEl.setAttribute('aria-label', o.ariaLabel || tx.t('label'));
    }
  }

  function refresh() {
    if (destroyed) return;
    if (levels[0]) levels[0].menuEl.setAttribute('aria-label', o.ariaLabel || tx.t('label'));
  }

  // --- Focus helpers --------------------------------------------------------------------------
  const navigable = (lv) => lv.items.filter((it) => SELECTABLE.has(it.type) && !it.disabled && !it.hidden && it.el);
  const levelOfItem = (it) => levels.find((lv) => lv.items.includes(it));

  function focusItem(lv, it, focus = true) {
    lv.items.forEach((x) => { if (x.el && SELECTABLE.has(x.type)) x.el.tabIndex = x === it ? 0 : -1; });
    if (focus && it && it.el) it.el.focus({ preventScroll: true });
  }

  function itemOf(lv, e) {
    const el = e.target.closest ? e.target.closest('.lk-menu__item') : null;
    if (!el || !lv.menuEl.contains(el)) return null;
    return lv.items.find((x) => x.el === el) || null;
  }

  // --- Submenus ---------------------------------------------------------------------------------
  function closeFrom(depth) {
    for (let d = levels.length - 1; d >= depth; d--) {
      const lv = levels[d];
      if (!lv || !lv.open) continue;
      lv.open = false;
      if (lv.owner && lv.owner.el) {
        lv.owner.el.classList.remove('lk-menu__item--open');
        lv.owner.el.setAttribute('aria-expanded', 'false');
      }
      lv.proxy.hide('menu', 'api');
    }
  }

  function openSub(lv, it, focus) {
    if (!it.items.length || it.disabled) return;
    const next = levels[lv.depth + 1];
    if (next && next.open && next.owner === it) {
      if (focus === 'first') { const n = navigable(next); if (n[0]) focusItem(next, n[0]); }
      return;
    }
    closeFrom(lv.depth + 1);
    const sub = ensureLevel(lv.depth + 1);
    renderLevel(sub, it.items, it);
    sub.open = true;
    it.el.classList.add('lk-menu__item--open');
    it.el.setAttribute('aria-expanded', 'true');
    sub.proxy.show(it.el, 'api');
    sub.proxy.updatePosition(it.el);
    if (focus === 'first') { const n = navigable(sub); if (n[0]) focusItem(sub, n[0]); }
  }

  function onItemOver(lv, e) {
    const it = itemOf(lv, e);
    if (!it) return;
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    if (it.disabled) return;
    if (document.activeElement !== it.el) focusItem(lv, it);
    const deeper = levels[lv.depth + 1];
    if (it.items.length) {
      if (!(deeper && deeper.open && deeper.owner === it)) {
        hoverTimer = setTimeout(() => { if (!destroyed && openFlag) openSub(lv, it, null); }, o.hoverDelay != null ? o.hoverDelay : 120);
      }
    } else if (deeper && deeper.open) {
      hoverTimer = setTimeout(() => { if (!destroyed) closeFrom(lv.depth + 1); }, o.hoverDelay != null ? o.hoverDelay : 120);
    }
  }

  // --- Activation ----------------------------------------------------------------------------------
  function activateItem(it, source, event) {
    if (destroyed || it.disabled) return;
    const lv = levelOfItem(it);
    if (it.items.length) { if (lv) openSub(lv, it, source === 'key' ? 'first' : null); return; }
    if (!SELECTABLE.has(it.type)) return;
    const checked = it.type === 'checkbox' ? !it.checked : it.type === 'radio' ? true : undefined;
    const ctx = { source, component: comp, event, checked };
    guard(hostEl, o, 'action', it, ctx, () => {
      if (it.type === 'checkbox') { it.checked = checked; paintItem(it); }
      else if (it.type === 'radio') setRadio(it);
      if (it.onClick) it.onClick(event, { item: it, source, component: comp, checked });
      if (typeof o.onAction === 'function') o.onAction(it, ctx);
      if (!it.keepOpen && o.closeOnAction !== false && openFlag) requestClose('action', source === 'api' ? 'api' : source);
    });
  }

  function setRadio(it) {
    const siblings = it.parent ? it.parent.items : rootItems;
    siblings.forEach((s) => {
      if (s.type === 'radio' && s.group === it.group && s !== it) { s.checked = false; paintItem(s); }
    });
    it.checked = true;
    paintItem(it);
  }

  function onItemClick(lv, e) {
    const it = itemOf(lv, e);
    if (!it) return;
    e.preventDefault();
    activateItem(it, e.detail === 0 ? 'key' : 'click', e);
  }

  function onItemKey(lv, e) {
    const nav = navigable(lv);
    const curEl = e.target.closest ? e.target.closest('.lk-menu__item') : null;
    const cur = curEl ? lv.items.find((x) => x.el === curEl) : null;
    const i = cur ? nav.indexOf(cur) : -1;
    const key = e.key;
    let handled = true;
    if (key === 'ArrowDown') focusItem(lv, nav[nav.length ? (i + 1) % nav.length : 0]);
    else if (key === 'ArrowUp') focusItem(lv, nav[nav.length ? (i <= 0 ? nav.length - 1 : i - 1) : 0]);
    else if (key === 'Home') focusItem(lv, nav[0]);
    else if (key === 'End') focusItem(lv, nav[nav.length - 1]);
    else if (key === 'ArrowRight') { if (cur && cur.items.length) openSub(lv, cur, 'first'); }
    else if (key === 'ArrowLeft') {
      if (lv.depth > 0) {
        const owner = lv.owner;
        closeFrom(lv.depth);
        const parent = levels[lv.depth - 1];
        if (owner) focusItem(parent, owner);
      } else handled = false;
    } else if (key === 'Enter' || key === ' ') { if (cur) activateItem(cur, 'key', e); }
    else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      clearTimeout(typedTimer);
      typed += key.toLowerCase();
      typedTimer = setTimeout(() => { typed = ''; }, TYPEAHEAD_MS);
      const cycle = typed.length > 1 && typed.split('').every((c) => c === typed[0]);
      const needle = cycle ? typed[0] : typed;
      const start = typed.length > 1 && !cycle ? i : i + 1;
      const order = [...nav.slice(Math.max(0, start)), ...nav.slice(0, Math.max(0, start))];
      const hit = order.find((x) => x.text.toLowerCase().startsWith(needle));
      if (hit) focusItem(lv, hit);
      handled = key !== ' ' || !!hit;
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // --- Open / close ------------------------------------------------------------------------------------
  function point(x, y) {
    if (!pointEl) {
      pointEl = document.createElement('span');
      pointEl.className = 'lk-menu__point';
      pointEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(pointEl);
    }
    pointEl.style.position = 'fixed';
    pointEl.style.left = `${x}px`;
    pointEl.style.top = `${y}px`;
    pointEl.style.width = '0';
    pointEl.style.height = '0';
    pointEl.style.pointerEvents = 'none';
    return pointEl;
  }

  function panelEls() { return levels.filter((lv) => lv && lv.open).map((lv) => lv.proxy.panelEl); }

  function onDocPointer(e) {
    if (!openFlag) return;
    const t = e.target;
    if (panelEls().some((p) => p.contains(t))) return;
    if (triggerEl && mode !== 'contextmenu' && triggerEl.contains(t)) return;
    requestClose('outside', 'pointer');
  }

  function onDocKey(e) {
    if (!openFlag) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const deepest = levels.reduce((d, lv, idx) => (lv && lv.open ? idx : d), 0);
      if (deepest > 0) {
        const lv = levels[deepest];
        const owner = lv.owner;
        closeFrom(deepest);
        if (owner) focusItem(levels[deepest - 1], owner);
      } else requestClose('escape', 'key');
    } else if (e.key === 'Tab') {
      if (triggerEl && panelEls().some((p) => p.contains(document.activeElement))) triggerEl.focus({ preventScroll: true });
      requestClose('tab', 'key');
    }
  }

  function bindDoc() {
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onDocKey, true);
  }
  function unbindDoc() {
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('keydown', onDocKey, true);
  }

  function doOpen(spec, source) {
    if (destroyed || openFlag) return;
    const gapMode = spec.anchor ? 'anchor' : 'point';
    const lv = ensureLevel(0, gapMode);
    renderLevel(lv, rootItems, null);
    const anchor = spec.anchor || point(spec.x, spec.y);
    openFlag = true;
    lv.open = true;
    lv.proxy.show(anchor, 'api');
    lv.proxy.updatePosition(anchor);   // re-opened during the exit animation: the proxy would keep the old position
    if (triggerEl) {
      triggerEl.setAttribute('aria-expanded', 'true');
      triggerEl.setAttribute('aria-controls', lv.menuEl.id);
    }
    bindDoc();
    const nav = navigable(lv);
    if (spec.focus === 'first' && nav[0]) focusItem(lv, nav[0]);
    else if (spec.focus === 'last' && nav.length) focusItem(lv, nav[nav.length - 1]);
    else { if (nav[0]) focusItem(lv, nav[0], false); lv.menuEl.focus({ preventScroll: true }); }
    if (typeof o.onOpen === 'function') o.onOpen(comp);
  }

  function requestOpen(spec, source) {
    if (destroyed || openFlag) return;
    const ctx = { source, component: comp, anchor: spec.anchor || null, x: spec.x, y: spec.y };
    guard(hostEl, o, 'open', undefined, ctx, () => doOpen(spec, source));
  }

  function doClose(reason) {
    if (destroyed || !openFlag) return;
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    const hadFocus = panelEls().some((p) => p.contains(document.activeElement));
    openFlag = false;
    closeFrom(1);
    if (levels[0]) { levels[0].open = false; levels[0].proxy.hide(reason, 'api'); }
    unbindDoc();
    if (triggerEl) {
      triggerEl.setAttribute('aria-expanded', 'false');
      triggerEl.removeAttribute('aria-controls');
    }
    if (hadFocus && triggerEl && reason !== 'outside') triggerEl.focus({ preventScroll: true });
    if (typeof o.onClose === 'function') o.onClose(reason, comp);
  }

  function requestClose(reason, source) {
    if (destroyed || !openFlag) return;
    guard(hostEl, o, 'close', reason, { source, component: comp }, (payload) => doClose(typeof payload === 'string' ? payload : reason));
  }

  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!destroyed) requestClose('hover', 'pointer'); }, o.closeDelay != null ? o.closeDelay : 250);
  }

  // --- Trigger wiring ------------------------------------------------------------------------------------------
  const triggerAttrs = triggerEl ? {
    haspopup: triggerEl.getAttribute('aria-haspopup'),
    expanded: triggerEl.getAttribute('aria-expanded'),
    controls: triggerEl.getAttribute('aria-controls'),
  } : null;
  const listeners = [];
  const listen = (el, type, fn, opt) => { el.addEventListener(type, fn, opt); listeners.push(() => el.removeEventListener(type, fn, opt)); };

  if (triggerEl) {
    triggerEl.setAttribute('aria-haspopup', 'menu');
    triggerEl.setAttribute('aria-expanded', 'false');

    if (mode === 'click' || mode === 'hover') {
      listen(triggerEl, 'click', (e) => {
        if (openFlag) requestClose('toggle', 'click');
        else requestOpen({ anchor: triggerEl, focus: e.detail === 0 ? 'first' : null }, e.detail === 0 ? 'key' : 'click');
      });
      listen(triggerEl, 'keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        if (e.target !== triggerEl) return;
        e.preventDefault();
        const focus = e.key === 'ArrowUp' ? 'last' : 'first';
        if (openFlag) { const lv = levels[0]; const nav = navigable(lv); const t = focus === 'last' ? nav[nav.length - 1] : nav[0]; if (t) focusItem(lv, t); } else requestOpen({ anchor: triggerEl, focus }, 'key');
      });
    }
    if (mode === 'hover') {
      listen(triggerEl, 'mouseenter', () => {
        clearTimeout(closeTimer);
        clearTimeout(hoverTimer);
        if (!openFlag) hoverTimer = setTimeout(() => requestOpen({ anchor: triggerEl, focus: null }, 'hover'), o.hoverOpenDelay != null ? o.hoverOpenDelay : 100);
      });
      listen(triggerEl, 'mouseleave', () => { clearTimeout(hoverTimer); if (openFlag) scheduleClose(); });
    }
    if (mode === 'contextmenu') {
      listen(triggerEl, 'contextmenu', (e) => {
        e.preventDefault();
        const x = e.clientX;
        const y = e.clientY;
        if (openFlag) {
          closeFrom(1);
          point(x, y);
          levels[0].proxy.updatePosition(pointEl);
          const nav = navigable(levels[0]);
          if (nav[0]) focusItem(levels[0], nav[0], false);
          levels[0].menuEl.focus({ preventScroll: true });
          return;
        }
        requestOpen({ x, y, focus: null }, 'contextmenu');
      });
    }
  }

  // --- Public API --------------------------------------------------------------------------------------------------
  Object.defineProperty(comp, 'el', { get() { return levels[0] ? levels[0].menuEl : null; }, enumerable: true });
  Object.defineProperty(comp, 'triggerEl', { value: triggerEl, enumerable: true });
  Object.defineProperty(comp, 'isOpen', { get() { return openFlag; }, enumerable: true });
  Object.defineProperty(comp, 'items', { get() { return rootItems.slice(); }, enumerable: true });
  Object.defineProperty(comp, 'text', { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true });

  /**
   * Open the menu. `open(x, y)` at viewport coordinates, `open(element)` anchored to an element,
   * `open()` anchored to the trigger. Goes through beforeOpen with source 'api'.
   */
  comp.open = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') requestOpen({ x: a, y: b, focus: null }, 'api');
    else {
      const anchor = a && a.getBoundingClientRect ? a : (typeof a === 'string' ? document.querySelector(a) : triggerEl);
      if (!anchor) throw new Error('Look.lkMenu.open: pass coordinates, an element, or create the menu with a target');
      requestOpen({ anchor, focus: null }, 'api');
    }
  };
  comp.close = () => requestClose('api', 'api');
  comp.toggle = (a, b) => { if (openFlag) comp.close(); else comp.open(a, b); };

  /** Replace the items (the open menu re-renders in place). */
  comp.setItems = (items) => {
    setModel(items);
    if (openFlag && levels[0]) {
      closeFrom(1);
      renderLevel(levels[0], rootItems, null);
      levels[0].proxy.updatePosition();
    }
  };
  comp.get = (id) => byId.get(id) || null;
  /** Set a checkbox / radio item (silent). Radio items uncheck the others of their group. */
  comp.setChecked = (id, checked = true) => {
    const it = need(id, 'setChecked');
    if (it.type === 'radio') { if (checked) setRadio(it); else { it.checked = false; paintItem(it); } } else { it.checked = !!checked; paintItem(it); }
  };
  comp.enable = (id) => { const it = need(id, 'enable'); it.disabled = false; paintItem(it); };
  comp.disable = (id) => { const it = need(id, 'disable'); it.disabled = true; paintItem(it); };
  comp.show = (id) => { const it = need(id, 'show'); it.hidden = false; paintItem(it); };
  comp.hide = (id) => { const it = need(id, 'hide'); it.hidden = true; paintItem(it); };
  /** Activate an item as if clicked (source 'api'); guards and onAction run. */
  comp.activate = (id) => activateItem(need(id, 'activate'), 'api', undefined);

  comp.destroy = function () {
    if (destroyed) return;
    if (openFlag) doClose('destroy');
    destroyed = true;
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    clearTimeout(typedTimer);
    unbindDoc();
    listeners.splice(0).forEach((off) => off());
    levels.forEach((lv) => { if (lv) disposeLevel(lv); });
    levels.length = 0;
    if (pointEl) { pointEl.remove(); pointEl = null; }
    tx.destroy();
    if (triggerEl) {
      ['haspopup', 'expanded', 'controls'].forEach((k) => {
        const attr = `aria-${k}`;
        if (triggerAttrs[k] == null) triggerEl.removeAttribute(attr); else triggerEl.setAttribute(attr, triggerAttrs[k]);
      });
    }
  };

  return comp;
}
