// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Tree — nested data as an accessible tree view (selection, checkboxes, lazy loading, filter)

import { resolveEl, applyBase } from '../helpers/base.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkDataSource } from '../helpers/dataSource.js';
import { lkIcon } from '../components/icon.js';

lkI18n.define('tree', {
  label: 'Tree',
  empty: 'No items',
  expand: 'Expand',
  collapse: 'Collapse',
  error: 'Could not load items',
});

let uid = 0;
const TYPEAHEAD_MS = 700;

/**
 * Build a tree view inside `target` (all markup is created for you).
 *
 *   const tree = Look.lkTree('#files', {
 *     items: [{ text: 'src', children: [{ text: 'index.js' }] }, { text: 'README.md' }],
 *     selectable: 'single',
 *     checkboxes: 'tri',
 *     onChange(value, { source, node, nodes }) {},
 *   });
 *
 * Data: `items` (nested arrays), or a `dataSource` (an lkDataSource instance / options; flat rows are
 * nested with `parentField`), or lazy branches with `loadChildren(node)` (called with `null` for the root
 * when neither `items` nor `dataSource` is given). Branches expand with a slide (`.lk-collapse`).
 * Keyboard: Up/Down, Right (expand / first child), Left (collapse / parent), Home/End, Enter
 * (select + onAction), Space (check or select), `*` (expand siblings), type-ahead. Roving tabindex.
 *
 * @param {Element|string} target — empty container
 * @param {Object}   [opts]
 * @param {Array}    [opts.items]          — nested items (objects, or plain strings)
 * @param {Object}   [opts.dataSource]     — lkDataSource instance or its options
 * @param {string}   [opts.parentField]    — flat rows: field holding the parent key (null/undefined = root)
 * @param {string}   [opts.childrenField='children'] / textField='text' / valueField='value' / idField / iconField='icon' / disabledField='disabled' / leafField='leaf'
 * @param {Function} [opts.loadChildren]   — (node | null) => items[] | Promise<items[]> for branches without a `children` array
 * @param {false|'single'|'multiple'|true} [opts.selectable=false]
 * @param {false|true|'tri'} [opts.checkboxes=false] — checkbox per node; 'tri' = tri-state with parent/child propagation
 * @param {boolean}  [opts.checkChildren]  — checking a node checks its descendants (default: true for 'tri')
 * @param {boolean}  [opts.checkParents]   — a parent mirrors its children (checked / mixed / unchecked) (default: true for 'tri')
 * @param {Array|boolean} [opts.expanded]  — ids/values initially expanded (or true = all)
 * @param {boolean}  [opts.expandAll]      — expand every loaded branch
 * @param {number}   [opts.expandDepth]    — expand branches up to this level (1 = roots)
 * @param {boolean}  [opts.expandOnClick]  — a click on a row also toggles its branch (default: true when not selectable)
 * @param {Array}    [opts.value]          — initially selected values;  opts.checked — initially checked values
 * @param {Function} [opts.template]       — (node, { component, filter }) => Node | text (never HTML)
 * @param {Function} [opts.filterFn]       — (node, text) => boolean replacing the default "text contains" match
 * @param {{branch?: string, leaf?: string}} [opts.icons] — default icon names
 * @param {boolean}  [opts.dense]
 * @param {string}   [opts.ariaLabel]      — accessible name (default: the `label` text)
 * @param {Object}   [opts.text]           — text overrides (see the `tree` namespace)
 * @param {Function} [opts.beforeChange]   — (nextNodes, { kind: 'select' | 'check', source, node, checked, component }); false cancels, an array of nodes / values replaces the result
 * @param {Function} [opts.beforeToggle]   — (nextOpen, { node, source, component })
 * @param {Function} [opts.beforeLoad]     — ({ node, source, component }) before loadChildren runs
 * @param {Function} [opts.onChange]       — (value, { source: 'select' | 'check' | 'api', kind, component, node, nodes, checked }) — user actions and API calls; assigning `value` / `checked` is silent
 * @param {Function} [opts.onToggle]       — (open, { node, source, component })
 * @param {Function} [opts.onLoad]         — (children, { node, component })
 * @param {Function} [opts.onError]        — (error, { node, component })
 * @param {Function} [opts.onAction]       — (node, { component, event }) on Enter / double click
 * @returns {Object}
 */
