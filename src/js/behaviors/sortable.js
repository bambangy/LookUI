// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// lkSortable — drag-to-reorder behavior (Pointer Events, keyboard accessible, no HTML5 DnD)

import { resolveEl } from '../helpers/base.js';
import { guard, guardSync } from '../helpers/guard.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { readDurationMs } from '../helpers/motion.js';

lkI18n.define('sortable', {
  hint: 'Press Space or Enter to pick up, the arrow keys to move, Space or Enter to drop, Escape to cancel.',
  roleDescription: 'sortable item',
  pickedUp: 'Picked up {item}. Position {from} of {total}. Use the arrow keys to move it.',
  moved: 'Moved to position {to} of {total}',
  dropped: 'Dropped {item} at position {to} of {total}',
  cancelled: 'Cancelled. {item} stays at position {from} of {total}',
});

const GHOST = 'lk-sortable__ghost';
const PLACEHOLDER = 'lk-sortable__placeholder';
const PICKED = 'lk-sortable__item--picked';
const HANDLE = 'lk-sortable__handle';
const SCROLL_ZONE = 40;
const SCROLL_SPEED = 14;

const registry = new Map();   // group name -> Set<inst>
let active = null;            // the single running drag / keyboard session
let uid = 0;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function emit(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Look.lkSortable: callback threw', err);
    return undefined;
  }
}

function animMs(inst) {
  if (reducedMotion()) return 0;
  const o = inst.opts.animation;
  if (typeof o === 'number') return Math.max(0, o);
  return readDurationMs(inst.el, '--lk-duration-fast', 180);
}

function easing(inst) {
  const v = typeof getComputedStyle === 'function' ? getComputedStyle(inst.el).getPropertyValue('--lk-easing-default').trim() : '';
  return v || 'ease';
}

// ---------------------------------------------------------------- items

function itemsOf(inst) {
  const sel = inst.opts.items;
  return Array.from(inst.el.children).filter((c) => !c.classList.contains(GHOST) && (!sel || c.matches(sel)));
}

function closestItem(inst, node) {
  let n = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (n && n !== inst.el) {
    if (n.parentElement === inst.el) {
      return !inst.opts.items || n.matches(inst.opts.items) ? n : null;
    }
    n = n.parentElement;
  }
  return null;
}

function focusTarget(inst, item) {
  if (!inst.opts.handle) return item;
  return item.querySelector(inst.opts.handle) || item;
}

function itemId(el, i) {
  const id = el.getAttribute('data-id');
  return id == null ? i : id;
}

