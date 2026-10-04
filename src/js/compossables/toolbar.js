// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkToolbar — programmatic toolbar composable.
 *
 * Builds a `.lk-toolbar` from an `items` array (no markup needed) and owns every
 * component it creates (buttons, menus, dropdowns, textboxes, switches, chips,
 * date pickers, custom renders). Can also lightly enhance an existing
 * `.lk-toolbar` markup block (role, aria-label, roving keyboard focus).
 *
 *   const tb = lkToolbar({
 *     mount: document.body,
 *     ariaLabel: 'Editor',
 *     items: [
 *       { id: 'bold', type: 'button', icon: 'bold', iconOnly: true, text: 'Bold', toggle: true },
 *       { type: 'separator' },
 *       { id: 'q', type: 'search', placeholder: 'Search…', onSearch: (v) => {} },
 *     ],
 *     onAction(item, event, toolbar) {},
 *   });
 *
 * Signatures: lkToolbar(opts) | lkToolbar(target, opts) | lkToolbar(null, opts)
 *
 * @param {Element|string|null|Object} [targetOrOpts]
 * @param {Object} [maybeOpts]
 * @param {Array}   [opts.items]       — item descriptors (see below) or Nodes
 * @param {Element|string} [opts.mount] — where to append a self-created root
 * @param {string}  [opts.variant]     — 'default' | 'primary' | 'dark' | 'flat'
 * @param {boolean} [opts.dense]
 * @param {string}  [opts.align]       — 'start' | 'center' | 'end' | 'between'
 * @param {boolean|string} [opts.wrap] — true/'wrap' (default for built toolbars) | 'scroll' | false
 * @param {string}  [opts.ariaLabel]
 * @param {string}  [opts.className]
 * @param {boolean} [opts.hidden]
 * @param {boolean} [opts.disabled]
 * @param {Function} [opts.onAction]   — (item, event, toolbar) for button/menu clicks and field changes
 *
 * Item types: button, separator, spacer, text, group, menu, dropdown, textbox,
 * search, switch, checkbox, chip, date, custom (and plain Nodes).
 */

import { applyBase } from '../helpers/base.js';
import { lkIcon } from '../components/icon.js';
import { lkDropdown } from '../components/dropdown.js';
import { lkTextbox, lkCheckbox, lkSwitch } from '../components/form.js';
import { lkChip } from '../components/chip.js';
import { lkPopupProxy } from './popupProxy.js';
import { lkDate } from './date.js';

const BTN_COLORS = ['primary', 'secondary', 'positive', 'negative', 'warning', 'info'];
const VARIANTS = ['primary', 'dark', 'flat'];
const ALIGNS = ['center', 'end', 'between'];
const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', ''];

let uid = 0;

function isNode(v) {
  return typeof Node !== 'undefined' && v instanceof Node;
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v) && !isNode(v);
}

function resolveArgs(a, b) {
  if (b === undefined && isPlainObject(a)) return { target: null, opts: a };
  return { target: a ?? null, opts: b || {} };
}

function resolveNode(ref, caller) {
  if (ref == null) return null;
  const node = typeof ref === 'string' ? document.querySelector(ref) : ref;
  if (!node) throw new Error(`Look.lkToolbar: ${caller} not found — "${ref}"`);
  return node;
}

function makeIcon(icon, extra) {
  if (!icon) return null;
  if (isNode(icon)) return icon;
  return lkIcon(String(icon), extra);
}

function addClasses(node, value) {
  if (!value) return;
  String(value).split(/\s+/).filter(Boolean).forEach((c) => node.classList.add(c));
}