export function lkTree(target, opts = {}) {
  const host = resolveEl(target, 'lkTree');
  const o = {
    childrenField: 'children',
    textField: 'text',
    valueField: 'value',
    idField: null,
    iconField: 'icon',
    disabledField: 'disabled',
    leafField: 'leaf',
    checkedField: 'checked',
    expandedField: 'expanded',
    ...opts,
  };
  const mode = o.selectable === true ? 'single' : (o.selectable === 'single' || o.selectable === 'multiple') ? o.selectable : false;
  const multi = mode === 'multiple';
  const cbMode = o.checkboxes === 'tri' ? 'tri' : o.checkboxes ? 'on' : false;
  const checkChildren = o.checkChildren ?? (cbMode === 'tri');
  const checkParents = o.checkParents ?? (cbMode === 'tri');
  const expandOnClick = o.expandOnClick ?? !mode;
  const prefix = `lk-tree-${++uid}`;

  // --- Root markup ----------------------------------------------------------------
  const rootEl = document.createElement('div');
  rootEl.className = 'lk-tree';
  if (o.dense) rootEl.classList.add('lk-tree--dense');
  const listEl = document.createElement('ul');
  listEl.className = 'lk-tree__list';
  listEl.setAttribute('role', 'tree');
  if (multi) listEl.setAttribute('aria-multiselectable', 'true');
  const statusEl = document.createElement('div');
  statusEl.className = 'lk-tree__status';
  statusEl.hidden = true;
  rootEl.append(listEl, statusEl);
  host.appendChild(rootEl);

  const comp = {};
  applyBase(comp, rootEl);

  const tx = bindText('tree', o.text, refresh);

  // --- State ------------------------------------------------------------------------
  let roots = [];
  const byId = new Map();
  const nodeOf = new WeakMap();
  let seq = 0;
  let selected = new Set();
  let anchor = null;
  let tabStop = null;
  let filterText = '';
  let savedExpanded = null;
  let rootLoading = false;
  let rootError = null;
  let destroyed = false;
  let typed = '';
  let typedTimer = null;
  let ds = null;
  const offs = [];

  const own = (v, k) => (v == null ? undefined : v[k]);
  const isBranch = (rec) => rec.children.length > 0 || (rec.lazy && !rec.loaded);
  const kids = (rec) => (rec ? rec.children : roots);
  const enabledNow = () => !rootEl.classList.contains('lk-disabled');

  // --- Model ------------------------------------------------------------------------
  function normalizeRaw(raw) {
    if (raw != null && typeof raw === 'object') return raw;
    return { [o.textField]: String(raw) };
  }

  function readFields(rec) {
    const raw = rec.data;
    rec.text = String(own(raw, o.textField) ?? '');
    const idKey = o.idField || (ds ? ds.keyField : 'id');
    rec.value = own(raw, o.valueField) ?? own(raw, idKey) ?? rec.text;
    rec.icon = own(raw, o.iconField) || null;
    rec.disabled = !!own(raw, o.disabledField);
    rec.leaf = !!own(raw, o.leafField) || own(raw, 'hasChildren') === false;
  }

  function register(rec, raw) {
    const idKey = o.idField || (ds ? ds.keyField : 'id');
    let id = own(raw, idKey) ?? own(raw, o.valueField);
    if (id == null || byId.has(id)) id = `${prefix}-n${++seq}`;
    rec.id = id;
    byId.set(id, rec);
  }

  function makeNode(rawIn, parent, nested = true) {
    const raw = normalizeRaw(rawIn);
    const rec = {
      id: null, value: null, text: '', data: raw, parent, level: parent ? parent.level + 1 : 1,
      children: [], expanded: false, selected: false, checked: false, disabled: false, leaf: false,
      loading: false, error: null, lazy: false, loaded: true, icon: null,
      el: null, rowEl: null, labelEl: null, collEl: null, groupEl: null, rendered: false,
      hidden: false, matched: false, domId: null, loadSeq: 0,
    };
    readFields(rec);
    register(rec, raw);
    if (nested) {
      const list = raw[o.childrenField];
      if (Array.isArray(list)) rec.children = list.map((c) => makeNode(c, rec));
      else if (typeof o.loadChildren === 'function' && !rec.leaf) { rec.lazy = true; rec.loaded = false; }
    }
    if (own(raw, o.checkedField) === true) rec.checked = true;
    if (own(raw, o.expandedField) === true && rec.children.length) rec.expanded = true;
    return rec;
  }

  function setLevels(list, level, parent) {
    list.forEach((r) => { r.level = level; r.parent = parent; setLevels(r.children, level + 1, r); });
  }

  function walk(fn, list = roots) {
    for (const r of list) {
      if (fn(r) === false) return false;
      if (walk(fn, r.children) === false) return false;
    }
    return true;
  }

  const all = () => { const out = []; walk((r) => { out.push(r); }); return out; };
  const unregister = (rec) => { byId.delete(rec.id); rec.children.forEach(unregister); selected.delete(rec); if (tabStop === rec) tabStop = null; };

  function buildModel(source, keep) {
    const state = keep ? { exp: new Set(), sel: new Set(), chk: new Set() } : null;
    if (keep) {
      walk((r) => {
        if (r.expanded) state.exp.add(r.id);
        if (r.selected) state.sel.add(r.id);
        if (r.checked === true) state.chk.add(r.id);
      });
    }
    byId.clear();
    selected = new Set();
    tabStop = null;
    anchor = null;
    if (ds && o.parentField) {
      const idKey = o.idField || ds.keyField;
      const recs = source.map((raw) => makeNode(raw, null, false));
      const map = new Map(recs.map((r) => [own(r.data, idKey) ?? r.id, r]));
      roots = [];
      recs.forEach((r) => {
        const pk = own(r.data, o.parentField);
        const p = pk == null || pk === '' ? null : map.get(pk);
        if (p && p !== r) { r.parent = p; p.children.push(r); } else roots.push(r);
      });
      // Rows in a parent cycle never reach a root: surface them as roots
      const seen = new Set();
      walk((r) => { seen.add(r); });
      recs.forEach((r) => { if (!seen.has(r)) { r.parent = null; roots.push(r); walk((x) => { seen.add(x); }, [r]); } });
      setLevels(roots, 1, null);
    } else {
      roots = source.map((raw) => makeNode(raw, null));
    }

    // Initial states
    const exp = o.expanded;
    const wantSel = new Set((Array.isArray(o.value) ? o.value : o.value != null ? [o.value] : []).map(String));
    const wantChk = new Set((Array.isArray(o.checked) ? o.checked : []).map(String));
    walk((r) => {
      if (keep && state) {
        r.expanded = state.exp.has(r.id) && isBranch(r);
        r.selected = state.sel.has(r.id);
        r.checked = state.chk.has(r.id);
      } else {
        if (exp === true || o.expandAll || (o.expandDepth && r.level <= o.expandDepth) || (Array.isArray(exp) && (exp.includes(r.id) || exp.includes(r.value)))) {
          if (r.children.length) r.expanded = true;
        }
        if (wantSel.has(String(r.value)) || wantSel.has(String(r.id)) || own(r.data, 'selected') === true) r.selected = true;
        if (wantChk.has(String(r.value)) || wantChk.has(String(r.id))) r.checked = true;
      }
      if (!r.children.length && !(r.lazy && !r.loaded)) r.expanded = false;
    });
    walk((r) => { if (r.selected && mode && (multi || selected.size === 0)) selected.add(r); else r.selected = false; });
    if (cbMode) normalizeChecks();
    if (filterText) computeFilter(false);
  }

  // --- Check propagation ---------------------------------------------------------------
  function setCheck(r, s, changes) {
    if (r.checked === s) return;
    changes.push({ rec: r, from: r.checked });
    r.checked = s;
  }
  function checkDown(rec, on, changes) {
    rec.children.forEach((c) => { if (c.disabled) return; setCheck(c, on, changes); checkDown(c, on, changes); });
  }
  function recompute(p, changes) {
    if (!p.children.length) return;
    const allOn = p.children.every((c) => c.checked === true);
    const allOff = p.children.every((c) => c.checked === false);
    setCheck(p, allOn ? true : allOff ? false : 'mixed', changes);
  }
  function checkUp(rec, changes) { for (let p = rec.parent; p; p = p.parent) recompute(p, changes); }
  function applyCheck(rec, on, changes) {
    setCheck(rec, on, changes);
    if (checkChildren) checkDown(rec, on, changes);
    if (checkParents) checkUp(rec, changes);
  }
  function revert(changes) { for (let i = changes.length - 1; i >= 0; i--) changes[i].rec.checked = changes[i].from; }
  function normalizeChecks() {
    const sink = [];
    if (checkChildren) walk((r) => { if (r.checked === true) checkDown(r, true, sink); });
    if (checkParents) {
      const post = (list) => list.forEach((r) => { post(r.children); recompute(r, sink); });
      post(roots);
    }
  }
  const checkedNodes = (leavesOnly) => all().filter((r) => r.checked === true && (!leavesOnly || !r.children.length));

  // --- Visible order ------------------------------------------------------------------
  function visibleNodes() {
    const out = [];
    (function go(list) {
      list.forEach((r) => {
        if (r.hidden) return;
        out.push(r);
        if (r.expanded) go(r.children);
      });
    }(roots));
    return out;
  }

  // --- Rendering ----------------------------------------------------------------------
  function paintSets(list) {
    const vis = list.filter((r) => !r.hidden);
    vis.forEach((r, i) => {
      if (!r.el) return;
      r.el.setAttribute('aria-posinset', String(i + 1));
      r.el.setAttribute('aria-setsize', String(vis.length));
    });
  }

  function resetDom(rec) {
    rec.el = rec.rowEl = rec.labelEl = rec.collEl = rec.groupEl = null;
    rec.rendered = false;
    rec.children.forEach(resetDom);
  }

  function paintLabel(rec) {
    const label = rec.labelEl;
    if (!label) return;
    label.replaceChildren();
    if (typeof o.template === 'function') {
      const out = o.template(rec, { component: comp, filter: filterText });
      if (out instanceof Node) { label.appendChild(out); return; }
      if (out != null && out !== false) { label.textContent = String(out); return; }
    }
    const text = rec.text;
    if (filterText && rec.matched && !o.filterFn) {
      const i = text.toLowerCase().indexOf(filterText.toLowerCase());
      if (i >= 0) {
        const mark = document.createElement('mark');
        mark.className = 'lk-tree__mark';
        mark.textContent = text.slice(i, i + filterText.length);
        label.append(document.createTextNode(text.slice(0, i)), mark, document.createTextNode(text.slice(i + filterText.length)));
        return;
      }
    }
    label.textContent = text;
  }

  function paintError(rec) {
    if (!rec.rowEl) return;
    const old = rec.rowEl.querySelector('.lk-tree__error');
    old?.remove();
    if (!rec.error) return;
    const box = document.createElement('span');
    box.className = 'lk-tree__error';
    const msg = document.createElement('span');
    msg.textContent = rec.error?.message || tx.t('error');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.className = 'lk-btn lk-btn--sm lk-btn--ghost lk-tree__retry';
    btn.textContent = tx.tf('common.retry');
    box.append(msg, btn);
    rec.rowEl.appendChild(box);
  }

  function paintNode(rec) {
    const li = rec.el;
    if (!li) return;
    const branch = isBranch(rec);
    li.classList.toggle('lk-tree__node--open', rec.expanded);
    li.classList.toggle('lk-tree__node--selected', rec.selected);
    li.classList.toggle('lk-tree__node--disabled', rec.disabled);
    li.classList.toggle('lk-tree__node--loading', rec.loading);
    li.classList.toggle('lk-tree__node--match', !!filterText && rec.matched);
    li.hidden = rec.hidden;
    li.tabIndex = tabStop === rec ? 0 : -1;
    li.setAttribute('aria-level', String(rec.level));
    if (branch) li.setAttribute('aria-expanded', String(rec.expanded)); else li.removeAttribute('aria-expanded');
    if (mode) li.setAttribute('aria-selected', String(rec.selected)); else li.removeAttribute('aria-selected');
    if (cbMode) li.setAttribute('aria-checked', rec.checked === 'mixed' ? 'mixed' : String(!!rec.checked)); else li.removeAttribute('aria-checked');
    if (rec.disabled) li.setAttribute('aria-disabled', 'true'); else li.removeAttribute('aria-disabled');
    if (rec.loading) li.setAttribute('aria-busy', 'true'); else li.removeAttribute('aria-busy');
    const toggle = rec.rowEl.querySelector('.lk-tree__toggle');
    if (toggle) toggle.title = branch ? (rec.expanded ? tx.t('collapse') : tx.t('expand')) : '';
    const check = rec.rowEl.querySelector('.lk-tree__check');
    if (check) check.dataset.state = rec.checked === 'mixed' ? 'mixed' : rec.checked ? 'checked' : 'unchecked';
    paintLabel(rec);
  }

  function renderNode(rec) {
    const li = document.createElement('li');
    li.className = 'lk-tree__node';
    li.setAttribute('role', 'treeitem');
    li.id = rec.domId || (rec.domId = `${prefix}-i${++seq}`);
    li.style.setProperty('--lk-tree-level', String(rec.level));
    rec.el = li;
    nodeOf.set(li, rec);

    const row = document.createElement('div');
    row.className = 'lk-tree__row';
    rec.rowEl = row;
    const branch = isBranch(rec);

    const toggle = document.createElement('span');
    toggle.className = 'lk-tree__toggle';
    toggle.setAttribute('aria-hidden', 'true');
    if (branch) {
      toggle.appendChild(lkIcon('chevron-right', { size: 'sm' }));
      const spin = document.createElement('span');
      spin.className = 'lk-spinner lk-spinner--xs lk-tree__spinner';
      spin.setAttribute('role', 'presentation');
      toggle.appendChild(spin);
    } else toggle.classList.add('lk-tree__toggle--leaf');
    row.appendChild(toggle);

    if (cbMode) {
      const check = document.createElement('span');
      check.className = 'lk-tree__check';
      check.setAttribute('aria-hidden', 'true');
      row.appendChild(check);
    }

    const iconName = rec.icon || (o.icons ? (branch ? o.icons.branch : o.icons.leaf) : null);
    if (iconName) {
      const ic = document.createElement('span');
      ic.className = 'lk-tree__icon';
      ic.setAttribute('aria-hidden', 'true');
      ic.appendChild(lkIcon(iconName, { size: 'sm' }));
      row.appendChild(ic);
    }

    const label = document.createElement('span');
    label.className = 'lk-tree__label';
    rec.labelEl = label;
    row.appendChild(label);
    li.appendChild(row);

    if (branch) {
      const coll = document.createElement('div');
      coll.className = 'lk-collapse lk-tree__collapse';
      const inner = document.createElement('div');
      inner.className = 'lk-collapse__inner';
      const group = document.createElement('ul');
      group.className = 'lk-tree__group';
      group.setAttribute('role', 'group');
      inner.appendChild(group);
      coll.appendChild(inner);
      li.appendChild(coll);
      rec.collEl = coll;
      rec.groupEl = group;
      if (rec.expanded) {
        renderChildren(rec);
        coll.classList.add('lk-collapse--open');
      }
    }
    paintNode(rec);
    paintError(rec);
    return li;
  }

  function renderChildren(rec) {
    if (!rec.groupEl || rec.rendered) return;
    rec.rendered = true;
    rec.children.forEach((c) => rec.groupEl.appendChild(renderNode(c)));
    paintSets(rec.children);
  }

  function ensureTabStop() {
    const vis = visibleNodes();
    if (tabStop && vis.includes(tabStop)) return;
    const prev = tabStop;
    tabStop = vis.find((r) => r.selected && !r.disabled) || vis.find((r) => !r.disabled) || vis[0] || null;
    if (prev && prev.el) prev.el.tabIndex = -1;
    if (tabStop && tabStop.el) tabStop.el.tabIndex = 0;
  }

  function renderRoots() {
    const active = document.activeElement;
    const hadFocus = active && listEl.contains(active) ? nodeOf.get(active.closest('.lk-tree__node')) : null;
    roots.forEach(resetDom);
    listEl.replaceChildren();
    roots.forEach((r) => listEl.appendChild(renderNode(r)));
    paintSets(roots);
    ensureTabStop();
    if (hadFocus && hadFocus.el && !hadFocus.hidden) hadFocus.el.focus({ preventScroll: true });
    paintStatus();
  }

  function paintStatus() {
    statusEl.replaceChildren();
    const noVisible = !roots.some((r) => !r.hidden);
    let kind = null;
    if (rootLoading) kind = 'loading';
    else if (rootError) kind = 'error';
    else if (noVisible) kind = 'empty';
    statusEl.hidden = !kind;
    statusEl.className = `lk-tree__status${kind ? ` lk-tree__status--${kind}` : ''}`;
    if (!kind) { statusEl.removeAttribute('role'); listEl.removeAttribute('aria-busy'); return; }
    statusEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    if (kind === 'loading') {
      listEl.setAttribute('aria-busy', 'true');
      const sp = document.createElement('span');
      sp.className = 'lk-spinner lk-spinner--sm';
      sp.setAttribute('aria-hidden', 'true');
      const t = document.createElement('span');
      t.textContent = tx.tf('common.loading');
      statusEl.append(sp, t);
      return;
    }
    listEl.removeAttribute('aria-busy');
    if (kind === 'error') {
      const t = document.createElement('span');
      t.textContent = rootError?.message || tx.t('error');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lk-btn lk-btn--sm lk-btn--outline lk-tree__retry-root';
      btn.textContent = tx.tf('common.retry');
      statusEl.append(t, btn);
      return;
    }
    statusEl.textContent = filterText ? tx.tf('common.noResults') : tx.t('empty');
  }

  function refresh() {
    if (destroyed) return;
    listEl.setAttribute('aria-label', o.ariaLabel || tx.t('label'));
    walk((r) => { if (r.el) { paintNode(r); paintError(r); } });
    paintStatus();
  }

  // --- Expand / collapse ------------------------------------------------------------------
  function applyExpanded(rec, next) {
    rec.expanded = next;
    if (rec.el && rec.collEl) {
      if (next) {
        renderChildren(rec);
        paintSets(rec.children);
        rec.collEl.getBoundingClientRect();   // commit the closed state so the slide starts from it
        rec.collEl.classList.add('lk-collapse--open');
      } else {
        rec.collEl.classList.remove('lk-collapse--open');
        const a = document.activeElement;
        if (a && rec.groupEl && rec.groupEl.contains(a)) rec.el.focus({ preventScroll: true });
        if (tabStop && tabStop !== rec && !visibleNodes().includes(tabStop)) { setTabStop(rec); }
      }
    }
    paintNode(rec);
  }

  function setTabStop(rec) {
    if (tabStop === rec) return;
    const prev = tabStop;
    tabStop = rec;
    if (prev && prev.el) prev.el.tabIndex = -1;
    if (rec && rec.el) rec.el.tabIndex = 0;
  }

  function attachChildren(rec, items) {
    rec.children.forEach(unregister);
    rec.children = (Array.isArray(items) ? items : []).map((c) => makeNode(c, rec));
    rec.children.forEach((c) => { c.level = rec.level + 1; });
    setLevels(rec.children, rec.level + 1, rec);
    if (checkChildren && rec.checked === true) rec.children.forEach((c) => { if (!c.disabled) { c.checked = true; checkDown(c, true, []); } });
    if (checkParents) { const sink = []; recompute(rec, sink); checkUp(rec, sink); }
    if (filterText) computeFilter(false);
  }

  function loadNode(rec, source) {
    return new Promise((resolve) => {
      const ctx = { node: rec, source, component: comp };
      const r = guard(rootEl, o, 'load', undefined, ctx, () => {
        rec.loading = true;
        rec.error = null;
        paintError(rec);
        paintNode(rec);
        const token = ++rec.loadSeq;
        Promise.resolve().then(() => o.loadChildren(rec)).then((items) => {
          if (destroyed || token !== rec.loadSeq) { resolve(false); return; }
          rec.loading = false;
          rec.loaded = true;
          rec.lazy = false;
          attachChildren(rec, items);
          if (rec.el) {
            rec.rendered = false;
            if (rec.groupEl) rec.groupEl.replaceChildren();
            if (!rec.children.length) refreshNode(rec);
          }
          if (typeof o.onLoad === 'function') o.onLoad(rec.children, { node: rec, component: comp });
          resolve(rec.children.length > 0);
        }, (err) => {
          if (destroyed || token !== rec.loadSeq) { resolve(false); return; }
          rec.loading = false;
          rec.error = err || new Error(tx.t('error'));
          paintError(rec);
          paintNode(rec);
          if (typeof o.onError === 'function') o.onError(err, { node: rec, component: comp });
          resolve(false);
        });
        paintNode(rec);
      });
      if (r === false) resolve(false);
      else if (r && typeof r.then === 'function') r.then((v) => { if (v === false) resolve(false); });
    });
  }

  function setExpanded(rec, next, source, emit) {
    if (destroyed || !isBranch(rec) || rec.loading) return;
    if (next === rec.expanded && !(next && rec.lazy && !rec.loaded)) return;
    const finish = () => {
      if (destroyed) return;
      applyExpanded(rec, next);
      if (emit && typeof o.onToggle === 'function') o.onToggle(next, { node: rec, source, component: comp });
    };
    const proceed = () => {
      if (next && rec.lazy && !rec.loaded) {
        loadNode(rec, source).then((ok) => { if (ok) finish(); });
      } else finish();
    };
    if (!emit) { if (!(next && rec.lazy && !rec.loaded)) proceed(); return; }
    guard(rootEl, o, 'toggle', next, { node: rec, source, component: comp }, proceed);
  }

  function refreshNode(rec) {
    const old = rec.el;
    if (!old) return;
    const focused = document.activeElement === old;
    rec.el = null;
    resetDom(rec);
    const li = renderNode(rec);
    old.replaceWith(li);
    if (focused) li.focus({ preventScroll: true });
  }

  // --- Selection ---------------------------------------------------------------------------
  const valueOf = (list) => (multi ? list.map((r) => r.value) : (list[0] ? list[0].value : null));

  function toRecs(payload, fallback) {
    if (!Array.isArray(payload)) return fallback;
    return payload.map((p) => find(p)).filter(Boolean);
  }

  function paintMany(list) { list.forEach((r) => r.el && paintNode(r)); }

  function changeSelection(next, source, node) {
    if (destroyed || !mode) return;
    if (!multi) next = next.slice(0, 1);
    const same = next.length === selected.size && next.every((r) => selected.has(r));
    if (same) return;
    const ctx = { source, kind: 'select', component: comp, node, checked: next.includes(node), nodes: next };
    guard(rootEl, o, 'change', next, ctx, (payload) => {
      let list = toRecs(payload, next);
      if (!multi) list = list.slice(0, 1);
      const prev = Array.from(selected);
      selected = new Set(list);
      prev.forEach((r) => { r.selected = false; });
      list.forEach((r) => { r.selected = true; });
      anchor = node;
      paintMany([...prev, ...list]);
      if (typeof o.onChange === 'function') o.onChange(valueOf(list), { ...ctx, nodes: list, checked: list.includes(node), prev });
    });
  }

  function pickNext(rec, on, e) {
    const cur = Array.from(selected);
    if (!multi) return on ? [rec] : [];
    if (e && e.shiftKey && anchor) {
      const vis = visibleNodes();
      const a = vis.indexOf(anchor);
      const b = vis.indexOf(rec);
      if (a >= 0 && b >= 0) return vis.slice(Math.min(a, b), Math.max(a, b) + 1).filter((r) => !r.disabled);
    }
    if (e && !(e.ctrlKey || e.metaKey)) return [rec];
    return on ? [...cur, rec] : cur.filter((r) => r !== rec);
  }

  function changeCheck(rec, on, source) {
    if (destroyed || !cbMode) return;
    const changes = [];
    applyCheck(rec, on, changes);
    const nodes = checkedNodes();
    revert(changes);
    if (!changes.length) return;
    const ctx = { source, kind: 'check', component: comp, node: rec, checked: on, nodes };
    guard(rootEl, o, 'change', nodes, ctx, (payload) => {
      const replaced = Array.isArray(payload) && payload !== nodes;
      let touched;
      if (replaced) {
        const want = new Set(toRecs(payload, nodes));
        const sink = [];
        all().forEach((r) => { setCheck(r, want.has(r), sink); });
        normalizeChecks();
        touched = all();
      } else {
        const sink = [];
        applyCheck(rec, on, sink);
        touched = sink.map((c) => c.rec);
      }
      paintMany(touched);
      const final = checkedNodes();
      if (typeof o.onChange === 'function') o.onChange(final.map((r) => r.value), { ...ctx, nodes: final, checked: rec.checked === true });
    });
  }

  // --- Filter -------------------------------------------------------------------------------
  function computeFilter(record) {
    const text = filterText.toLowerCase();
    const test = (r) => (typeof o.filterFn === 'function' ? !!o.filterFn(r, filterText) : r.text.toLowerCase().includes(text));
    if (record && !savedExpanded) { savedExpanded = new Set(); walk((r) => { if (r.expanded) savedExpanded.add(r); }); }
    const post = (list) => {
      let any = false;
      list.forEach((r) => {
        const childAny = post(r.children);
        r.matched = test(r);
        r.hidden = !(r.matched || childAny);
        if (childAny) r.expanded = true;
        else if (savedExpanded) r.expanded = savedExpanded.has(r);
        if (!r.hidden) any = true;
      });
      return any;
    };
    post(roots);
  }

  function clearFilter() {
    walk((r) => { r.hidden = false; r.matched = false; if (savedExpanded) r.expanded = savedExpanded.has(r) && isBranch(r); });
    savedExpanded = null;
  }

  // --- Lookup ---------------------------------------------------------------------------------
  function find(ref) {
    if (ref == null) return null;
    if (typeof Node !== 'undefined' && ref instanceof Node) {
      const li = ref.closest ? ref.closest('.lk-tree__node') : null;
      return li ? nodeOf.get(li) || null : null;
    }
    if (typeof ref === 'function') { let hit = null; walk((r) => { if (ref(r)) { hit = r; return false; } return true; }); return hit; }
    if (typeof ref === 'object') {
      if (byId.get(ref.id) === ref) return ref;
      return ref.id != null ? byId.get(ref.id) || null : null;
    }
    if (byId.has(ref)) return byId.get(ref);
    let hit = null;
    walk((r) => { if (r.value === ref || String(r.value) === String(ref) || String(r.id) === String(ref)) { hit = r; return false; } return true; });
    return hit;
  }
  const need = (ref, caller) => {
    const r = find(ref);
    if (!r) throw new Error(`Look.lkTree.${caller}: node not found - "${ref}"`);
    return r;
  };

  // --- Focus / keyboard --------------------------------------------------------------------------
  function focusNode(rec, scroll = true) {
    if (!rec || !rec.el) return;
    setTabStop(rec);
    rec.el.focus({ preventScroll: true });
    if (scroll && rec.el.scrollIntoView) rec.el.scrollIntoView({ block: 'nearest' });
  }

  function activate(rec, e) {
    if (typeof o.onAction === 'function') o.onAction(rec, { component: comp, event: e });
  }

  function onKeydown(e) {
    if (!enabledNow()) return;
    const li = e.target.closest ? e.target.closest('.lk-tree__node') : null;
    if (!li || !listEl.contains(li)) return;
    if (e.target.closest('.lk-tree__retry') && (e.key === 'Enter' || e.key === ' ')) return;
    const rec = nodeOf.get(li);
    if (!rec || e.target !== li) return;
    const vis = visibleNodes();
    const i = vis.indexOf(rec);
    const key = e.key;
    let handled = true;

    if (key === 'ArrowDown') focusNode(vis[Math.min(vis.length - 1, i + 1)]);
    else if (key === 'ArrowUp') focusNode(vis[Math.max(0, i - 1)]);
    else if (key === 'Home') focusNode(vis[0]);
    else if (key === 'End') focusNode(vis[vis.length - 1]);
    else if (key === 'ArrowRight') {
      if (isBranch(rec) && !rec.expanded) { if (!rec.disabled) setExpanded(rec, true, 'key', true); }
      else if (rec.expanded && rec.children.some((c) => !c.hidden)) focusNode(rec.children.find((c) => !c.hidden));
    } else if (key === 'ArrowLeft') {
      if (rec.expanded) setExpanded(rec, false, 'key', true);
      else if (rec.parent) focusNode(rec.parent);
    } else if (key === 'Enter') {
      if (rec.error) { retry(rec); } else if (!rec.disabled) {
        if (mode && !rec.selected) changeSelection(pickNext(rec, true, null), 'select', rec);
        activate(rec, e);
      }
    } else if (key === ' ') {
      if (!rec.disabled) {
        if (cbMode) changeCheck(rec, rec.checked !== true, 'check');
        else if (mode) changeSelection(multi ? (rec.selected ? Array.from(selected).filter((r) => r !== rec) : [...selected, rec]) : [rec], 'select', rec);
      }
    } else if (key === '*') {
      kids(rec.parent).forEach((s) => { if (isBranch(s) && !s.expanded && !s.disabled && !s.hidden) setExpanded(s, true, 'key', true); });
    } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      clearTimeout(typedTimer);
      typed += key.toLowerCase();
      typedTimer = setTimeout(() => { typed = ''; }, TYPEAHEAD_MS);
      const cycle = typed.length > 1 && typed.split('').every((c) => c === typed[0]);
      const needle = cycle ? typed[0] : typed;
      const order = [...vis.slice(i + (typed.length > 1 && !cycle ? 0 : 1)), ...vis.slice(0, i + 1)];
      const hit = order.find((r) => !r.disabled && r.text.toLowerCase().startsWith(needle));
      if (hit) focusNode(hit);
      handled = !!hit || key !== ' ';
    } else handled = false;

    if (handled) e.preventDefault();
  }

  // --- Pointer -------------------------------------------------------------------------------------
  function rowTarget(e) {
    const li = e.target.closest ? e.target.closest('.lk-tree__node') : null;
    if (!li || !listEl.contains(li)) return null;
    const rec = nodeOf.get(li);
    const row = e.target.closest('.lk-tree__row');
    if (!rec || !row || row.parentNode !== li) return null;
    return rec;
  }

  function onClick(e) {
    if (!enabledNow()) return;
    const retryBtn = e.target.closest ? e.target.closest('.lk-tree__retry') : null;
    if (retryBtn) {
      const r = rowTarget(e);
      if (r) retry(r);
      return;
    }
    const rec = rowTarget(e);
    if (!rec) return;
    focusNode(rec, false);
    if (rec.disabled) return;
    if (e.target.closest('.lk-tree__toggle')) {
      if (isBranch(rec)) setExpanded(rec, !rec.expanded, 'click', true);
      return;
    }
    if (cbMode && e.target.closest('.lk-tree__check')) { changeCheck(rec, rec.checked !== true, 'check'); return; }
    if (mode) {
      const on = multi && (e.ctrlKey || e.metaKey) ? !rec.selected : true;
      if (!(multi === false && rec.selected)) changeSelection(pickNext(rec, on, e), 'select', rec);
    }
    if (expandOnClick && isBranch(rec)) setExpanded(rec, !rec.expanded, 'click', true);
  }

  function onDblClick(e) {
    if (!enabledNow()) return;
    const rec = rowTarget(e);
    if (!rec || rec.disabled || e.target.closest('.lk-tree__toggle') || e.target.closest('.lk-tree__check')) return;
    if (!expandOnClick && isBranch(rec)) setExpanded(rec, !rec.expanded, 'click', true);
    activate(rec, e);
  }

  function onRootClick(e) {
    if (e.target.closest && e.target.closest('.lk-tree__retry-root')) retryRoot();
  }

  function onFocusIn(e) {
    const li = e.target.closest ? e.target.closest('.lk-tree__node') : null;
    if (!li || !listEl.contains(li) || e.target !== li) return;
    const rec = nodeOf.get(li);
    if (rec) setTabStop(rec);
  }

  listEl.addEventListener('click', onClick);
  listEl.addEventListener('dblclick', onDblClick);
  listEl.addEventListener('keydown', onKeydown);
  listEl.addEventListener('focusin', onFocusIn);
  statusEl.addEventListener('click', onRootClick);

  // --- Data -----------------------------------------------------------------------------------------
  function retry(rec) {
    if (rec.loading) return;
    rec.error = null;
    paintError(rec);
    setExpanded(rec, true, 'api', true);
  }

  function loadRoot() {
    rootLoading = true;
    rootError = null;
    paintStatus();
    return Promise.resolve().then(() => o.loadChildren(null)).then((items) => {
      if (destroyed) return [];
      rootLoading = false;
      buildModel(Array.isArray(items) ? items : [], false);
      renderRoots();
      if (typeof o.onLoad === 'function') o.onLoad(roots, { node: null, component: comp });
      return roots;
    }, (err) => {
      if (destroyed) return [];
      rootLoading = false;
      rootError = err || new Error(tx.t('error'));
      paintStatus();
      if (typeof o.onError === 'function') o.onError(err, { node: null, component: comp });
      return [];
    });
  }

  function retryRoot() {
    if (ds && ds.canRead) { rootError = null; return ds.load().catch(() => {}); }
    return loadRoot();
  }

  let currentItems = Array.isArray(o.items) ? o.items : [];

  if (o.dataSource) {
    ds = typeof o.dataSource.on === 'function' && typeof o.dataSource.load === 'function' ? o.dataSource : lkDataSource(o.dataSource);
    offs.push(ds.on('change', () => { if (destroyed) return; buildModel(ds.items, true); renderRoots(); }));
    offs.push(ds.on('request:start', () => { rootLoading = true; rootError = null; paintStatus(); }));
    offs.push(ds.on('request:end', () => { rootLoading = false; paintStatus(); }));
    offs.push(ds.on('error', (e) => {
      rootError = (e && e.error) || new Error(tx.t('error'));
      paintStatus();
      if (typeof o.onError === 'function') o.onError(rootError, { node: null, component: comp });
    }));
  }

  listEl.setAttribute('aria-label', o.ariaLabel || tx.t('label'));
  buildModel(ds ? ds.items : currentItems, false);
  renderRoots();
  if (ds) {
    rootLoading = !!ds.loading;
    paintStatus();
    if (o.autoLoad !== false && ds.canRead && !ds.items.length && !ds.loading) ds.load().catch(() => {});
  } else if (!o.items && typeof o.loadChildren === 'function') {
    loadRoot();
  }

  // --- Public API ----------------------------------------------------------------------------------------
  Object.defineProperty(comp, 'value', {
    get() { return valueOf(Array.from(selected)); },
    set(v) {
      if (!mode) return;
      const want = (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => find(x)).filter(Boolean);
      const list = multi ? want : want.slice(0, 1);
      const prev = Array.from(selected);
      prev.forEach((r) => { r.selected = false; });
      selected = new Set(list);
      list.forEach((r) => { r.selected = true; });
      paintMany([...prev, ...list]);
    },
    enumerable: true,
  });
  Object.defineProperty(comp, 'checked', {
    get() { return checkedNodes().map((r) => r.value); },
    set(v) {
      if (!cbMode) return;
      const want = new Set((Array.isArray(v) ? v : []).map((x) => find(x)).filter(Boolean));
      const sink = [];
      all().forEach((r) => setCheck(r, want.has(r), sink));
      normalizeChecks();
      paintMany(all());
    },
    enumerable: true,
  });
  Object.defineProperty(comp, 'nodes', { get() { return roots.slice(); }, enumerable: true });
  Object.defineProperty(comp, 'text', { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true });
  Object.defineProperty(comp, 'filterText', { get() { return filterText; }, enumerable: true });
  Object.defineProperty(comp, 'dataSource', { get() { return ds; }, enumerable: true });

  comp.find = (ref) => find(ref);
  comp.getSelected = () => Array.from(selected);
  comp.getChecked = (optsIn) => checkedNodes(optsIn && optsIn.leavesOnly);

  comp.expand = (ref) => setExpanded(need(ref, 'expand'), true, 'api', true);
  comp.collapse = (ref) => setExpanded(need(ref, 'collapse'), false, 'api', true);
  comp.toggle = (ref) => { const r = need(ref, 'toggle'); setExpanded(r, !r.expanded, 'api', true); };
  /** Expand every loaded branch (silent: no guards, no onToggle; unloaded lazy branches are skipped). */
  comp.expandAll = () => { walk((r) => { if (r.children.length && !r.expanded) applyExpanded(r, true); }); };
  /** Collapse every branch (silent). */
  comp.collapseAll = () => { walk((r) => { if (r.expanded) applyExpanded(r, false); }); ensureTabStop(); };
  /** Expand the ancestors of a node (silent), scroll it into view and optionally focus it. */
  comp.reveal = (ref, focus) => {
    const r = need(ref, 'reveal');
    const chain = [];
    for (let p = r.parent; p; p = p.parent) chain.unshift(p);
    chain.forEach((p) => { if (!p.expanded && p.children.length) applyExpanded(p, true); });
    if (r.el) { if (focus) focusNode(r); else if (r.el.scrollIntoView) r.el.scrollIntoView({ block: 'nearest' }); }
    return r;
  };

  comp.select = (ref) => {
    const r = need(ref, 'select');
    if (!mode) return;
    changeSelection(multi ? [...selected, r] : [r], 'api', r);
  };
  comp.deselect = (ref) => {
    const r = need(ref, 'deselect');
    changeSelection(Array.from(selected).filter((x) => x !== r), 'api', r);
  };
  comp.clearSelection = () => changeSelection([], 'api', null);
  comp.check = (ref) => changeCheck(need(ref, 'check'), true, 'api');
  comp.uncheck = (ref) => changeCheck(need(ref, 'uncheck'), false, 'api');

  /**
   * Add a node (silent).
   * @param {Object|string} item
   * @param {*} [parentRef] — parent node / id / value (default: root)
   * @param {number} [index]
   */
  comp.add = (item, parentRef, index) => {
    const parent = parentRef == null ? null : need(parentRef, 'add');
    const rec = makeNode(item, parent);
    setLevels([rec], parent ? parent.level + 1 : 1, parent);
    const list = kids(parent);
    const at = index == null || index < 0 || index > list.length ? list.length : index;
    const wasBranch = parent ? isBranch(parent) : true;
    list.splice(at, 0, rec);
    if (parent) {
      if (parent.lazy && !parent.loaded) { parent.lazy = false; parent.loaded = true; }
      if (checkChildren && parent.checked === true && !rec.disabled) { rec.checked = true; checkDown(rec, true, []); }
      if (checkParents) { const sink = []; recompute(parent, sink); checkUp(parent, sink); paintMany(sink.map((c) => c.rec)); }
    }
    if (filterText) computeFilter(false);
    if (!parent) renderRoots();
    else if (!wasBranch || !parent.el) { if (parent.el) refreshNode(parent); }
    else {
      parent.children.forEach(resetDom);
      parent.rendered = false;
      parent.groupEl.replaceChildren();
      if (parent.expanded) renderChildren(parent);
    }
    return rec;
  };

  /**
   * Merge fields into a node's data and re-render it (silent). Providing the children field replaces its children.
   * @param {*} ref
   * @param {Object} patch
   */
  comp.update = (ref, patch) => {
    const rec = need(ref, 'update');
    Object.assign(rec.data, patch || {});
    readFields(rec);
    if (patch && Array.isArray(patch[o.childrenField])) {
      rec.children.forEach(unregister);
      rec.children = patch[o.childrenField].map((c) => makeNode(c, rec));
      setLevels(rec.children, rec.level + 1, rec);
      rec.lazy = false;
      rec.loaded = true;
      if (!rec.children.length) rec.expanded = false;
    }
    if (rec.el) refreshNode(rec);
    return rec;
  };

  /** Remove a node and its descendants (silent). */
  comp.remove = (ref) => {
    const rec = need(ref, 'remove');
    const parent = rec.parent;
    const list = kids(parent);
    list.splice(list.indexOf(rec), 1);
    unregister(rec);
    if (rec.el) rec.el.remove();
    if (parent) {
      if (!isBranch(parent)) parent.expanded = false;
      if (checkParents) { const sink = []; recompute(parent, sink); checkUp(parent, sink); paintMany(sink.map((c) => c.rec)); }
      if (parent.el && !isBranch(parent)) refreshNode(parent);
    }
    paintSets(list);
    ensureTabStop();
    paintStatus();
  };

  /** Replace the data (nested items). Selection, checks and expansion are reset to what the items say. */
  comp.setItems = (items) => {
    currentItems = Array.isArray(items) ? items : [];
    buildModel(currentItems, false);
    renderRoots();
  };

  /**
   * Show only nodes whose text matches (plus their ancestors, which are expanded; the previous
   * expansion returns when the filter is cleared). `''` / null clears it.
   */
  comp.filter = (text) => {
    const next = String(text == null ? '' : text).trim();
    if (next === filterText) return;
    filterText = next;
    if (!filterText) clearFilter(); else computeFilter(true);
    renderRoots();
  };

  /**
   * Reload a node's children (`loadChildren`), or with no argument the whole tree
   * (dataSource.load(), loadChildren(null), or a re-render of the current items).
   * @param {*} [ref]
   * @returns {Promise}
   */
  comp.reload = (ref) => {
    if (ref != null) {
      const rec = need(ref, 'reload');
      if (typeof o.loadChildren !== 'function') return Promise.resolve();
      rec.children.forEach(unregister);
      rec.children = [];
      rec.loaded = false;
      rec.lazy = true;
      rec.error = null;
      const wasOpen = rec.expanded;
      rec.expanded = false;
      if (rec.el) refreshNode(rec);
      if (!wasOpen) return Promise.resolve();
      return loadNode(rec, 'api').then((ok) => { if (ok) applyExpanded(rec, true); return rec.children; });
    }
    if (ds && ds.canRead) return ds.load();
    if (!o.items && !ds && typeof o.loadChildren === 'function') return loadRoot();
    buildModel(ds ? ds.items : currentItems, true);
    renderRoots();
    return Promise.resolve(roots);
  };

  comp.focus = () => { ensureTabStop(); if (tabStop) focusNode(tabStop, false); };

  comp.destroy = function () {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(typedTimer);
    listEl.removeEventListener('click', onClick);
    listEl.removeEventListener('dblclick', onDblClick);
    listEl.removeEventListener('keydown', onKeydown);
    listEl.removeEventListener('focusin', onFocusIn);
    statusEl.removeEventListener('click', onRootClick);
    offs.splice(0).forEach((off) => off());
    tx.destroy();
    walk((r) => { r.loadSeq += 1; });
    roots.forEach(resetDom);
    rootEl.remove();
  };

  return comp;
}