function labelOf(el, i) {
  const l = el.getAttribute('aria-label') || (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return l || String(itemId(el, i));
}

function isNativelyFocusable(el) {
  return /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.hasAttribute('tabindex');
}

function isEditable(el) {
  return !!(el.closest && el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

// ---------------------------------------------------------------- prepare (a11y attributes), restored on destroy

function prepare(inst) {
  if (inst.destroyed) return;
  const hintId = inst.hintEl.id;
  itemsOf(inst).forEach((item) => {
    const target = focusTarget(inst, item);
    if (!inst.prepared.has(target)) {
      inst.prepared.set(target, {
        tabindex: target.getAttribute('tabindex'),
        role: target.getAttribute('aria-roledescription'),
        desc: target.getAttribute('aria-describedby'),
        handleClass: target.classList.contains(HANDLE),
      });
    }
    if (!isNativelyFocusable(target)) target.setAttribute('tabindex', '0');
    target.setAttribute('aria-roledescription', inst.tx.t('roleDescription'));
    const desc = inst.prepared.get(target).desc;
    const ids = desc ? desc.split(/\s+/) : [];
    if (!ids.includes(hintId)) ids.push(hintId);
    target.setAttribute('aria-describedby', ids.join(' '));
    if (inst.opts.handle && target !== item) target.classList.add(HANDLE);
  });
}

function unprepare(inst) {
  inst.prepared.forEach((orig, el) => {
    const put = (name, v) => { if (v == null) el.removeAttribute(name); else el.setAttribute(name, v); };
    put('tabindex', orig.tabindex);
    put('aria-roledescription', orig.role);
    put('aria-describedby', orig.desc);
    if (!orig.handleClass) el.classList.remove(HANDLE);
    if (!el.getAttribute('class')) el.removeAttribute('class');
  });
  inst.prepared.clear();
}

function announce(inst, message) {
  if (!inst.liveEl) return;
  inst.liveEl.textContent = '';
  inst.liveEl.textContent = message;
}

// ---------------------------------------------------------------- FLIP animation

function animateFlip(inst, lists, mutate, skip) {
  const ms = animMs(inst);
  const els = lists.flat();
  const before = ms ? new Map(els.map((el) => [el, el.getBoundingClientRect()])) : null;
  if (ms) els.forEach((el) => { const a = inst.anims.get(el); if (a) a.cancel(); });
  mutate();
  if (!ms) return;
  const ease = easing(inst);
  els.forEach((el) => {
    if (el === skip || !el.isConnected || typeof el.animate !== 'function') return;
    const b = before.get(el);
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const anim = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms, easing: ease });
    inst.anims.set(el, anim);
    anim.onfinish = () => { if (inst.anims.get(el) === anim) inst.anims.delete(el); };
  });
}

// ---------------------------------------------------------------- group helpers

function canPull(inst, item) {
  const p = inst.group.pull;
  return typeof p === 'function' ? p(item, inst.comp) !== false : p !== false;
}

function canPut(inst, item, from) {
  const p = inst.group.put;
  return typeof p === 'function' ? p(item, from.comp) !== false : p !== false;
}

function candidates(sess) {
  const src = sess.src;
  const out = [src];
  if (src.group.name) {
    (registry.get(src.group.name) || new Set()).forEach((c) => {
      if (c !== src && !c.disabled && !c.destroyed && canPull(src, sess.item) && canPut(c, sess.item, src)) out.push(c);
    });
  }
  return out;
}

function detectDirection(inst) {
  const forced = inst.opts.direction;
  if (forced === 'vertical' || forced === 'horizontal' || forced === 'grid') return forced;
  const els = itemsOf(inst).slice(0, 8);
  if (els.length < 2) {
    const cs = getComputedStyle(inst.el);
    return cs.display.includes('flex') && cs.flexDirection.startsWith('row') ? 'horizontal' : 'vertical';
  }
  const rects = els.map((e) => e.getBoundingClientRect());
  const r0 = rects[0];
  const same = rects.filter((r) => Math.abs(r.top - r0.top) < r0.height / 2);
  if (same.length === 1) return 'vertical';
  if (same.length === rects.length) return 'horizontal';
  return 'grid';
}

// ---------------------------------------------------------------- session

function beginSession(inst, item, source) {
  const list = itemsOf(inst);
  const sess = {
    inst, src: inst, cur: inst, item, source,
    originParent: item.parentNode, originNext: item.nextSibling,
    from: list.indexOf(item), fromTotal: list.length,
    dirs: new Map(), last: { x: 0, y: 0 }, dirty: false, raf: 0, ghost: null, cleanups: [],
    deciding: false,
  };
  active = sess;
  sess.cands = candidates(sess);
  sess.cands.forEach((c) => { sess.dirs.set(c, detectDirection(c)); c.el.classList.add('lk-sortable--dragging'); });
  inst.el.classList.add('lk-sortable--source');
  return sess;
}

function buildGhost(sess, x, y) {
  const { item, src } = sess;
  const rect = item.getBoundingClientRect();
  const parent = item.parentElement;
  const hostTag = parent.tagName;
  const clone = item.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.classList.remove(PLACEHOLDER, PICKED);
  clone.removeAttribute('tabindex');

  let root;
  let host;
  if (hostTag === 'TBODY' || hostTag === 'THEAD' || hostTag === 'TFOOT') {
    root = document.createElement('table');
    const table = parent.closest('table');
    if (table) root.className = table.className.replace(/\blk-sortable\b/, '');
    host = document.createElement(hostTag.toLowerCase());
    host.className = parent.className;
    root.appendChild(host);
    const srcCells = Array.from(item.children);
    Array.from(clone.children).forEach((c, i) => {
      if (srcCells[i]) c.style.width = `${srcCells[i].getBoundingClientRect().width}px`;
    });
    root.style.tableLayout = 'fixed';
    root.style.borderCollapse = 'collapse';
  } else {
    host = document.createElement(hostTag.toLowerCase());
    host.className = parent.className;
    root = host;
  }
  host.classList.remove('lk-sortable', 'lk-sortable--dragging', 'lk-sortable--source', 'lk-sortable--over');
  root.classList.add(GHOST);
  host.appendChild(clone);
  const s = root.style;
  s.position = 'fixed';
  s.left = '0';
  s.top = '0';
  s.margin = '0';
  s.width = `${rect.width}px`;
  s.height = `${rect.height}px`;
  s.boxSizing = 'border-box';
  clone.style.margin = '0';
  clone.style.width = '100%';
  clone.style.boxSizing = 'border-box';
  if (root === host) {
    s.padding = '0'; s.border = '0'; s.background = 'none'; s.boxShadow = 'none'; s.display = 'block'; s.overflow = 'visible';
  } else {
    host.style.display = 'table-row-group';
  }
  s.pointerEvents = 'none';
  s.zIndex = 'var(--lk-z-toast)';
  sess.grab = { x: x - rect.left, y: y - rect.top };
  sess.ghost = root;
  src.ghosts.add(root);
  moveGhost(sess, x, y);
  document.body.appendChild(root);
}

function moveGhost(sess, x, y) {
  if (!sess.ghost) return;
  sess.ghost.style.transform = `translate3d(${x - sess.grab.x}px, ${y - sess.grab.y}px, 0)`;
}

function moveItem(sess, target, ref) {
  const { item } = sess;
  const prev = sess.cur;
  const lists = [itemsOf(prev)];
  if (target !== prev) lists.push(itemsOf(target));
  animateFlip(target, lists, () => {
    target.el.insertBefore(item, ref);
  }, target !== prev ? item : null);
  if (target !== prev) {
    prev.el.classList.remove('lk-sortable--over');
    sess.cur = target;
  }
  if (target !== sess.src) target.el.classList.add('lk-sortable--over');
}

function placement(sess) {
  const { x, y } = sess.last;
  let hit = null;
  let hitArea = Infinity;
  sess.cands.forEach((c) => {
    const r = c.el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      const area = r.width * r.height;
      if (area < hitArea) { hit = c; hitArea = area; }
    }
  });
  if (!hit) return;

  const list = itemsOf(hit);
  if (list.length === 0 || (list.length === 1 && list[0] === sess.item && hit !== sess.cur)) {
    moveItem(sess, hit, null);
    return;
  }
  let best = null;
  let bestD = Infinity;
  list.forEach((el) => {
    const r = el.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = dx * dx + dy * dy;
    // the dragged item wins ties so hovering its own slot never swaps
    if (d < bestD || (d === bestD && el === sess.item)) { best = el; bestD = d; }
  });
  if (!best || (best === sess.item && hit === sess.cur)) return;
  if (best === sess.item) return;
  const r = best.getBoundingClientRect();
  const dir = sess.dirs.get(hit) || 'vertical';
  const after = dir === 'vertical' ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
  const ref = after ? best.nextSibling : best;
  if (hit === sess.cur && (ref === sess.item || ref === sess.item.nextSibling)) return;
  moveItem(sess, hit, ref);
}

