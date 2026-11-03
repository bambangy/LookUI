// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Org — an organization chart (CEO → managers → reports): draw, browse, edit and
// drag-and-drop re-parent a hierarchy, built around a "linked head/tail" tree: every
// loaded node keeps real `parent` / `head` / `tail` / `prev` / `next` references so a
// caller can walk it directly (`org.get('ceo').head.next.data.title`) and structural
// changes are O(1) pointer relinks instead of array splices.

import { resolveEl, applyBase } from '../helpers/base.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkDataSource } from '../helpers/dataSource.js';
import { lkIcon } from '../components/icon.js';
import { lkTextbox } from '../components/form.js';
import { lkDialog } from './dialog.js';
import { lkSortable } from '../behaviors/sortable.js';

lkI18n.define('org', {
  empty: 'No people yet',
  addChild: 'Add report',
  addRoot: 'Add person',
  expand: 'Expand',
  collapse: 'Collapse',
  dropHint: 'Drop here',
  cycleRejected: "A manager can't be moved under one of their own reports.",
  fieldTitle: 'Name',
  fieldSubtitle: 'Title',
  titleRequired: 'Name is required',
  dialogAddTitle: 'Add person',
  dialogEditTitle: 'Edit person',
  confirmCascade: { one: 'Remove {title}? Their report will be removed too.', other: 'Remove {title}? Their {count} reports will be removed too.' },
  confirmCascadeLeaf: 'Remove {title}?',
  confirmPromote: { one: "Remove {title}? Their report will move up to {parentTitle}'s team.", other: "Remove {title}? Their {count} reports will move up to {parentTitle}'s team." },
  confirmPromoteRoot: { one: "Remove {title}? Their report becomes a top-level person.", other: "Remove {title}? Their {count} reports become top-level people." },
});

let uid = 0;

function emit(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Look.lkOrg: callback threw', err);
    return undefined;
  }
}

const own = (v, k) => (v == null ? undefined : v[k]);

/**
 * Build an organization chart inside `target` — every card, connector line and
 * (unless `readOnly`) add/edit/delete affordance is created for you.
 *
 *   const org = Look.lkOrg('#chart', {
 *     items: [{ id: 1, title: 'Jane Doe', subtitle: 'CEO', children: [
 *       { id: 2, title: 'Sam Lee', subtitle: 'VP Eng' },
 *     ] }],
 *     onMove(node, ctx) {},
 *   });
 *
 * Data: a nested `items` array/object (children under `childrenField`, default
 * `'children'`), or a flat array / `lkDataSource` + `parentField`. Each loaded node is
 * kept alive as `{ id, parent, head, tail, prev, next, childCount, data }` — a real,
 * mutable doubly-linked structure (`for (let c = node.head; c; c = c.next)` walks the
 * children of `node`), not an array-backed facade.
 *
 * Drag-and-drop (disabled with `readOnly` or `dragDrop: false`) is built from one
 * `lkSortable` per sibling row, all sharing a group so a drag can cross from one
 * parent's row into another's — that crossing is the re-parent operation. Every
 * structural change (drag or a `move()`/`add()`/`update()`/`remove()` call) goes
 * through the same `before<Action>` guard.
 *
 * @param {Element|string} target
 * @param {Object} [opts]
 * @param {Array|Object} [opts.items] — nested items (a single root object, or a forest array)
 * @param {Object} [opts.dataSource] — an lkDataSource instance or its options object (flat rows)
 * @param {string} [opts.parentField] — flat rows: field holding the parent key (null/absent = root)
 * @param {string} [opts.childrenField='children']
 * @param {string} [opts.idField='id']
 * @param {string} [opts.titleField='title']
 * @param {string} [opts.subtitleField='subtitle']
 * @param {string} [opts.imageField='image']
 * @param {Function} [opts.render] — (node, { component, expanded, selected }) => Node | text, replaces the default card body
 * @param {boolean} [opts.readOnly=false] — no add/edit/delete, no drag; expand/collapse + select still work
 * @param {boolean} [opts.dragDrop=true] — set false to keep CRUD but skip building the `lkSortable` instances
 * @param {'cascade'|'promote'} [opts.removeStrategy='cascade'] — default strategy for `remove()` / the delete button
 * @param {Function} [opts.editor] — (host, { node, mode: 'add'|'edit', value, setValue, close }) => cleanup; replaces the built-in add/edit form
 * @param {Array|boolean} [opts.expanded=true] — ids initially expanded, or `true`/`false` for all
 * @param {boolean} [opts.dense]
 * @param {string} [opts.ariaLabel]
 * @param {Object} [opts.text]
 * @param {Function} [opts.beforeAdd]    — (data, { parentId, parent, source, component }); false cancels, an object replaces the data
 * @param {Function} [opts.beforeUpdate] — (changes, { node, prev, source, component })
 * @param {Function} [opts.beforeRemove] — (node, { strategy, source, component })
 * @param {Function} [opts.beforeMove]   — (moveInfo, { source, component }) — moveInfo: { id, node, fromParentId, fromIndex, toParentId, toIndex }
 * @param {Function} [opts.beforeToggle] — (nextExpanded, { node, source, component })
 * @param {Function} [opts.onAdd]    — (node, { parentId, source, component })
 * @param {Function} [opts.onUpdate] — (node, { prev, source, component })
 * @param {Function} [opts.onRemove] — (node, { strategy, promoted, source, component })
 * @param {Function} [opts.onMove]   — (node, { fromParentId, fromIndex, toParentId, toIndex, source, component })
 * @param {Function} [opts.onToggle] — (expanded, { node, source, component })
 * @param {Function} [opts.onSelect] — (node, { source, component })
 * @param {Function} [opts.onChange] — (items, { action, source, component }) — fires after add/update/remove/move
 * @returns {Object}
 */