function isTextEntry(node) {
  if (!node) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA') return true;
  return node.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes((node.getAttribute('type') || '').toLowerCase());
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

export function lkToolbar(targetOrOpts, maybeOpts) {
  const { target, opts } = resolveArgs(targetOrOpts, maybeOpts);
  const options = {
    items: null,
    mount: null,
    variant: 'default',
    dense: false,
    align: 'start',
    wrap: undefined,
    ariaLabel: null,
    className: '',
    hidden: false,
    disabled: false,
    onAction: null,
    ...opts,
  };

  // ---------------------------------------------------------------------------
  // Root
  // ---------------------------------------------------------------------------

  const given = resolveNode(target, 'target');
  const ownsRoot = !given;
  const root = given || document.createElement('div');
  const enhanceMode = !!given && !Array.isArray(options.items) && root.children.length > 0;

  const rootAttrSnapshot = {};
  ['role', 'aria-label', 'aria-orientation', 'aria-disabled', 'disabled'].forEach((a) => {
    rootAttrSnapshot[a] = root.getAttribute(a);
  });
  const addedRootClasses = [];
  function addRootClass(cls) {
    if (!root.classList.contains(cls)) {
      root.classList.add(cls);
      addedRootClasses.push(cls);
    }
  }
  function toggleRootClass(cls, on) {
    if (on) addRootClass(cls);
    else if (root.classList.contains(cls)) {
      root.classList.remove(cls);
      const i = addedRootClasses.indexOf(cls);
      if (i > -1) addedRootClasses.splice(i, 1);
    }
  }

  addRootClass('lk-toolbar');
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-orientation', 'horizontal');
  if (options.ariaLabel) root.setAttribute('aria-label', options.ariaLabel);
  if (options.className) String(options.className).split(/\s+/).filter(Boolean).forEach(addRootClass);

  let variant = 'default';
  function setVariant(v) {
    VARIANTS.forEach((x) => toggleRootClass(`lk-toolbar--${x}`, false));
    variant = VARIANTS.includes(v) ? v : 'default';
    if (variant !== 'default') addRootClass(`lk-toolbar--${variant}`);
  }
  if (options.variant && options.variant !== 'default') setVariant(options.variant);
  if (options.dense) addRootClass('lk-toolbar--dense');
  if (ALIGNS.includes(options.align)) addRootClass(`lk-toolbar--align-${options.align}`);

  const wrapMode = options.wrap === undefined ? (enhanceMode ? false : 'wrap') : options.wrap;
  if (wrapMode === true || wrapMode === 'wrap') addRootClass('lk-toolbar--wrap');
  else if (wrapMode === 'scroll') addRootClass('lk-toolbar--scroll');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const recs = new Map();      // id -> record (top-level and nested)
  const topRecs = [];          // top-level records in order
  const tabSnapshot = new Map(); // element -> original tabindex attr (null = none)
  const listeners = [];        // [node, type, fn, capture]
  let toolbarDisabled = false;
  let destroyed = false;
  let current = null;          // roving focus element

  function listen(node, type, fn, capture = false) {
    node.addEventListener(type, fn, capture);
    listeners.push([node, type, fn, capture]);
  }

  const api = {};

  function fireAction(item, event) {
    if (typeof options.onAction === 'function') options.onAction(item, event, api);
  }

  // ---------------------------------------------------------------------------
  // Record helpers
  // ---------------------------------------------------------------------------

  function newRecord(item, parent) {
    const id = item.id != null ? String(item.id) : `lk-tb-${++uid}`;
    if (item.id == null) item.id = id;
    if (recs.has(id)) throw new Error(`Look.lkToolbar: duplicate item id "${id}"`);
    const rec = {
      id,
      item,
      type: item.type || 'button',
      parent,
      el: null,          // outer node inserted into the toolbar / group
      comp: null,        // instance returned by get(id)
      children: null,    // group child records
      cleanup: [],       // teardown fns
      setDisabled: null, // (bool) => void
      setActive: null,   // (bool) => void
    };
    recs.set(id, rec);
    return rec;
  }

  function effectiveDisabled(rec) {
    if (toolbarDisabled) return true;
    let r = rec;
    while (r) {
      if (r.item.disabled) return true;
      r = r.parent;
    }
    return false;
  }

  function applyDisabled(rec) {
    const off = effectiveDisabled(rec);
    if (rec.setDisabled) rec.setDisabled(off);
    if (rec.children) rec.children.forEach(applyDisabled);
  }

  function applyCommon(rec) {
    const { item, el } = rec;
    el.setAttribute('data-lk-id', rec.id);
    addClasses(el, item.className);
    const tip = item.tooltip ?? item.title;
    if (tip && !el.hasAttribute('title')) el.setAttribute('title', tip);
    if (item.hidden) el.classList.add('lk-hidden');
  }

  function groupSiblings(rec) {
    const name = rec.item.group;
    if (!name) return [];
    return Array.from(recs.values()).filter((r) => r !== rec && r.type === 'button' && r.item.group === name);
  }

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------

  function buildButtonEl(item, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lk-toolbar__btn' + (extraClass ? ` ${extraClass}` : '');
    const icon = makeIcon(item.icon);
    if (icon) btn.appendChild(icon);
    let label = null;
    if (item.text != null && item.text !== '') {
      if (item.iconOnly && icon) {
        btn.setAttribute('aria-label', String(item.text));
        if (!item.title && !item.tooltip) btn.setAttribute('title', String(item.text));
      } else {
        label = document.createElement('span');
        label.className = 'lk-toolbar__btn-label';
        label.textContent = String(item.text);
        btn.appendChild(label);
      }
    }
    if (icon && (item.iconOnly || !label)) btn.classList.add('lk-toolbar__btn--icon');
    if (item.color && BTN_COLORS.includes(item.color)) btn.classList.add(`lk-toolbar__btn--${item.color}`);
    return { btn, label };
  }

  function renderButton(rec) {
    const { item } = rec;
    const { btn, label } = buildButtonEl(item);
    rec.el = btn;
    const pressable = !!(item.toggle || item.group);

    function paintActive() {
      btn.classList.toggle('lk-toolbar__btn--active', !!item.active);
      if (pressable) btn.setAttribute('aria-pressed', String(!!item.active));
    }

    rec.setActive = (on) => {
      item.active = !!on;
      if (on && item.group) {
        groupSiblings(rec).forEach((r) => { if (r.item.active) r.setActive(false); });
      }
      paintActive();
    };

    rec.setDisabled = (off) => { btn.disabled = off; };

    function onClick(e) {
      if (item.group) {
        if (!item.active) rec.setActive(true);
      } else if (item.toggle) {
        rec.setActive(!item.active);
      }
      if (typeof item.onClick === 'function') item.onClick(item, api, e);
      fireAction(item, e);
    }
    btn.addEventListener('click', onClick);
    rec.cleanup.push(() => btn.removeEventListener('click', onClick));
    paintActive();

    rec.comp = {
      el: btn,
      item,
      get active() { return !!item.active; },
      set active(v) { rec.setActive(v); },
      get enabled() { return !btn.disabled; },
      set enabled(v) { item.disabled = !v; applyDisabled(rec); },
      get hidden() { return btn.classList.contains('lk-hidden'); },
      set hidden(v) { api.setHidden(rec.id, v); },
      get text() { return item.text; },
      set text(v) {
        item.text = v;
        if (label) label.textContent = v == null ? '' : String(v);
        else btn.setAttribute('aria-label', v == null ? '' : String(v));
      },
      click() { btn.click(); },
      focus() { btn.focus(); },
    };
  }

  function renderSimple(rec, tag, cls, extra) {
    const el = document.createElement(tag);
    el.className = cls;
    if (extra) extra(el);
    rec.el = el;
    rec.comp = { el, item: rec.item };
  }

  function renderGroup(rec) {
    const el = document.createElement('div');
    el.className = 'lk-toolbar__group';
    el.setAttribute('role', 'group');
    if (rec.item.ariaLabel || rec.item.text) el.setAttribute('aria-label', rec.item.ariaLabel || rec.item.text);
    rec.el = el;
    rec.children = [];
    (rec.item.items || []).forEach((child) => {
      const childRec = renderItem(child, rec);
      rec.children.push(childRec);
      el.appendChild(childRec.el);
    });
    rec.comp = { el, item: rec.item, get children() { return rec.children.map((r) => r.comp); } };
  }

  function renderMenu(rec) {
    const { item } = rec;
    const { btn } = buildButtonEl(item, 'lk-toolbar__btn--has-dropdown');
    rec.el = btn;

    const menu = document.createElement('div');
    menu.className = 'lk-toolbar-menu';
    menu.setAttribute('role', 'menu');
    if (item.text) menu.setAttribute('aria-label', String(item.text));
    const entries = [];
    let proxy = null;

    (item.items || []).forEach((mi) => {
      if (mi.separator || mi.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'lk-toolbar-menu__separator';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lk-toolbar-menu__item';
      b.setAttribute('role', 'menuitem');
      b.tabIndex = -1;
      const ic = makeIcon(mi.icon);
      if (ic) b.appendChild(ic);
      const t = document.createElement('span');
      t.className = 'lk-toolbar-menu__label';
      t.textContent = mi.text == null ? '' : String(mi.text);
      b.appendChild(t);
      if (mi.shortcut) {
        const k = document.createElement('span');
        k.className = 'lk-toolbar-menu__shortcut';
        k.textContent = String(mi.shortcut);
        b.appendChild(k);
      }
      if (mi.disabled) b.disabled = true;
      addClasses(b, mi.className);
      b.addEventListener('click', (e) => {
        proxy?.hide('select');
        if (typeof mi.onClick === 'function') mi.onClick(mi, api, e);
        fireAction(mi, e);
      });
      entries.push(b);
      menu.appendChild(b);
    });

    function enabledEntries() { return entries.filter((b) => !b.disabled); }

    function onMenuKeydown(e) {
      const list = enabledEntries();
      if (!list.length) return;
      const idx = list.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowDown') next = list[(idx + 1) % list.length];
      else if (e.key === 'ArrowUp') next = list[(idx - 1 + list.length) % list.length];
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list[list.length - 1];
      else if (e.key === 'Tab') { proxy?.hide('tab'); return; }
      if (next) { e.preventDefault(); next.focus(); }
    }
    menu.addEventListener('keydown', onMenuKeydown);

    proxy = lkPopupProxy(btn, {
      content: '',
      placement: item.placement || 'bottom-left',
      gap: 4,
      className: 'lk-toolbar-menu-panel' + (root.classList.contains('lk-toolbar--dense') ? ' lk-toolbar-menu-panel--dense' : ''),
      onShow() {
        btn.setAttribute('aria-haspopup', 'menu');
        btn.classList.add('is-pressed');
        const first = enabledEntries()[0];
        if (first) requestAnimationFrame(() => { if (proxy?.isOpen) first.focus({ preventScroll: true }); });
      },
      onHide(reason) {
        btn.classList.remove('is-pressed');
        if ((reason === 'escape' || reason === 'select') && menu.contains(document.activeElement)) btn.focus();
      },
    });
    proxy.panelEl.appendChild(menu); // live DOM (setContent would clone and drop listeners)
    btn.setAttribute('aria-haspopup', 'menu');

    function onBtnKeydown(e) {
      if (e.key === 'ArrowDown' && !proxy.isOpen) {
        e.preventDefault();
        proxy.show(btn);
      }
    }
    btn.addEventListener('keydown', onBtnKeydown);

    rec.setDisabled = (off) => {
      btn.disabled = off;
      if (off) proxy.hide('disabled');
    };
    rec.cleanup.push(() => {
      btn.removeEventListener('keydown', onBtnKeydown);
      menu.removeEventListener('keydown', onMenuKeydown);
      proxy.destroy();
    });
    rec.comp = {
      el: btn,
      item,
      menuEl: menu,
      proxy,
      open() { proxy.show(btn); },
      close() { proxy.hide('api'); },
      get isOpen() { return proxy.isOpen; },
    };
  }

  function fieldContainer(rec, kind) {
    const wrap = document.createElement('span');
    wrap.className = `lk-toolbar__field lk-toolbar__field--${kind}`;
    const w = rec.item.width;
    if (w != null) wrap.style.width = typeof w === 'number' ? `${w}px` : String(w);
    rec.el = wrap;
    return wrap;
  }

  function compDisabler(rec, fallbackNode) {
    return (off) => {
      const c = rec.comp;
      if (c && 'disabled' in c) c.disabled = off;
      else if (c && 'enabled' in c) c.enabled = !off;
      else if (fallbackNode) fallbackNode.disabled = off;
    };
  }

  function renderDropdown(rec) {
    const { item } = rec;
    const wrap = fieldContainer(rec, 'dropdown');
    const anchor = document.createElement('div');
    wrap.appendChild(anchor);
    const o = { ...(item.options || {}) };
    if (o.label == null && item.text) o.ariaLabel = item.text;
    const userChange = o.onChange;
    o.onChange = (value, picked) => {
      if (typeof userChange === 'function') userChange(value, picked);
      if (typeof item.onChange === 'function') item.onChange(value, item, api);
      fireAction(item, { type: 'change', value, item: picked });
    };
    rec.comp = lkDropdown(anchor, o);
    const trig = wrap.querySelector('.lk-dropdown__trigger');
    if (trig && !trig.hasAttribute('aria-label') && (item.ariaLabel || item.text || item.title)) {
      trig.setAttribute('aria-label', item.ariaLabel || item.text || item.title);
    }
    rec.setDisabled = compDisabler(rec);
    rec.cleanup.push(() => rec.comp.destroy());
  }

  function renderTextbox(rec, search) {
    const { item } = rec;
    const wrap = fieldContainer(rec, search ? 'search' : 'textbox');
    const input = document.createElement('input');
    input.type = search ? 'search' : (item.options?.type || 'text');
    const ph = item.placeholder ?? item.options?.placeholder;
    if (ph) input.placeholder = ph;
    if (item.value != null) input.value = item.value;
    const aria = item.ariaLabel || item.text || ph || item.title;
    if (aria && !item.options?.label) input.setAttribute('aria-label', aria);
    wrap.appendChild(input);
    const o = { ...(item.options || {}) };
    delete o.placeholder;
    if (search && o.prepend == null) o.prepend = lkIcon('search', { size: 'sm' });
    else if (!search && item.icon && o.prepend == null) o.prepend = makeIcon(item.icon, { size: 'sm' });
    rec.comp = lkTextbox(input, o);
    rec.inputEl = input;

    let timer = null;
    function emitSearch(e) {
      clearTimeout(timer);
      timer = null;
      if (typeof item.onSearch === 'function') item.onSearch(input.value, item, api);
      fireAction(item, e || { type: 'search', value: input.value });
    }
    function onInput(e) {
      if (typeof item.onInput === 'function') item.onInput(input.value, item, api, e);
      if (search) {
        clearTimeout(timer);
        timer = setTimeout(() => emitSearch({ type: 'search', value: input.value }), item.debounce ?? 250);
      }
    }
    function onKeydown(e) {
      if (search && e.key === 'Enter') emitSearch({ type: 'search', value: input.value });
    }
    function onChange(e) {
      if (search) return;
      if (typeof item.onChange === 'function') item.onChange(input.value, item, api, e);
      fireAction(item, e);
    }
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    input.addEventListener('change', onChange);
    rec.setDisabled = (off) => { input.disabled = off; };
    rec.cleanup.push(() => {
      clearTimeout(timer);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      input.removeEventListener('change', onChange);
      rec.comp.destroy();
    });
  }

  function renderCheck(rec, kind) {
    const { item } = rec;
    const label = document.createElement('label');
    label.className = `lk-toolbar__check lk-toolbar__check--${kind}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    label.appendChild(input);
    const text = item.label ?? item.text;
    if (text != null && text !== '') {
      const span = document.createElement('span');
      span.className = 'lk-toolbar__check-label';
      span.textContent = String(text);
      label.appendChild(span);
    }
    rec.el = label;
    const o = { ...(item.options || {}) };
    delete o.label; // a .lk-field wrapper would break the inline toolbar layout
    if (item.checked != null && o.checked == null) o.checked = item.checked;
    rec.comp = kind === 'switch' ? lkSwitch(input, o) : lkCheckbox(input, o);
    rec.inputEl = input;
    function onChange(e) {
      item.checked = input.checked;
      if (typeof item.onChange === 'function') item.onChange(input.checked, item, api, e);
      fireAction(item, e);
    }
    input.addEventListener('change', onChange);
    rec.setDisabled = (off) => {
      input.disabled = off;
      label.classList.toggle('lk-toolbar__check--disabled', off);
    };
    rec.setActive = (on) => { rec.comp.checked = !!on; item.checked = !!on; };
    rec.cleanup.push(() => {
      input.removeEventListener('change', onChange);
      rec.comp.destroy();
    });
  }

  function renderChip(rec) {
    const { item } = rec;
    const span = document.createElement('span');
    const o = { ...(item.options || {}) };
    if (o.label == null && item.text != null) o.label = item.text;
    if (o.dense == null && root.classList.contains('lk-toolbar--dense')) o.dense = true;
    const userSelect = o.onSelect;
    if (typeof userSelect === 'function' || item.toggle) {
      o.onSelect = (sel) => {
        item.active = sel;
        if (typeof userSelect === 'function') userSelect(sel);
        fireAction(item, { type: 'select', selected: sel });
      };
    }
    const userClick = o.onClick;
    if (typeof userClick === 'function') {
      o.onClick = (...args) => {
        userClick(...args);
        fireAction(item, { type: 'click' });
      };
    }
    rec.el = span;
    rec.comp = lkChip(span, o);
    rec.setDisabled = (off) => { rec.comp.enabled = !off; };
    rec.setActive = (on) => { if ('selected' in rec.comp) rec.comp.selected = !!on; };
    rec.cleanup.push(() => rec.comp.destroy());
  }

  function renderDate(rec) {
    const { item } = rec;
    const icon = item.icon === undefined ? 'calendar' : item.icon;
    const { btn, label } = buildButtonEl({ ...item, icon, iconOnly: false, text: item.placeholder || item.text || 'Pick a date' });
    btn.classList.add('lk-toolbar__btn--date');
    btn.classList.remove('lk-toolbar__btn--icon');
    rec.el = btn;
    const o = { ...(item.options || {}) };
    const locale = o.locale || 'en-US';
    const placeholder = item.placeholder || item.text || 'Pick a date';

    function fmt(d) {
      if (!d) return '';
      const style = o.time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
      return new Intl.DateTimeFormat(locale, style).format(d);
    }
    function paint() {
      const v = rec.comp?.value;
      let txt = '';
      if (typeof item.format === 'function') txt = item.format(v);
      else if (Array.isArray(v)) txt = v[0] ? `${fmt(v[0])} – ${v[1] ? fmt(v[1]) : '…'}` : '';
      else txt = fmt(v);
      if (label) label.textContent = txt || placeholder;
      btn.classList.toggle('lk-toolbar__btn--placeholder', !txt);
    }
    const userChange = o.onChange;
    const userConfirm = o.onConfirm;
    o.onChange = (value, meta) => {
      if (typeof userChange === 'function') userChange(value, meta);
      if (o.time) return; // time mode commits on OK (onConfirm)
      queueMicrotask(paint);
      if (typeof item.onChange === 'function') item.onChange(value, item, api);
      fireAction(item, { type: 'change', value });
    };
    o.onConfirm = (value, dateApi) => {
      if (typeof userConfirm === 'function') userConfirm(value, dateApi);
      queueMicrotask(paint);
      if (o.time) {
        if (typeof item.onChange === 'function') item.onChange(value, item, api);
        fireAction(item, { type: 'change', value });
      }
    };
    rec.comp = lkDate(btn, o);
    paint();
    rec.setDisabled = (off) => {
      btn.disabled = off;
      if (off && rec.comp.isOpen) rec.comp.close();
    };
    rec.cleanup.push(() => rec.comp.destroy());
  }

  function renderCustom(rec) {
    const { item } = rec;
    const wrap = document.createElement('span');
    wrap.className = 'lk-toolbar__custom';
    rec.el = wrap;
    let result = null;
    if (typeof item.render === 'function') result = item.render(wrap, api);
    else if (item.el) result = item.el;
    if (isNode(result)) {
      if (!wrap.contains(result)) wrap.appendChild(result);
      rec.comp = { el: result, item };
    } else if (result && typeof result === 'object') {
      if (isNode(result.el) && !wrap.contains(result.el)) wrap.appendChild(result.el);
      rec.comp = result;
      if (typeof result.destroy === 'function') rec.cleanup.push(() => result.destroy());
    } else {
      rec.comp = { el: wrap, item };
    }
    rec.setDisabled = (off) => {
      const c = rec.comp;
      if (c && typeof c.setDisabled === 'function') c.setDisabled(off);
      else if (c && 'enabled' in c) c.enabled = !off;
      wrap.classList.toggle('lk-toolbar__custom--disabled', off);
      wrap.querySelectorAll('button, input, select, textarea').forEach((n) => { n.disabled = off; });
    };
  }

  function renderNode(rec, node) {
    rec.el = node;
    rec.comp = { el: node, item: rec.item };
    rec.setDisabled = (off) => {
      if ('disabled' in node) node.disabled = off;
      node.classList.toggle('lk-disabled', off);
    };
  }

  function renderItem(raw, parent = null) {
    let item = raw;
    let node = null;
    if (isNode(raw)) {
      node = raw;
      item = { type: 'node', id: raw.getAttribute?.('data-lk-id') || undefined };
    } else if (!isPlainObject(raw)) {
      throw new Error('Look.lkToolbar: items must be objects or Nodes.');
    }
    const rec = newRecord(item, parent);
    if (node) rec.raw = node;
    try {
      switch (rec.type) {
        case 'node': renderNode(rec, node); break;
        case 'button': renderButton(rec); break;
        case 'separator':
          renderSimple(rec, 'div', 'lk-toolbar__separator', (el) => {
            el.setAttribute('role', 'separator');
            el.setAttribute('aria-orientation', 'vertical');
          });
          break;
        case 'spacer': renderSimple(rec, 'div', 'lk-toolbar__spacer', (el) => el.setAttribute('aria-hidden', 'true')); break;
        case 'text':
          renderSimple(rec, 'span', 'lk-toolbar__text', (el) => {
            const ic = makeIcon(item.icon, { size: 'sm' });
            if (ic) el.appendChild(ic);
            el.appendChild(document.createTextNode(item.text == null ? '' : String(item.text)));
          });
          rec.comp.setText = (v) => {
            item.text = v;
            const last = rec.el.lastChild;
            if (last && last.nodeType === Node.TEXT_NODE) last.textContent = v == null ? '' : String(v);
          };
          break;
        case 'group': renderGroup(rec); break;
        case 'menu': renderMenu(rec); break;
        case 'dropdown': renderDropdown(rec); break;
        case 'textbox': renderTextbox(rec, false); break;
        case 'search': renderTextbox(rec, true); break;
        case 'switch': renderCheck(rec, 'switch'); break;
        case 'checkbox': renderCheck(rec, 'checkbox'); break;
        case 'chip': renderChip(rec); break;
        case 'date': renderDate(rec); break;
        case 'custom': renderCustom(rec); break;
        default:
          throw new Error(`Look.lkToolbar: unknown item type "${rec.type}"`);
      }
    } catch (err) {
      disposeRecord(rec);
      throw err;
    }
    if (rec.type !== 'node') applyCommon(rec);
    else rec.el.setAttribute?.('data-lk-id', rec.id);
    applyDisabled(rec);
    return rec;
  }

  function disposeRecord(rec) {
    if (rec.children) rec.children.slice().forEach(disposeRecord);
    rec.cleanup.splice(0).reverse().forEach((fn) => {
      try { fn(); } catch (e) { /* keep tearing down */ }
    });
    if (rec.el) {
      if (current && rec.el.contains(current)) current = null;
      rec.el.querySelectorAll?.(FOCUSABLE).forEach((n) => tabSnapshot.delete(n));
      tabSnapshot.delete(rec.el);
      rec.el.remove();
    }
    recs.delete(rec.id);
  }

  // ---------------------------------------------------------------------------
  // Roving tabindex
  // ---------------------------------------------------------------------------

  function isVisible(n) {
    return !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
  }

  function candidates() {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((n) => {
      if (n.disabled || n.closest('[inert]')) return false;
      if (n.tagName === 'INPUT' && n.type === 'hidden') return false;
      if (n.closest('.lk-hidden')) return false;
      // Respect author-declared non-focusable elements we never touched
      if (!tabSnapshot.has(n) && n.getAttribute('tabindex') === '-1') return false;
      return isVisible(n);
    });
  }

  function setTab(n, value) {
    if (!tabSnapshot.has(n)) tabSnapshot.set(n, n.getAttribute('tabindex'));
    if (n.getAttribute('tabindex') !== String(value)) n.setAttribute('tabindex', String(value));
  }

  function refreshRoving() {
    if (destroyed) return;
    const list = candidates();
    if (!list.includes(current)) current = list[0] || null;
    list.forEach((n) => setTab(n, n === current ? 0 : -1));
  }

  function focusCandidate(n) {
    if (!n) return;
    current = n;
    refreshRoving();
    n.focus();
    if (isTextEntry(n) && typeof n.select === 'function') {
      try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) { /* type without caret */ }
    }
  }

  function onRootFocusin(e) {
    const list = candidates();
    const hit = list.find((n) => n === e.target) || list.find((n) => n.contains(e.target));
    if (hit && hit !== current) {
      current = hit;
      list.forEach((n) => setTab(n, n === current ? 0 : -1));
    }
  }

  function onRootKeydown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const { key } = e;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    const t = e.target;
    if (t.tagName === 'SELECT') return;
    if (isTextEntry(t)) {
      // Keep caret movement; only leave the field from its edges with arrows.
      if (key === 'Home' || key === 'End') return;
      let start; let end;
      try { start = t.selectionStart; end = t.selectionEnd; } catch (err) { return; }
      if (start == null || start !== end) return;
      if (key === 'ArrowLeft' && start !== 0) return;
      if (key === 'ArrowRight' && end !== (t.value || '').length) return;
    } else if (t.tagName === 'INPUT' && !['checkbox', 'button', 'submit', 'reset'].includes(t.type)) {
      return; // number/date/range inputs own their arrows
    }
    const list = candidates();
    if (!list.length) return;
    let idx = list.indexOf(t);
    if (idx < 0) idx = list.findIndex((n) => n.contains(t));
    let next;
    if (key === 'Home') next = list[0];
    else if (key === 'End') next = list[list.length - 1];
    else if (key === 'ArrowRight') next = list[(idx + 1) % list.length];
    else next = list[(idx - 1 + list.length) % list.length];
    if (!next || next === t) return;
    e.preventDefault();
    focusCandidate(next);
  }

  listen(root, 'focusin', onRootFocusin);
  listen(root, 'keydown', onRootKeydown);

  // ---------------------------------------------------------------------------
  // Enhance-mode bookkeeping
  // ---------------------------------------------------------------------------

  const enhancedDisabled = new Map(); // button -> original disabled
  function enhanceSetDisabled(off) {
    root.querySelectorAll('button, input, select, textarea').forEach((n) => {
      if (recs.size && n.closest('[data-lk-id]')) return; // managed items handle themselves
      if (!enhancedDisabled.has(n)) enhancedDisabled.set(n, n.disabled);
      n.disabled = off ? true : enhancedDisabled.get(n);
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function findRec(id) {
    const rec = recs.get(String(id));
    return rec || null;
  }

  function insertTop(rec, index) {
    const at = index == null || index < 0 || index >= topRecs.length ? topRecs.length : index;
    const ref = topRecs[at]?.el || null;
    root.insertBefore(rec.el, ref && ref.parentNode === root ? ref : null);
    topRecs.splice(at, 0, rec);
  }

  const base = {};
  applyBase(base, root);

  Object.defineProperties(api, {
    el: { value: root, enumerable: true },
    id: {
      get() { return base.id; },
      set(v) { base.id = v; },
      enumerable: true,
    },
    hidden: {
      get() { return base.hidden; },
      set(v) { base.hidden = v; },
      enumerable: true,
    },
    enabled: {
      get() { return !toolbarDisabled; },
      set(v) {
        toolbarDisabled = !v;
        root.classList.toggle('lk-disabled', toolbarDisabled);
        if (toolbarDisabled) root.setAttribute('aria-disabled', 'true');
        else root.removeAttribute('aria-disabled');
        topRecs.forEach(applyDisabled);
        enhanceSetDisabled(toolbarDisabled);
        refreshRoving();
      },
      enumerable: true,
    },
    dense: {
      get() { return root.classList.contains('lk-toolbar--dense'); },
      set(v) { toggleRootClass('lk-toolbar--dense', !!v); },
      enumerable: true,
    },
    variant: {
      get() { return variant; },
      set(v) { setVariant(v); },
      enumerable: true,
    },
    items: {
      get() { return topRecs.map((r) => (r.type === 'node' ? r.raw : r.item)); },
      enumerable: true,
    },
  });

  api.add = function add(item, index) {
    if (destroyed) return null;
    const rec = renderItem(item, null);
    insertTop(rec, index);
    refreshRoving();
    return rec.comp;
  };

  api.remove = function remove(id) {
    const rec = findRec(id);
    if (!rec) return false;
    if (rec.parent) {
      const list = rec.parent.children;
      list.splice(list.indexOf(rec), 1);
      const descList = rec.parent.item.items;
      if (Array.isArray(descList)) {
        const i = descList.indexOf(rec.item);
        if (i > -1) descList.splice(i, 1);
      }
    } else {
      topRecs.splice(topRecs.indexOf(rec), 1);
    }
    disposeRecord(rec);
    refreshRoving();
    return true;
  };

  api.get = (id) => findRec(id)?.comp ?? null;
  api.getEl = (id) => findRec(id)?.el ?? null;
  api.getItem = (id) => findRec(id)?.item ?? null;

  api.setActive = function setActive(id, on = true) {
    const rec = findRec(id);
    if (rec?.setActive) rec.setActive(!!on);
    return api;
  };

  api.setDisabled = function setDisabled(id, off = true) {
    const rec = findRec(id);
    if (!rec) return api;
    rec.item.disabled = !!off;
    applyDisabled(rec);
    refreshRoving();
    return api;
  };

  api.setHidden = function setHidden(id, hide = true) {
    const rec = findRec(id);
    if (!rec) return api;
    rec.item.hidden = !!hide;
    rec.el.classList.toggle('lk-hidden', !!hide);
    if (hide && rec.type === 'menu') rec.comp.close();
    if (hide && rec.type === 'dropdown') rec.comp.close?.();
    refreshRoving();
    return api;
  };

  api.clear = function clear() {
    topRecs.splice(0).forEach(disposeRecord);
    refreshRoving();
    return api;
  };

  api.setItems = function setItems(items) {
    api.clear();
    (items || []).forEach((it) => insertTop(renderItem(it, null)));
    refreshRoving();
    return api;
  };

  api.refresh = refreshRoving;

  api.focus = function focus() {
    refreshRoving();
    current?.focus();
  };

  api.destroy = function destroy() {
    if (destroyed) return;
    topRecs.splice(0).forEach(disposeRecord);
    destroyed = true;
    listeners.splice(0).forEach(([n, type, fn, cap]) => n.removeEventListener(type, fn, cap));

    // Restore tabindex / disabled state of markup we enhanced
    tabSnapshot.forEach((orig, n) => {
      if (orig == null) n.removeAttribute('tabindex');
      else n.setAttribute('tabindex', orig);
    });
    tabSnapshot.clear();
    enhancedDisabled.forEach((orig, n) => { n.disabled = orig; });
    enhancedDisabled.clear();

    if (ownsRoot) {
      root.remove();
      return;
    }
    root.classList.remove('lk-hidden', 'lk-disabled');
    addedRootClasses.splice(0).forEach((c) => root.classList.remove(c));
    Object.entries(rootAttrSnapshot).forEach(([a, v]) => {
      if (v == null) root.removeAttribute(a);
      else root.setAttribute(a, v);
    });
  };

  // ---------------------------------------------------------------------------
  // Initial render
  // ---------------------------------------------------------------------------

  if (Array.isArray(options.items)) {
    options.items.forEach((it) => insertTop(renderItem(it, null)));
  }

  if (ownsRoot && options.mount) resolveNode(options.mount, 'mount').appendChild(root);
  if (options.hidden) api.hidden = true;
  if (options.disabled) api.enabled = false;
  refreshRoving();
  // Visibility-based filtering needs layout; settle once the root is attached.
  if (!root.isConnected || !candidates().length) {
    requestAnimationFrame(() => { if (!destroyed) refreshRoving(); });
  }

  return api;
}