function scrollParents(el) {
  const out = [];
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const y = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight;
    const x = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth;
    if (x || y) out.push({ n, x, y });
  }
  return out;
}

function edgeDelta(pos, start, end) {
  if (pos - start < SCROLL_ZONE) return -Math.max(1, Math.round(SCROLL_SPEED * (1 - (pos - start) / SCROLL_ZONE)));
  if (end - pos < SCROLL_ZONE) return Math.max(1, Math.round(SCROLL_SPEED * (1 - (end - pos) / SCROLL_ZONE)));
  return 0;
}

function autoScroll(sess) {
  const { x, y } = sess.last;
  let scrolled = false;
  scrollParents(sess.cur.el).forEach(({ n, x: cx, y: cy }) => {
    const r = n.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
    const dy = cy ? edgeDelta(y, r.top, r.bottom) : 0;
    const dx = cx ? edgeDelta(x, r.left, r.right) : 0;
    if (dy) { const o = n.scrollTop; n.scrollTop += dy; if (n.scrollTop !== o) scrolled = true; }
    if (dx) { const o = n.scrollLeft; n.scrollLeft += dx; if (n.scrollLeft !== o) scrolled = true; }
  });
  if (!scrolled) {
    const dy = edgeDelta(y, 0, window.innerHeight);
    const dx = edgeDelta(x, 0, window.innerWidth);
    if (dx || dy) {
      const ox = window.scrollX; const oy = window.scrollY;
      window.scrollBy(dx, dy);
      if (window.scrollX !== ox || window.scrollY !== oy) scrolled = true;
    }
  }
  return scrolled;
}