export function lkOrg(target, opts = {}) {
  const host = resolveEl(target, 'lkOrg');
  const o = {
    childrenField: 'children',
    idField: 'id',
    titleField: 'title',
    subtitleField: 'subtitle',
    imageField: 'image',
    removeStrategy: 'cascade',
    readOnly: false,
    dragDrop: true,
    expanded: true,
    ...opts,
  };
  if (o.readOnly) o.dragDrop = false;
  const prefix = `lk-org-${++uid}`;

  const rootEl = document.createElement('div');
  rootEl.className = 'lk-org';
  if (o.dense) rootEl.classList.add('lk-org--dense');
  if (o.readOnly) rootEl.classList.add('lk-org--readonly');
  const scrollEl = document.createElement('div');
  scrollEl.className = 'lk-org__scroll';
  const forestEl = document.createElement('div');
  forestEl.className = 'lk-org__forest';
  forestEl.setAttribute('role', 'group');
  const statusEl = document.createElement('div');
  statusEl.className = 'lk-org__status';
  statusEl.hidden = true;
  scrollEl.appendChild(forestEl);
  rootEl.append(scrollEl, statusEl);
  host.appendChild(rootEl);

  const comp = {};
  applyBase(comp, rootEl);
  const tx = bindText('org', o.text, refresh);

  // --- State ---------------------------------------------------------------------------
  const byId = new Map();
  const nodeOfEl = new WeakMap();
  const containerOwner = new WeakMap(); // children-row element -> owning node, or null for the forest row
  let rootHead = null;
  let rootTail = null;
  let selected = null;
  let seq = 0;
  let ds = null;
  let destroyed = false;
  const offs = [];
  const sortables = [];
  let activeEditor = null; // { dialog, cleanup }

  const childrenOf = (parent) => {
    const out = [];
    for (let c = parent ? parent.head : rootHead; c; c = c.next) out.push(c);
    return out;
  };
  const indexOf = (parent, node) => childrenOf(parent).indexOf(node);
  const isDescendant = (candidate, node) => {
    for (let p = candidate; p; p = p.parent) if (p === node) return true;
    return false;
  };

  function find(ref) {
    if (ref == null) return null;
    if (typeof ref === 'object') return byId.get(ref.id) === ref ? ref : (ref.id != null ? byId.get(ref.id) || null : null);
    return byId.get(ref) || null;
  }
  const need = (ref, caller) => {
    const n = find(ref);
    if (!n) throw new Error(`Look.lkOrg.${caller}: node not found - "${ref}"`);
    return n;
  };

  // --- Linked-list primitives (the actual CRUD implementation) --------------------------
  function linkList(nodes) {
    let prev = null;
    nodes.forEach((n) => { n.prev = prev; n.next = null; if (prev) prev.next = n; prev = n; });
    return { head: nodes[0] || null, tail: nodes[nodes.length - 1] || null };
  }

  function unlink(node) {
    const { parent, prev, next } = node;
    if (prev) prev.next = next; else if (parent) parent.head = next; else rootHead = next;
    if (next) next.prev = prev; else if (parent) parent.tail = prev; else rootTail = prev;
    if (parent) parent.childCount = Math.max(0, parent.childCount - 1);
    node.prev = null;
    node.next = null;
  }

  // Insert `node` as a child of `parent` (null = root), right after sibling `after` (null = first).
  function linkAfter(node, parent, after) {
    node.parent = parent;
    if (after) {
      node.next = after.next;
      node.prev = after;
      after.next = node;
    } else {
      node.next = parent ? parent.head : rootHead;
      node.prev = null;
      if (parent) parent.head = node; else rootHead = node;
    }
    if (node.next) node.next.prev = node; else if (parent) parent.tail = node; else rootTail = node;
    if (parent) parent.childCount = (parent.childCount || 0) + 1;
  }

  function linkAt(node, parent, index) {
    const siblings = childrenOf(parent);
    const at = index == null || index < 0 || index > siblings.length ? siblings.length : index;
    const after = at === 0 ? null : siblings[at - 1];
    linkAfter(node, parent, after);
  }

  // --- Model (raw records -> linked nodes) -----------------------------------------------
  function makeNode(raw) {
    const data = (raw != null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : { [o.titleField]: String(raw) };
    const rec = {
      id: null, parent: null, head: null, tail: null, prev: null, next: null, childCount: 0, data,
      expanded: true, selected: false,
      el: null, cardEl: null, actionsEl: null, toggleEl: null, bodyEl: null, collEl: null, rowEl: null, sortable: null,
    };
    let id = own(data, o.idField);
    if (id == null || byId.has(id)) id = `${prefix}-n${++seq}`;
    rec.id = id;
    byId.set(id, rec);
    return rec;
  }

  function wantExpanded(id) {
    if (o.expanded === false) return false;
    if (Array.isArray(o.expanded)) return o.expanded.includes(id);
    return true;
  }

  function compileTree(raw, parent) {
    const node = makeNode(raw);
    node.parent = parent;
    node.expanded = wantExpanded(node.id);
    const kidsRaw = Array.isArray(own(raw, o.childrenField)) ? raw[o.childrenField] : [];
    const kids = kidsRaw.map((r) => compileTree(r, node));
    const { head, tail } = linkList(kids);
    node.head = head;
    node.tail = tail;
    node.childCount = kids.length;
    return node;
  }

  function compileFlat(rows) {
    const idKey = o.idField;
    const recs = rows.map((raw) => makeNode(raw));
    recs.forEach((r) => { r.expanded = wantExpanded(r.id); });
    const byRawId = new Map(recs.map((r) => [own(r.data, idKey) ?? r.id, r]));
    const buckets = new Map(); // parent node (or 'root') -> array
    recs.forEach((r) => {
      const pk = own(r.data, o.parentField);
      const parent = pk == null || pk === '' ? null : byRawId.get(pk) || null;
      r.parent = parent && parent !== r && !isDescendant(parent, r) ? parent : null;
      const key = r.parent || 'root';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    });
    buckets.forEach((list, key) => {
      const { head, tail } = linkList(list);
      if (key === 'root') { rootHead = head; rootTail = tail; } else { key.head = head; key.tail = tail; key.childCount = list.length; }
    });
    if (!buckets.has('root')) { rootHead = null; rootTail = null; }
  }

  function destroyAll() {
    sortables.splice(0).forEach((s) => s.destroy());
    forestSortable = null;
    byId.clear();
    rootHead = null;
    rootTail = null;
    selected = null;
    forestEl.replaceChildren();
  }

  function buildAll() {
    destroyAll();
    if (ds && o.parentField) {
      compileFlat(ds.items);
    } else {
      const raw = ds ? ds.items : o.items;
      const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const roots = list.map((r) => compileTree(r, null));
      const { head, tail } = linkList(roots);
      rootHead = head;
      rootTail = tail;
    }
    childrenOf(null).forEach((n) => renderNodeInto(n, null, forestEl));
    wireContainer(forestEl, null);
    paintStatus();
  }

  // --- Rendering ---------------------------------------------------------------------------
  function cardContent(node) {
    const body = document.createElement('div');
    body.className = 'lk-org__body';
    if (typeof o.render === 'function') {
      const out = o.render(node, { component: comp, expanded: node.expanded, selected: node.selected });
      if (out instanceof Node) { body.appendChild(out); return body; }
      if (out != null && out !== false) { body.textContent = String(out); return body; }
    }
    const img = own(node.data, o.imageField);
    const media = document.createElement('div');
    media.className = 'lk-org__media';
    if (img) {
      const i = document.createElement('img');
      i.src = img;
      i.alt = '';
      media.appendChild(i);
    } else {
      media.appendChild(lkIcon('user'));
    }
    const text = document.createElement('div');
    text.className = 'lk-org__text';
    const titleEl = document.createElement('div');
    titleEl.className = 'lk-org__title';
    titleEl.textContent = String(own(node.data, o.titleField) ?? '');
    text.appendChild(titleEl);
    const sub = own(node.data, o.subtitleField);
    if (sub) {
      const subEl = document.createElement('div');
      subEl.className = 'lk-org__subtitle';
      subEl.textContent = String(sub);
      text.appendChild(subEl);
    }
    body.append(media, text);
    return body;
  }

  function paintCard(node) {
    if (!node.bodyEl) return;
    node.bodyEl.replaceWith(cardContent(node));
    node.bodyEl = node.cardEl.querySelector(':scope > .lk-org__body');
    node.cardEl.classList.toggle('lk-org__card--selected', node.selected);
  }

  function renderToggle(node) {
    if (node.toggleEl) { node.toggleEl.remove(); node.toggleEl = null; }
    if (!node.childCount) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lk-org__toggle';
    btn.setAttribute('aria-label', node.expanded ? tx.t('collapse') : tx.t('expand'));
    btn.classList.toggle('lk-org__toggle--open', node.expanded);
    btn.appendChild(lkIcon('chevron-down', { size: 'xs' }));
    btn.addEventListener('click', (e) => { e.stopPropagation(); setExpanded(node, !node.expanded, 'click', true); });
    node.cardEl.appendChild(btn);
    node.toggleEl = btn;
  }

  function renderActions(node) {
    if (o.readOnly) return;
    const wrap = document.createElement('div');
    wrap.className = 'lk-org__actions';
    const mk = (name, icon, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lk-org__action lk-org__action--${name}`;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.appendChild(lkIcon(icon, { size: 'xs' }));
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      wrap.appendChild(b);
      return b;
    };
    mk('add', 'plus', tx.t('addChild'), () => openEditor('add', null, node));
    mk('edit', 'edit', tx.tf('common.edit'), () => openEditor('edit', node, node.parent));
    mk('delete', 'delete', tx.tf('common.delete'), () => confirmRemove(node));
    node.cardEl.appendChild(wrap);
    node.actionsEl = wrap;
  }

  function renderNodeInto(node, parent, containerEl) {
    const wrap = document.createElement('div');
    wrap.className = 'lk-org__node';
    wrap.setAttribute('data-id', String(node.id));
    if (!parent) wrap.classList.add('lk-org__node--root');
    node.el = wrap;
    nodeOfEl.set(wrap, node);

    const cardWrap = document.createElement('div');
    cardWrap.className = 'lk-org__card-wrap';
    const card = document.createElement('div');
    card.className = 'lk-org__card';
    card.tabIndex = -1;
    node.cardEl = card;
    node.bodyEl = cardContent(node);
    card.appendChild(node.bodyEl);
    renderActions(node);
    renderToggle(node);
    card.addEventListener('click', () => select(node, 'click'));
    cardWrap.appendChild(card);
    wrap.appendChild(cardWrap);

    const coll = document.createElement('div');
    coll.className = 'lk-collapse lk-org__collapse';
    if (node.expanded) coll.classList.add('lk-collapse--open');
    const inner = document.createElement('div');
    inner.className = 'lk-collapse__inner';
    const row = document.createElement('div');
    row.className = 'lk-org__children';
    row.setAttribute('data-drop-hint', tx.t('dropHint'));
    node.rowEl = row;
    node.collEl = coll;
    inner.appendChild(row);
    coll.appendChild(inner);
    wrap.appendChild(coll);

    containerEl.appendChild(wrap);
    childrenOf(node).forEach((c) => renderNodeInto(c, node, row));
    wireContainer(row, node);
  }

  // --- Drag and drop (lkSortable per sibling row, shared group) ---------------------------
  const GROUP = `${prefix}-group`;

  function wireContainer(el, parent) {
    containerOwner.set(el, parent);
    if (!o.dragDrop) return;
    const s = lkSortable(el, {
      group: GROUP,
      items: '.lk-org__node',
      filter: '.lk-org__action, .lk-org__toggle',
      animation: 150,
      beforeStart: () => true,
      beforeChange: onSortableBeforeChange,
      onStart: () => rootEl.classList.add('lk-org--dragging'),
      onEnd: () => rootEl.classList.remove('lk-org--dragging'),
    });
    // Nested sortable containers: stop a pointerdown from also arming an ANCESTOR
    // container's drag session once the nearest one has claimed it.
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (parent) parent.sortable = s; else forestSortable = s;
    sortables.push(s);
  }
  let forestSortable = null;

  // lkSortable evaluates `beforeChange` once per affected container (origin, then the
  // destination when it differs) — both calls share the very same `payload` object, so
  // the real work (cycle check + our own `beforeMove` guard + the actual relink) runs
  // exactly once, on the first call; the second call just replays its cached verdict.
  function onSortableBeforeChange(payload, ctx) {
    if (Object.prototype.hasOwnProperty.call(payload, '__lkOrgResult')) return payload.__lkOrgResult;
    const node = nodeOfEl.get(payload.item);
    const toParent = containerOwner.has(payload.toContainer) ? containerOwner.get(payload.toContainer) : undefined;
    if (!node || toParent === undefined || toParent === node || isDescendant(toParent, node)) {
      return (payload.__lkOrgResult = false);
    }
    const r = performMove(node, toParent, payload.to, ctx.source === 'key' ? 'key' : 'drag', true);
    payload.__lkOrgResult = r;
    return r;
  }

  // --- Guarded structural operations (shared by API calls AND drag/UI) -------------------
  function pre(name, payload, ctx) {
    return new Promise((resolve) => {
      const out = guard(rootEl, o, name, payload, { component: comp, ...ctx }, (next) => resolve({ ok: true, payload: next }));
      if (out === false) resolve({ ok: false });
      else if (out && typeof out.then === 'function') out.then((v) => { if (v === false) resolve({ ok: false }); });
    });
  }

  function emitChangeEvent(action, ctx) {
    if (typeof o.onChange === 'function') o.onChange(comp.items, { action, component: comp, source: ctx.source });
  }

  function refreshParentChrome(parent) {
    if (!parent) return;
    renderToggle(parent);
    if (!parent.childCount && parent.collEl) parent.collEl.classList.remove('lk-collapse--open');
  }

  async function performAdd(parentId, data, source, index) {
    const parent = parentId == null ? null : need(parentId, 'add');
    const gate = await pre('add', data, { parentId, parent, source });
    if (!gate.ok) return null;
    const node = makeNode(gate.payload);
    node.expanded = true;
    linkAt(node, parent, index);
    const containerEl = parent ? parent.rowEl : forestEl;
    renderNodeInto(node, parent, containerEl);
    const ref = node.next ? node.next.el : null;
    if (ref) containerEl.insertBefore(node.el, ref);
    if (parent && !parent.expanded) applyExpanded(parent, true);
    refreshParentChrome(parent);
    paintStatus();
    emit(o.onAdd, node, { parentId: parent ? parent.id : null, source, component: comp });
    emitChangeEvent('add', { source });
    return node;
  }

  async function performUpdate(id, changes, source) {
    const node = need(id, 'update');
    const prev = { ...node.data };
    const gate = await pre('update', changes, { node, prev, source });
    if (!gate.ok) return null;
    Object.assign(node.data, gate.payload || {});
    paintCard(node);
    emit(o.onUpdate, node, { prev, source, component: comp });
    emitChangeEvent('update', { source });
    return node;
  }

  function walkSubtree(node, fn) {
    childrenOf(node).forEach((c) => walkSubtree(c, fn));
    fn(node);
  }

  async function performRemove(id, opts2, source) {
    const node = need(id, 'remove');
    const strategy = (opts2 && opts2.strategy) || o.removeStrategy;
    const parent = node.parent;
    const kids = childrenOf(node);
    const gate = await pre('remove', node, { strategy, source });
    if (!gate.ok) return false;

    let promoted = [];
    if (strategy === 'promote' && kids.length) {
      let anchor = node.prev;
      kids.slice().forEach((child) => {
        unlink(child);
        linkAfter(child, parent, anchor);
        anchor = child;
        const containerEl = parent ? parent.rowEl : forestEl;
        const ref = child.next ? child.next.el : null;
        containerEl.insertBefore(child.el, ref || null);
      });
      promoted = kids;
    }

    unlink(node);
    walkSubtree(node, (n) => {
      if (n.sortable) { n.sortable.destroy(); const idx = sortables.indexOf(n.sortable); if (idx > -1) sortables.splice(idx, 1); }
      byId.delete(n.id);
      if (selected === n) selected = null;
    });
    if (node.el && node.el.parentNode) node.el.parentNode.removeChild(node.el);
    refreshParentChrome(parent);
    paintStatus();
    emit(o.onRemove, node, { strategy, promoted, source, component: comp });
    emitChangeEvent('remove', { source });
    return true;
  }

  function moveInfoFor(node, newParent, index) {
    return {
      id: node.id, node,
      fromParentId: node.parent ? node.parent.id : null,
      fromIndex: indexOf(node.parent, node),
      toParentId: newParent ? newParent.id : null,
      toIndex: index,
    };
  }

  function performMove(node, newParentRef, index, source, domAlreadyMoved) {
    const newParent = newParentRef === undefined ? node.parent : newParentRef;
    if (newParent === node || isDescendant(newParent, node)) return false;
    const info = moveInfoFor(node, newParent, index);
    const oldParent = node.parent;
    const r = guard(rootEl, o, 'move', info, { source, component: comp }, (payload) => {
      unlink(node);
      linkAt(node, newParent, payload.toIndex);
      if (!domAlreadyMoved) {
        const containerEl = newParent ? newParent.rowEl : forestEl;
        const ref = node.next ? node.next.el : null;
        containerEl.insertBefore(node.el, ref || null);
      }
      if (newParent) node.el.classList.remove('lk-org__node--root'); else node.el.classList.add('lk-org__node--root');
      if (newParent && !newParent.expanded) applyExpanded(newParent, true);
      refreshParentChrome(oldParent);
      refreshParentChrome(newParent);
      emit(o.onMove, node, { ...payload, source, component: comp });
      emitChangeEvent('move', { source });
    });
    return r;
  }

  // --- Expand / collapse -------------------------------------------------------------------
  function applyExpanded(node, next) {
    node.expanded = next;
    if (node.collEl) node.collEl.classList.toggle('lk-collapse--open', next);
    if (node.toggleEl) node.toggleEl.classList.toggle('lk-org__toggle--open', next);
  }

  function setExpanded(node, next, source, emitEvent) {
    if (destroyed || !node.childCount) return;
    if (next === node.expanded) return;
    const proceed = () => { applyExpanded(node, next); if (emitEvent) emit(o.onToggle, next, { node, source, component: comp }); };
    if (!emitEvent) { proceed(); return; }
    guard(rootEl, o, 'toggle', next, { node, source, component: comp }, proceed);
  }

  // --- Selection -----------------------------------------------------------------------------
  function select(node, source) {
    if (destroyed) return;
    if (selected === node) return;
    const prev = selected;
    selected = node;
    if (prev) { prev.selected = false; if (prev.cardEl) prev.cardEl.classList.remove('lk-org__card--selected'); }
    if (node) { node.selected = true; if (node.cardEl) node.cardEl.classList.add('lk-org__card--selected'); }
    emit(o.onSelect, node, { source, component: comp });
  }

  // --- Status (empty state) -----------------------------------------------------------------
  function paintStatus() {
    const empty = !rootHead;
    statusEl.hidden = !empty;
    statusEl.textContent = empty ? tx.t('empty') : '';
  }

  function refresh() {
    if (destroyed) return;
    rootEl.setAttribute('aria-label', o.ariaLabel || '');
    byId.forEach((n) => {
      if (n.rowEl) n.rowEl.setAttribute('data-drop-hint', tx.t('dropHint'));
      if (n.toggleEl) n.toggleEl.setAttribute('aria-label', n.expanded ? tx.t('collapse') : tx.t('expand'));
    });
    paintStatus();
  }

  // --- Built-in / custom add-edit editor ----------------------------------------------------
  function closeEditor() {
    if (!activeEditor) return;
    const { dialog, cleanup } = activeEditor;
    activeEditor = null;
    if (typeof cleanup === 'function') { try { cleanup(); } catch (err) { /* ignore */ } }
    if (dialog) dialog.close('cancel');
  }

  function defaultEditor(host, ctx) {
    const form = document.createElement('div');
    form.className = 'lk-org__form';
    const titleInput = document.createElement('input');
    titleInput.value = own(ctx.value, o.titleField) || '';
    const subInput = document.createElement('input');
    subInput.value = own(ctx.value, o.subtitleField) || '';
    form.append(titleInput, subInput);
    host.appendChild(form);
    const titleBox = lkTextbox(titleInput, { label: tx.t('fieldTitle') });
    const subBox = lkTextbox(subInput, { label: tx.t('fieldSubtitle') });
    let errorEl = null;
    return {
      destroy() { titleBox.destroy(); subBox.destroy(); },
      save() {
        const titleVal = String(titleBox.value || '').trim();
        if (!titleVal) {
          if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'lk-field-error';
            errorEl.style.display = '';
            form.appendChild(errorEl);
          }
          errorEl.textContent = tx.t('titleRequired');
          titleBox.el?.focus?.();
          return null;
        }
        return { ...ctx.value, [o.titleField]: titleVal, [o.subtitleField]: String(subBox.value || '') };
      },
      focus() { titleInput.focus(); },
    };
  }

  function openEditor(mode, node, parentForAdd) {
    closeEditor();
    const value = mode === 'edit' ? { ...node.data } : {};
    const host = document.createElement('div');
    let customCleanup = null;
    let customResult;
    const ctxBase = {
      node: mode === 'edit' ? node : (parentForAdd || null),
      mode,
      value,
      setValue(patch) { Object.assign(value, patch); },
      close(result) { customResult = result; finishSave(result); },
    };

    const title = mode === 'add' ? tx.t('dialogAddTitle') : tx.t('dialogEditTitle');
    let defaultCtl = null;

    function finishSave(result) {
      const dlg = activeEditor && activeEditor.dialog;
      activeEditor = null;
      if (result) {
        if (mode === 'add') performAdd(parentForAdd ? parentForAdd.id : null, result, 'ui');
        else performUpdate(node.id, result, 'ui');
      }
      if (dlg) dlg.close('done');
    }

    if (typeof o.editor === 'function') {
      const ret = o.editor(host, ctxBase);
      if (typeof ret === 'function') customCleanup = ret;
      else if (ret && typeof ret.destroy === 'function') customCleanup = () => ret.destroy();
    } else {
      defaultCtl = defaultEditor(host, ctxBase);
      customCleanup = () => defaultCtl.destroy();
    }

    const dialog = lkDialog({
      title,
      content: host,
      confirmText: tx.tf('common.save'),
      cancelText: tx.tf('common.cancel'),
      destroyOnClose: true,
      className: 'lk-org-dialog',
      onConfirm() {
        if (defaultCtl) { const result = defaultCtl.save(); if (result) finishSave(result); return false; }
        return true; // custom editor saves through ctx.close()
      },
      onDestroy() { if (customCleanup) { try { customCleanup(); } catch (err) { /* ignore */ } } },
    });
    activeEditor = { dialog, cleanup: null };
    setTimeout(() => defaultCtl?.focus?.(), 60);
  }

  function confirmRemove(node) {
    const strategy = o.removeStrategy;
    const kids = childrenOf(node);
    const count = kids.length;
    const title = String(own(node.data, o.titleField) ?? '');
    let message;
    if (!count) message = tx.t('confirmCascadeLeaf', { title });
    else if (strategy === 'promote') {
      message = node.parent
        ? tx.t('confirmPromote', { count, title, parentTitle: String(own(node.parent.data, o.titleField) ?? '') })
        : tx.t('confirmPromoteRoot', { count, title });
    } else {
      message = tx.t('confirmCascade', { count, title });
    }
    lkDialog.warning(tx.tf('common.delete'), message, {
      confirmText: tx.tf('common.delete'),
      cancelText: tx.tf('common.cancel'),
      onConfirm: () => { performRemove(node.id, { strategy }, 'ui'); },
    });
  }

  // --- Data sourcing ---------------------------------------------------------------------------
  if (o.dataSource) {
    ds = typeof o.dataSource.on === 'function' && typeof o.dataSource.load === 'function' ? o.dataSource : lkDataSource(o.dataSource);
    offs.push(ds.on('change', () => { if (!destroyed) buildAll(); }));
    if (o.autoLoad !== false && ds.canRead && !ds.items.length && !ds.loading) ds.load().catch(() => {});
  }

  buildAll();

  // --- Serialization ----------------------------------------------------------------------------
  function serialize(node) {
    const out = { ...node.data };
    const kids = childrenOf(node).map(serialize);
    if (kids.length) out[o.childrenField] = kids; else delete out[o.childrenField];
    return out;
  }

  // --- Public API ------------------------------------------------------------------------------
  Object.defineProperty(comp, 'items', { get() { return childrenOf(null).map(serialize); }, enumerable: true });
  Object.defineProperty(comp, 'selected', {
    get() { return selected; },
    set(v) { select(v == null ? null : find(v), 'api'); },
    enumerable: true,
  });
  Object.defineProperty(comp, 'text', { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true });
  Object.defineProperty(comp, 'dataSource', { get() { return ds; }, enumerable: true });

  comp.get = (id) => find(id);
  comp.getChildren = (id) => childrenOf(id == null ? null : need(id, 'getChildren'));
  comp.getPath = (id) => {
    const node = need(id, 'getPath');
    const path = [];
    for (let n = node; n; n = n.parent) path.unshift(n);
    return path;
  };
  comp.toJSON = () => comp.items;

  comp.add = (parentId, data, addOpts = {}) => performAdd(parentId, data, 'api', addOpts.index);
  comp.update = (id, changes) => performUpdate(id, changes, 'api');
  comp.remove = (id, removeOpts = {}) => performRemove(id, removeOpts, 'api');
  comp.move = (id, moveOpts = {}) => {
    const node = need(id, 'move');
    const newParent = moveOpts.parentId === undefined ? node.parent : (moveOpts.parentId == null ? null : need(moveOpts.parentId, 'move'));
    const r = performMove(node, newParent, moveOpts.index, 'api', false);
    return Promise.resolve(r).then((ok) => (ok ? node : null));
  };

  comp.expand = (id) => setExpanded(need(id, 'expand'), true, 'api', true);
  comp.collapse = (id) => setExpanded(need(id, 'collapse'), false, 'api', true);
  comp.toggle = (id) => { const n = need(id, 'toggle'); setExpanded(n, !n.expanded, 'api', true); };
  comp.expandAll = () => { byId.forEach((n) => { if (n.childCount) applyExpanded(n, true); }); };
  comp.collapseAll = () => { byId.forEach((n) => { if (n.childCount) applyExpanded(n, false); }); };
  comp.select = (id) => select(id == null ? null : need(id, 'select'), 'api');

  comp.destroy = function () {
    if (destroyed) return;
    destroyed = true;
    closeEditor();
    offs.splice(0).forEach((off) => off());
    sortables.splice(0).forEach((s) => s.destroy());
    tx.destroy();
    byId.clear();
    rootEl.remove();
  };

  return comp;
}
