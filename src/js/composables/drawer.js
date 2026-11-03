// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkDrawer — a side panel that slides in from an edge of the screen (modal sibling of lkDialog).
 *
 *   const drawer = Look.lkDrawer({
 *     side: 'right', size: 'md', title: 'Edit profile',
 *     content: { url: '/partials/profile.html' },
 *     buttons: [{ text: 'Cancel', closes: true }, { text: 'Save', type: 'primary', onClick: save }],
 *     onClose(reason) { … },
 *   });
 *   drawer.close();   drawer.toggle();   drawer.destroy();
 *
 * Modal (default): backdrop, focus trap and body scroll lock. `modal: false` gives a non-blocking
 * panel: no backdrop, no trap, the page stays usable. Open and close are keyframe animations
 * (slide + fade); `animation: 'calm'` (.lk-drawer--calm) fades only.
 *
 * @param {Object} [opts]
 * @param {string}  [opts.side='right']   — 'left' | 'right' | 'top' | 'bottom' | 'start' | 'end' (start / end follow the page direction at creation)
 * @param {string}  [opts.size='md']      — 'sm' | 'md' | 'lg' | 'full' or a CSS length (width for left/right, height for top/bottom)
 * @param {boolean} [opts.modal=true]
 * @param {boolean} [opts.closeOnEscape=true]
 * @param {boolean} [opts.closeOnBackdrop=true] — modal only
 * @param {boolean} [opts.closable=true]  — header close button
 * @param {string}  [opts.title]
 * @param {string|Node|Function|Object} [opts.content] — text | Node | (body, ctx) => … | { url, select, … } | { html } | { template }
 * @param {Node|Function} [opts.footer]   — Node, or (footerEl) => Node | text
 * @param {Array}   [opts.buttons]        — [{ text, type: 'primary'|'secondary'|'outline'|'ghost'|'negative', onClick(event, { component, button }), closes, disabled }]; onClick returning false keeps the drawer open
 * @param {boolean|Object} [opts.resizable=false] — drag handle on the inner edge; `{ min, max }` (px number or CSS length); keyboard: arrows (Shift = bigger steps), Home / End
 * @param {string}  [opts.animation]      — 'calm' to fade only
 * @param {boolean} [opts.dense=false]
 * @param {boolean} [opts.open=true]      — open immediately
 * @param {boolean} [opts.destroyOnClose=false]
 * @param {boolean} [opts.autoFocus=true]
 * @param {Element|string} [opts.opener]  — element that gets the focus back on close (default: the focused element at open)
 * @param {Element} [opts.mount=document.body]
 * @param {string}  [opts.className]
 * @param {Object}  [opts.text]           — per-instance text overrides (keys relative to 'drawer.' or absolute)
 * @param {Function} [opts.beforeOpen]    — guard ({ source, component })
 * @param {Function} [opts.beforeClose]   — guard (reason: 'escape'|'backdrop'|'close'|'button'|'api', { source, component }); false / Promise<false> keeps it open
 * @param {Function} [opts.beforeResize]  — guard (sizePx, { source: 'drag'|'key', component }); false stops, a number replaces
 * @param {Function} [opts.onOpen]    — (component)
 * @param {Function} [opts.onClose]   — (reason, component)
 * @param {Function} [opts.onResize]  — (sizePx, { source, component })
 * @param {Function} [opts.onLoad]    — (body, { component }) after async content is in place
 * @param {Function} [opts.onError]   — (error, { component }) when async content fails
 * @param {Function} [opts.onDestroy] — (component)
 * @returns {Object}
 */

import { lkFocusTrap } from '../behaviors/index.js';
import { lkIcon } from '../components/icon.js';
import { resolveEl } from '../helpers/base.js';
import { renderContent, contentUid } from '../helpers/content.js';
import { guard, guardSync } from '../helpers/guard.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { createPresenceController, readDurationMs, floatingZIndex } from '../helpers/motion.js';

lkI18n.define('drawer', {
  closeLabel: () => lkI18n.t('common.close'),
  label: 'Panel',
  resize: 'Resize panel',
});