function loop(sess) {
  if (active !== sess || sess.deciding) return;
  const scrolled = autoScroll(sess);
  if (sess.dirty || scrolled) { sess.dirty = false; placement(sess); }
  sess.raf = requestAnimationFrame(() => loop(sess));
}

// ---------------------------------------------------------------- ending a session

function orderOf(inst) {
  return itemsOf(inst).map((el, i) => itemId(el, i));
}

function removeGhost(inst, ghost) {
  if (!ghost) return;
  if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
  inst.ghosts.delete(ghost);
}

function teardown(sess, cancelled, opts = {}) {
  sess.cleanups.forEach((fn) => fn());
  sess.cleanups = [];
  cancelAnimationFrame(sess.raf);
  if (active === sess) active = null;
  sess.cands.forEach((c) => c.el.classList.remove('lk-sortable--dragging', 'lk-sortable--over'));
  sess.src.el.classList.remove('lk-sortable--source');
  document.body.classList.remove('lk-sortable-dragging');
  sess.item.classList.remove(PICKED);

  const ghost = sess.ghost;
  const finishVisual = () => {
    sess.item.classList.remove(PLACEHOLDER);
    if (!sess.item.getAttribute('class')) sess.item.removeAttribute('class');
    removeGhost(sess.src, ghost);
  };
  if (ghost && !opts.silent && animMs(sess.src) && typeof ghost.animate === 'function') {
    const r = sess.item.getBoundingClientRect();
    const ms = animMs(sess.src);
    const cur = ghost.style.transform;
    const anim = ghost.animate(
      [{ transform: cur, scale: '1.02' }, { transform: `translate3d(${r.left}px, ${r.top}px, 0)`, scale: '1' }],
      { duration: ms, easing: easing(sess.src), fill: 'forwards' },
    );
    let done = false;
    const end = () => { if (done) return; done = true; finishVisual(); };
    anim.onfinish = end;
    setTimeout(end, ms + 60);
  } else {
    finishVisual();
  }
  if (!opts.silent) {
    const ev = { item: sess.item, cancelled, source: sess.source, component: sess.src.comp };
    emit(sess.src.opts.onEnd, ev);
    if (sess.cur !== sess.src) emit(sess.cur.opts.onEnd, { ...ev, component: sess.cur.comp });
  }
}

function revert(sess) {
  const { item, originParent, originNext, src } = sess;
  const prev = sess.cur;
  const lists = [itemsOf(prev)];
  if (prev !== src) lists.push(itemsOf(src));
  animateFlip(src, lists, () => {
    originParent.insertBefore(item, originNext && originNext.parentNode === originParent ? originNext : null);
  }, prev !== src ? item : null);
  sess.cur = src;
}

function cancelSession(sess, silent) {
  if (!sess || sess.finished) return;
  sess.finished = true;
  revert(sess);
  if (sess.source === 'key' && !silent) {
    announce(sess.src, sess.src.tx.t('cancelled', { item: labelOf(sess.item, sess.from), from: sess.from + 1, total: sess.fromTotal }));
  }
  teardown(sess, true, { silent });
}

function dropSession(sess) {
  if (sess.finished) return;
  const { src, cur, item } = sess;
  const list = itemsOf(cur);
  const to = list.indexOf(item);
  const changed = !(cur === src && to === sess.from);
  if (!changed) {
    sess.finished = true;
    if (sess.source === 'key') announce(src, src.tx.t('dropped', { item: labelOf(item, to), to: to + 1, total: list.length }));
    teardown(sess, false);
    return;
  }
  sess.deciding = true;
  cancelAnimationFrame(sess.raf);
  const payload = { item, from: sess.from, to, fromContainer: src.el, toContainer: cur.el };
  const insts = cur === src ? [src] : [src, cur];

  const commit = () => {
    if (sess.finished) return;
    sess.finished = true;
    insts.forEach((inst) => {
      emit(inst.opts.onChange, orderOf(inst), { source: sess.source, component: inst.comp, ...payload });
    });
    if (sess.source === 'key') announce(src, src.tx.t('dropped', { item: labelOf(item, to), to: to + 1, total: list.length }));
    teardown(sess, false);
    insts.forEach((inst) => prepare(inst));
  };
  const veto = () => {
    if (sess.finished) return;
    sess.finished = true;
    revert(sess);
    if (sess.source === 'key') announce(src, src.tx.t('cancelled', { item: labelOf(item, sess.from), from: sess.from + 1, total: sess.fromTotal }));
    teardown(sess, true);
  };

  // origin first, then the destination when it is another container
  const run = (i) => {
    if (i >= insts.length) { commit(); return; }
    const inst = insts[i];
    const r = guard(inst.el, inst.opts, 'change', payload, { source: sess.source, component: inst.comp }, () => run(i + 1));
    if (r === false) veto();
    else if (r && typeof r.then === 'function') r.then((ok) => { if (ok === false) veto(); });
  };
  run(0);
}

// ---------------------------------------------------------------- pointer drag

function startPointerSession(pend, x, y) {
  const { inst, item } = pend;
  const g = guardSync(inst.el, inst.opts, 'start', undefined, { item, source: 'drag', component: inst.comp });
  if (!g.allowed) return false;
  const sess = beginSession(inst, item, 'drag');
  sess.last = { x, y };
  buildGhost(sess, x, y);
  item.classList.add(PLACEHOLDER);
  document.body.classList.add('lk-sortable-dragging');
  // swallow the click that follows a drag
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  document.addEventListener('click', swallow, true);
  const timer = setTimeout(() => document.removeEventListener('click', swallow, true), 400);
  sess.cleanups.push(() => { setTimeout(() => { clearTimeout(timer); document.removeEventListener('click', swallow, true); }, 60); });
  const noSelect = (e) => e.preventDefault();
  document.addEventListener('selectstart', noSelect, true);
  sess.cleanups.push(() => document.removeEventListener('selectstart', noSelect, true));
  emit(inst.opts.onStart, { item, source: 'drag', component: inst.comp });
  loop(sess);
  return sess;
}

function onPointerDown(inst, e) {
  if (inst.disabled || inst.destroyed || active) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.isPrimary === false) return;
  const item = closestItem(inst, e.target);
  if (!item) return;
  const o = inst.opts;
  if (o.handle) {
    const h = e.target.closest(o.handle);
    if (!h || !item.contains(h)) return;
  } else if (isEditable(e.target)) return;
  if (o.filter && (item.matches(o.filter) || (e.target.closest && item.contains(e.target.closest(o.filter))))) return;

  const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
  const delay = typeof o.delay === 'number' ? o.delay : (touch && !o.handle ? 200 : 0);
  const threshold = typeof o.threshold === 'number' ? o.threshold : (touch ? 8 : 4);
  const st = { inst, item, id: e.pointerId, x0: e.clientX, y0: e.clientY, ready: delay === 0, sess: null, timer: 0 };
  const offs = [];
  const listen = (target, type, fn, o2) => { target.addEventListener(type, fn, o2); offs.push(() => target.removeEventListener(type, fn, o2)); };

  const stop = () => {
    clearTimeout(st.timer);
    offs.forEach((f) => f());
    offs.length = 0;
    inst.pending = null;
  };
  inst.pending = stop;

  const onMove = (ev) => {
    if (ev.pointerId !== st.id) return;
    if (st.sess) {
      st.sess.last = { x: ev.clientX, y: ev.clientY };
      moveGhost(st.sess, ev.clientX, ev.clientY);
      if (!st.sess.deciding) placement(st.sess);
      return;
    }
    const dist = Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0);
    if (!st.ready) { if (dist > threshold) stop(); return; }
    if (dist >= threshold) {
      const s = startPointerSession(st, ev.clientX, ev.clientY);
      if (!s) { stop(); return; }
      st.sess = s;
      s.cleanups.push(stop);
    }
  };
  const onUp = (ev) => {
    if (ev.pointerId !== st.id) return;
    const s = st.sess;
    stop();
    if (s) dropSession(s);
  };
  const onCancel = (ev) => {
    if (ev.pointerId !== st.id) return;
    const s = st.sess;
    stop();
    if (s) cancelSession(s);
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape' && st.sess) {
      ev.preventDefault();
      ev.stopPropagation();
      const s = st.sess;
      stop();
      cancelSession(s);
    }
  };
  listen(document, 'pointermove', onMove, true);
  listen(document, 'pointerup', onUp, true);
  listen(document, 'pointercancel', onCancel, true);
  listen(document, 'keydown', onKey, true);
  if (touch) {
    listen(document, 'touchmove', (ev) => { if ((st.ready || st.sess) && ev.cancelable) ev.preventDefault(); }, { passive: false });
    listen(document, 'contextmenu', (ev) => ev.preventDefault(), true);
  }
  if (delay > 0) {
    st.timer = setTimeout(() => { st.ready = true; }, delay);
  }
}