const EXIT_MS = 220;
const SIDES = ['left', 'right', 'top', 'bottom'];
const NAMED_SIZES = ['sm', 'md', 'lg', 'full'];
const BASE_Z = 100;

const openStack = [];   // open drawers, topmost last
let lockCount = 0;
let savedOverflow = '';
let savedPadding = '';

function lockScroll() {
  if (lockCount === 0) {
    const body = document.body;
    savedOverflow = body.style.overflow;
    savedPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
  }
  lockCount += 1;
}

function unlockScroll() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPadding;
  }
}

function contentSpec(c) {
  if (c == null) return null;
  if (typeof c === 'object' && !(c instanceof Node)
    && (c.url != null || c.html != null || c.content != null || c.template != null)) return c;
  return { content: c };
}

function toPx(v, fallback, vertical) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'number') return v;
  const m = /^(-?[\d.]+)\s*(px|rem|em|%|vw|vh)?$/.exec(String(v).trim());
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  const view = vertical ? window.innerHeight : document.documentElement.clientWidth;
  switch (m[2]) {
    case 'rem': return n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    case 'em': return n * 16;
    case '%': return (n / 100) * view;
    case 'vw': return (n / 100) * document.documentElement.clientWidth;
    case 'vh': return (n / 100) * window.innerHeight;
    default: return n;
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function lkDrawer(opts = {}) {
  const options = {
    side: 'right', size: 'md', modal: true, closeOnEscape: true, closeOnBackdrop: true, closable: true,
    title: '', content: null, footer: null, buttons: null, resizable: false, animation: undefined,
    dense: false, open: true, destroyOnClose: false, autoFocus: true, opener: null,
    mount: document.body, className: '', text: null, ...opts,
  };

  const dir = getComputedStyle(document.documentElement).direction === 'rtl' || document.dir === 'rtl' ? 'rtl' : 'ltr';
  let side = options.side;
  if (side === 'start') side = dir === 'rtl' ? 'right' : 'left';
  else if (side === 'end') side = dir === 'rtl' ? 'left' : 'right';
  if (!SIDES.includes(side)) side = 'right';
  const vertical = side === 'top' || side === 'bottom';
  const calm = options.animation === 'calm';
  const modal = options.modal !== false;
  const sized = opts.size != null;
  const namedSize = NAMED_SIZES.includes(options.size) ? options.size : (options.size == null ? 'md' : null);

  const tx = bindText('drawer', options.text, () => refresh());
  const uid = contentUid('lk-drawer');

  // --- DOM -----------------------------------------------------------------------------

  const root = document.createElement('div');
  root.className = [
    'lk-drawer', `lk-drawer--${side}`, modal ? 'lk-drawer--modal' : 'lk-drawer--inline',
    namedSize ? `lk-drawer--${namedSize}` : '', sized ? 'lk-drawer--sized' : '',
    calm ? 'lk-drawer--calm' : '', options.dense ? 'lk-drawer--dense' : '', options.className,
  ].filter(Boolean).join(' ');
  root.hidden = true;
  if (!namedSize) root.style.setProperty('--lk-drawer-size', /^[\d.]+$/.test(String(options.size)) ? `${options.size}px` : String(options.size));

  const backdrop = modal ? document.createElement('div') : null;
  if (backdrop) backdrop.className = 'lk-drawer__backdrop';

  const panel = document.createElement('div');
  panel.className = 'lk-drawer__panel';
  panel.setAttribute('role', 'dialog');
  if (modal) panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('tabindex', '-1');

  const header = document.createElement('div');
  header.className = 'lk-drawer__header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'lk-drawer__title';
  titleEl.id = `${uid}-title`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'lk-drawer__close';
  closeBtn.appendChild(lkIcon('close'));
  header.appendChild(titleEl);
  if (options.closable !== false) header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'lk-drawer__body';
  const footerEl = document.createElement('div');
  footerEl.className = 'lk-drawer__footer';

  panel.append(header, body, footerEl);

  let handle = null;
  const rz = options.resizable ? (typeof options.resizable === 'object' ? options.resizable : {}) : null;
  if (rz) {
    handle = document.createElement('div');
    handle.className = 'lk-drawer__handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
    handle.setAttribute('tabindex', '0');
    panel.appendChild(handle);
  }

  if (backdrop) root.appendChild(backdrop);
  root.appendChild(panel);

  // --- State -----------------------------------------------------------------------------

  let isOpen = false;
  let destroyed = false;
  let destroyAfterHide = false;
  let previousFocus = null;
  let locked = false;
  let contentHandle = null;
  let comp = null;
  let dragging = null;
  const trap = modal ? lkFocusTrap(panel) : null;

  const presence = createPresenceController({
    element: root,
    visibleClass: 'lk-drawer--open',
    closingClass: 'lk-drawer--closing',
    exitMs: () => readDurationMs(root, '--lk-drawer-exit-duration', EXIT_MS) + 20,
    hideWithHiddenAttr: true,
    afterShow() { if (options.autoFocus !== false && isOpen) moveFocus(); },
    afterHide() {
      if (destroyAfterHide) { destroyAfterHide = false; destroy(); }
    },
  });

  // --- Rendering ---------------------------------------------------------------------------

  function renderTitle() {
    titleEl.textContent = options.title || '';
    header.hidden = !options.title && options.closable === false;
    if (options.title) { panel.setAttribute('aria-labelledby', titleEl.id); panel.removeAttribute('aria-label'); }
    else { panel.removeAttribute('aria-labelledby'); panel.setAttribute('aria-label', tx.t('label')); }
  }

  function refresh() {
    if (destroyed) return;
    closeBtn.setAttribute('aria-label', tx.t('closeLabel'));
    if (!options.title) panel.setAttribute('aria-label', tx.t('label'));
    if (handle) handle.setAttribute('aria-label', tx.t('resize'));
  }

  function renderBody() {
    contentHandle?.destroy();
    contentHandle = null;
    body.replaceChildren();
    const spec = contentSpec(options.content);
    if (!spec) return;
    contentHandle = renderContent(body, spec, {
      ctx: { component: comp },
      onLoad: (el) => options.onLoad?.(el, { component: comp }),
      onError: (error) => options.onError?.(error, { component: comp }),
    });
  }

  function renderFooter() {
    footerEl.replaceChildren();
    const f = options.footer;
    if (f != null) {
      const out = typeof f === 'function' ? f(footerEl) : f;
      if (out instanceof Node) footerEl.appendChild(out);
      else if (out != null && out !== undefined && typeof out !== 'object') footerEl.appendChild(document.createTextNode(String(out)));
    }
    (options.buttons || []).forEach((spec) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lk-btn lk-btn--${spec.type || 'secondary'}${options.dense ? ' lk-btn--sm' : ''}`;
      b.textContent = spec.text != null ? String(spec.text) : '';
      if (spec.disabled) b.disabled = true;
      b.addEventListener('click', (event) => {
        const r = spec.onClick?.(event, { component: comp, button: b });
        if (r === false) return;
        if (r && typeof r.then === 'function') { r.then((v) => { if (v !== false && spec.closes) close('button', 'user'); }, () => {}); return; }
        if (spec.closes) close('button', 'user');
      });
      footerEl.appendChild(b);
    });
    footerEl.hidden = !footerEl.childNodes.length;
  }

  // --- Open / close ------------------------------------------------------------------------

  function moveFocus() {
    const target = panel.querySelector('[autofocus]')
      || Array.from(panel.querySelectorAll(FOCUSABLE)).find((n) => n !== closeBtn && n !== handle && !n.closest('[hidden]'))
      || (options.closable !== false ? closeBtn : null)
      || panel;
    target.focus({ preventScroll: true });
  }

  function stack() {
    let z = BASE_Z;
    const opener = previousFocus && previousFocus.nodeType === 1 ? previousFocus : null;
    const above = opener ? floatingZIndex(opener, BASE_Z) : null;
    if (above != null) z = Math.max(z, above);
    const top = openStack[openStack.length - 1];
    if (top && top !== comp) z = Math.max(z, (parseInt(top.el.style.zIndex, 10) || BASE_Z) + 1);
    root.style.zIndex = String(z);
  }

  function open() {
    if (destroyed || isOpen) return comp;
    guard(root.isConnected ? root : options.mount, options, 'open', undefined, { source: 'api', component: comp }, doOpen);
    return comp;
  }

  function doOpen() {
    if (destroyed || isOpen) return;
    if (!root.isConnected) options.mount.appendChild(root);
    destroyAfterHide = false;
    previousFocus = (options.opener && resolveOpener(options.opener)) || document.activeElement;
    stack();
    isOpen = true;
    openStack.push(comp);
    if (modal && !locked) { lockScroll(); locked = true; }
    presence.show();
    options.onOpen?.(comp);
  }

  function resolveOpener(o) {
    return o instanceof Element ? o : document.querySelector(o);
  }

  function close(reason = 'api', source) {
    if (destroyed || !isOpen) return comp;
    const src = source || (reason === 'api' ? 'api' : 'user');
    guard(root, options, 'close', reason, { source: src, component: comp }, (next) => doClose(typeof next === 'string' ? next : reason));
    return comp;
  }

  function doClose(reason) {
    if (destroyed || !isOpen) return;
    isOpen = false;
    destroyAfterHide = !!options.destroyOnClose;
    const at = openStack.indexOf(comp);
    if (at !== -1) openStack.splice(at, 1);
    if (locked) { unlockScroll(); locked = false; }
    presence.hide();
    const back = previousFocus;
    previousFocus = null;
    if (back && typeof back.focus === 'function' && back.isConnected) back.focus({ preventScroll: true });
    options.onClose?.(reason, comp);
  }

  // --- Events ---------------------------------------------------------------------------------

  function onBackdropClick(e) {
    if (e.target === backdrop && options.closeOnBackdrop !== false) close('backdrop', 'user');
  }

  // Capture phase on document: runs before the bubble listeners of dialogs underneath, and stops
  // the event so they do not close as well. Floating layers (dropdown / popup) inside get the key first.
  function onKeydown(e) {
    if (e.key !== 'Escape' || !isOpen || !options.closeOnEscape || e.defaultPrevented) return;
    const t = e.target;
    const inside = t instanceof Node && panel.contains(t);
    if (!inside) {
      if (!modal) return;
      if (openStack[openStack.length - 1] !== comp) return;
      if (t instanceof Element && t.closest('.lk-composable-dialog, .lk-modal-overlay, .lk-dropdown__panel, .lk-popup, [role="dialog"], [role="listbox"], [role="menu"]')) return;
    }
    if (panel.querySelector('.lk-dropdown__trigger--open, [aria-haspopup][aria-expanded="true"]') && t instanceof Element && !t.closest('.lk-drawer__header')) {
      // a dropdown / popup anchored inside the drawer is open: it closes first
      return;
    }
    if (t instanceof Element && t.closest('.lk-dropdown__panel, .lk-popup')) return;
    e.stopPropagation();
    close('escape', 'user');
  }

  // --- Resizing ---------------------------------------------------------------------------------

  const minPx = () => toPx(rz?.min, 240, vertical);
  const maxPx = () => toPx(rz?.max, (vertical ? window.innerHeight : document.documentElement.clientWidth) * 0.9, vertical);
  const currentPx = () => (vertical ? panel.offsetHeight : panel.offsetWidth);

  function syncHandleAria() {
    if (!handle) return;
    handle.setAttribute('aria-valuemin', String(Math.round(minPx())));
    handle.setAttribute('aria-valuemax', String(Math.round(maxPx())));
    handle.setAttribute('aria-valuenow', String(Math.round(currentPx())));
  }

  function applySize(px, source) {
    const clamped = Math.min(maxPx(), Math.max(minPx(), px));
    const g = guardSync(root, options, 'resize', clamped, { source, component: comp });
    if (!g.allowed) return;
    const next = Math.min(maxPx(), Math.max(minPx(), Number(g.payload) || clamped));
    panel.style.setProperty('--lk-drawer-size', `${next}px`);
    root.classList.add('lk-drawer--sized');
    syncHandleAria();
    options.onResize?.(next, { source, component: comp });
  }

  function onHandleDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    handle.setPointerCapture?.(e.pointerId);
    root.classList.add('lk-drawer--resizing');
    syncHandleAria();
  }

  function onHandleMove(e) {
    if (!dragging) return;
    const vw = document.documentElement.clientWidth;
    const px = side === 'left' ? e.clientX : side === 'right' ? vw - e.clientX : side === 'top' ? e.clientY : window.innerHeight - e.clientY;
    applySize(px, 'drag');
  }

  function onHandleUp(e) {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture?.(e.pointerId);
    root.classList.remove('lk-drawer--resizing');
  }

  function onHandleKey(e) {
    const step = e.shiftKey ? 64 : 16;
    const grow = { left: 'ArrowRight', right: 'ArrowLeft', top: 'ArrowDown', bottom: 'ArrowUp' }[side];
    const shrink = { left: 'ArrowLeft', right: 'ArrowRight', top: 'ArrowUp', bottom: 'ArrowDown' }[side];
    let px = null;
    if (e.key === grow) px = currentPx() + step;
    else if (e.key === shrink) px = currentPx() - step;
    else if (e.key === 'Home') px = minPx();
    else if (e.key === 'End') px = maxPx();
    if (px == null) return;
    e.preventDefault();
    applySize(px, 'key');
  }

  // --- API -----------------------------------------------------------------------------------------

  function destroy() {
    if (destroyed) return;
    const wasOpen = isOpen;
    destroyed = true;
    isOpen = false;
    destroyAfterHide = false;
    const at = openStack.indexOf(comp);
    if (at !== -1) openStack.splice(at, 1);
    if (locked) { unlockScroll(); locked = false; }
    presence.destroy();
    tx.destroy();
    contentHandle?.destroy();
    contentHandle = null;
    trap?.destroy();
    document.removeEventListener('keydown', onKeydown, true);
    backdrop?.removeEventListener('click', onBackdropClick);
    closeBtn.removeEventListener('click', onCloseClick);
    if (handle) {
      handle.removeEventListener('pointerdown', onHandleDown);
      handle.removeEventListener('pointermove', onHandleMove);
      handle.removeEventListener('pointerup', onHandleUp);
      handle.removeEventListener('pointercancel', onHandleUp);
      handle.removeEventListener('keydown', onHandleKey);
    }
    root.remove();
    options.onDestroy?.(comp);
    if (wasOpen && previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function onCloseClick() { close('close', 'user'); }

  comp = {
    el: root,
    panelEl: panel,
    headerEl: header,
    titleEl,
    bodyEl: body,
    footerEl,
    handleEl: handle,
    get isOpen() { return isOpen; },
    get side() { return side; },
    open,
    close(reason) { return close(reason || 'api', 'api'); },
    toggle() { return isOpen ? close('api', 'api') : open(); },
    setTitle(t) { options.title = t == null ? '' : String(t); renderTitle(); return comp; },
    setContent(c) { options.content = c; renderBody(); return comp; },
    setFooter(f) { options.footer = f; options.buttons = null; renderFooter(); return comp; },
    get size() { return currentPx(); },
    set size(v) {
      const px = toPx(v, null, vertical);
      if (px == null) return;
      panel.style.setProperty('--lk-drawer-size', `${px}px`);
      root.classList.add('lk-drawer--sized');
      syncHandleAria();
    },
    get text() { return tx.get(); },
    set text(v) { tx.set(v); },
    destroy,
  };

  renderTitle();
  refresh();
  renderBody();
  renderFooter();
  if (!options.mount.contains(root)) options.mount.appendChild(root);

  document.addEventListener('keydown', onKeydown, true);
  backdrop?.addEventListener('click', onBackdropClick);
  closeBtn.addEventListener('click', onCloseClick);
  if (handle) {
    handle.addEventListener('pointerdown', onHandleDown);
    handle.addEventListener('pointermove', onHandleMove);
    handle.addEventListener('pointerup', onHandleUp);
    handle.addEventListener('pointercancel', onHandleUp);
    handle.addEventListener('keydown', onHandleKey);
  }

  if (options.open !== false) open();
  return comp;
}