// ---------------------------------------------------------------- keyboard

function neighbour(sess, dir) {
  const list = sess.cands.filter((c) => !c.destroyed);
  list.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const i = list.indexOf(sess.cur);
  return list[i + dir] || null;
}

function onKeyDown(inst, e) {
  if (inst.disabled || inst.destroyed) return;
  const item = closestItem(inst, e.target);
  if (!item || e.target !== focusTarget(inst, item)) return;
  const sess = active && active.source === 'key' && active.item === item ? active : null;
  const o = inst.opts;

  if (!sess) {
    if (active || (e.key !== ' ' && e.key !== 'Enter')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (o.filter && item.matches(o.filter)) return;
    const g = guardSync(inst.el, o, 'start', undefined, { item, source: 'key', component: inst.comp });
    e.preventDefault();
    if (!g.allowed) return;
    const s = beginSession(inst, item, 'key');
    item.classList.add(PICKED);
    const target = e.target;
    const onBlur = () => {
      setTimeout(() => {
        if (active === s && !s.refocusing && document.activeElement !== target) cancelSession(s);
      }, 0);
    };
    target.addEventListener('focusout', onBlur);
    s.cleanups.push(() => target.removeEventListener('focusout', onBlur));
    emit(o.onStart, { item, source: 'key', component: inst.comp });
    announce(inst, inst.tx.t('pickedUp', { item: labelOf(item, s.from), from: s.from + 1, total: s.fromTotal }));
    return;
  }

  const key = e.key;
  if (key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelSession(sess); return; }
  if (key === ' ' || key === 'Enter') { e.preventDefault(); dropSession(sess); return; }

  const dir = sess.dirs.get(sess.cur) || 'vertical';
  let delta = 0;
  let cross = 0;
  if (key === 'ArrowUp') delta = -1;
  else if (key === 'ArrowDown') delta = 1;
  else if (key === 'ArrowLeft') { if (dir === 'vertical') cross = -1; else delta = -1; }
  else if (key === 'ArrowRight') { if (dir === 'vertical') cross = 1; else delta = 1; }
  else if (key === 'Home' || key === 'End') delta = key === 'Home' ? -Infinity : Infinity;
  else return;
  e.preventDefault();

  const kbMove = (fn) => {
    sess.refocusing = true;
    fn();
    sess.item.classList.add(PICKED);
    const t = focusTarget(sess.cur, sess.item);
    if (typeof t.focus === 'function') t.focus({ preventScroll: true });
    sess.refocusing = false;
  };

  if (cross) {
    const next = neighbour(sess, cross);
    if (!next) return;
    const idx = Math.min(itemsOf(sess.cur).indexOf(sess.item), itemsOf(next).length);
    const nlist = itemsOf(next);
    kbMove(() => moveItem(sess, next, nlist[idx] || null));
    const list = itemsOf(next);
    announce(inst, inst.tx.t('moved', { to: list.indexOf(sess.item) + 1, total: list.length }));
    return;
  }
  const list = itemsOf(sess.cur);
  const i = list.indexOf(sess.item);
  const j = Math.max(0, Math.min(list.length - 1, delta === -Infinity ? 0 : delta === Infinity ? list.length - 1 : i + delta));
  if (j === i) return;
  const ref = j > i ? list[j].nextSibling : list[j];
  kbMove(() => moveItem(sess, sess.cur, ref));
  announce(inst, inst.tx.t('moved', { to: j + 1, total: list.length }));
}

// ---------------------------------------------------------------- public factory

/**
 * Drag-to-reorder behavior for lists, table bodies, chip rows and card grids.
 * Pointer Events (mouse, touch, pen) plus full keyboard support; items are real DOM nodes
 * that move, so the markup order is always the truth.
 *
 * @param {Element|string} container — the list / `<tbody>` / `<table>` (its first body is used) / any element whose children are the items
 * @param {Object} [opts]
 * @param {string} [opts.items] — selector the direct children must match (default: every child)
 * @param {string} [opts.handle] — selector (inside an item) that starts the drag; without it the whole item is the handle
 * @param {string} [opts.filter] — selector of children / descendants that must NOT start a drag
 * @param {'vertical'|'horizontal'|'grid'} [opts.direction] — auto-detected from the layout when omitted
 * @param {string|{name:string,pull?:boolean|Function,put?:boolean|Function}} [opts.group] — containers sharing a name accept each other's items
 * @param {boolean|Function} [opts.pull=true] — items may leave this container (shorthand for group.pull)
 * @param {boolean|Function} [opts.put=true] — this container accepts items from the group (shorthand for group.put)
 * @param {boolean} [opts.disabled=false]
 * @param {number} [opts.delay] — ms to hold before a drag starts (default 200 for touch without handle, otherwise 0)
 * @param {number} [opts.threshold] — px to move before a drag starts (default 4 mouse, 8 touch)
 * @param {number} [opts.animation] — ms of the FLIP animation of displaced items (default `--lk-duration-fast`; 0 = none)
 * @param {Function} [opts.onChange] — (order, { source: 'drag'|'key'|'api', component, item, from, to, fromContainer, toContainer }) when the order really changed
 * @param {Function} [opts.onStart] — ({ item, source, component })
 * @param {Function} [opts.onEnd] — ({ item, cancelled, source, component })
 * @param {Function} [opts.beforeChange] — guard ({ item, from, to, fromContainer, toContainer }, { source, component }) evaluated at drop; a veto puts the item back
 * @param {Function} [opts.beforeStart] — guard ({ item, source, component }) answered synchronously; false prevents picking the item up
 * @param {Object} [opts.text] — per-instance text overrides ('hint', 'roleDescription', 'pickedUp', 'moved', 'dropped', 'cancelled')
 * @returns {{ el: Element, value: Array, getOrder: Function, setOrder: Function, items: Element[], disabled: boolean, text: Object, refresh: Function, destroy: Function }}
 */
export function lkSortable(container, opts = {}) {
  let el = resolveEl(container, 'lkSortable');
  if (el.tagName === 'TABLE') el = el.tBodies[0] || el.appendChild(document.createElement('tbody'));

  const g = typeof opts.group === 'string' ? { name: opts.group } : { ...(opts.group || {}) };
  if (opts.pull !== undefined) g.pull = opts.pull;
  if (opts.put !== undefined) g.put = opts.put;

  const comp = {};
  const inst = {
    el, comp, opts: { ...opts }, group: g, disabled: !!opts.disabled, destroyed: false,
    prepared: new Map(), anims: new WeakMap(), ghosts: new Set(), pending: null,
    tx: null, hintEl: null, liveEl: null, observer: null,
  };
  const refresh = () => {
    if (inst.hintEl) inst.hintEl.textContent = inst.tx.t('hint');
    inst.prepared.forEach((_o, t) => t.setAttribute('aria-roledescription', inst.tx.t('roleDescription')));
  };
  inst.tx = bindText('sortable', opts.text, refresh);

  inst.hintEl = document.createElement('div');
  inst.hintEl.id = `lk-sortable-hint-${++uid}`;
  inst.hintEl.className = 'lk-sr-only';
  inst.hintEl.textContent = inst.tx.t('hint');
  inst.liveEl = document.createElement('div');
  inst.liveEl.className = 'lk-sr-only';
  inst.liveEl.setAttribute('role', 'status');
  inst.liveEl.setAttribute('aria-live', 'polite');
  inst.liveEl.setAttribute('aria-atomic', 'true');
  document.body.append(inst.hintEl, inst.liveEl);

  el.classList.add('lk-sortable');
  el.classList.toggle('lk-sortable--handle', !!opts.handle);
  el.classList.toggle('lk-sortable--disabled', inst.disabled);
  if (g.name) {
    if (!registry.has(g.name)) registry.set(g.name, new Set());
    registry.get(g.name).add(inst);
  }

  const onDown = (e) => onPointerDown(inst, e);
  const onKey = (e) => onKeyDown(inst, e);
  const onDragStart = (e) => { if (closestItem(inst, e.target)) e.preventDefault(); };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('keydown', onKey);
  el.addEventListener('dragstart', onDragStart);

  prepare(inst);
  if (typeof MutationObserver === 'function') {
    inst.observer = new MutationObserver(() => prepare(inst));
    inst.observer.observe(el, { childList: true });
  }

  function setOrder(ids) {
    const list = itemsOf(inst);
    if (!list.length) return comp;
    const map = new Map(list.map((n, i) => [String(itemId(n, i)), n]));
    const picked = (ids || []).map(String).filter((id) => map.has(id)).map((id) => map.get(id));
    const rest = list.filter((n) => !picked.includes(n));
    const ordered = [...new Set([...picked, ...rest])];
    const anchor = list[list.length - 1].nextSibling;
    animateFlip(inst, [list], () => { ordered.forEach((n) => el.insertBefore(n, anchor)); });
    return comp;
  }

  Object.defineProperties(comp, {
    el: { value: el, enumerable: true },
    value: { get: () => orderOf(inst), set: (v) => { setOrder(v); }, enumerable: true },
    items: { get: () => itemsOf(inst), enumerable: true },
    disabled: {
      get: () => inst.disabled,
      set: (v) => {
        inst.disabled = !!v;
        el.classList.toggle('lk-sortable--disabled', inst.disabled);
        if (inst.disabled && active && (active.src === inst || active.cur === inst)) cancelSession(active);
      },
      enumerable: true,
    },
    text: { get: () => inst.tx.get(), set: (v) => inst.tx.set(v), enumerable: true },
  });
  comp.getOrder = () => orderOf(inst);
  comp.setOrder = setOrder;
  comp.refresh = () => { prepare(inst); refresh(); return comp; };
  comp.destroy = () => {
    if (inst.destroyed) return;
    if (active && (active.src === inst || active.cur === inst)) cancelSession(active, true);
    inst.destroyed = true;
    if (inst.pending) inst.pending();
    if (inst.observer) inst.observer.disconnect();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('dragstart', onDragStart);
    unprepare(inst);
    inst.ghosts.forEach((gh) => { if (gh.parentNode) gh.parentNode.removeChild(gh); });
    inst.ghosts.clear();
    itemsOf(inst).forEach((n) => {
      n.classList.remove(PLACEHOLDER, PICKED);
      if (!n.getAttribute('class')) n.removeAttribute('class');
    });
    if (g.name && registry.get(g.name)) {
      registry.get(g.name).delete(inst);
      if (!registry.get(g.name).size) registry.delete(g.name);
    }
    el.classList.remove('lk-sortable', 'lk-sortable--handle', 'lk-sortable--disabled', 'lk-sortable--dragging', 'lk-sortable--source', 'lk-sortable--over');
    if (!el.getAttribute('class')) el.removeAttribute('class');
    inst.tx.destroy();
    if (inst.hintEl.parentNode) inst.hintEl.parentNode.removeChild(inst.hintEl);
    if (inst.liveEl.parentNode) inst.liveEl.parentNode.removeChild(inst.liveEl);
  };
  return comp;
}
