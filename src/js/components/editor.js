// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// lkEditor — WYSIWYG rich-text HTML editor that enhances a <textarea>.
//
// Implementation note: the actual rich-text editing commands (bold, lists, alignment,
// links, colors, headings, ...) are implemented with `document.execCommand` /
// `document.queryCommandState`. Yes, this API is formally deprecated — but it remains
// implemented and functional in every current evergreen browser for exactly this
// feature set, and reimplementing a WYSIWYG editing engine from scratch on the raw
// Selection/Range APIs (with zero dependencies, as this library requires) is out of
// scope for this component. This is a pragmatic, deliberate choice, not an oversight.

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { attachValidation } from '../helpers/validation.js';
import { createElement } from '../core/index.js';
import { lkIcon } from './icon.js';
import { lkTextbox, lkCheckbox } from './form.js';
import { lkColor } from './color.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';
import { lkToolbar } from '../composables/toolbar.js';
import { lkPopupProxy } from '../composables/popupProxy.js';

lkI18n.define('editor', {
  ariaLabel: 'Rich text editor',
  placeholder: 'Write something…',
  required: 'This field is required',
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.bold': 'Bold',
  'toolbar.italic': 'Italic',
  'toolbar.underline': 'Underline',
  'toolbar.strike': 'Strikethrough',
  'toolbar.textColor': 'Text color',
  'toolbar.highlightColor': 'Highlight color',
  'toolbar.alignLeft': 'Align left',
  'toolbar.alignCenter': 'Align center',
  'toolbar.alignRight': 'Align right',
  'toolbar.alignJustify': 'Justify',
  'toolbar.orderedList': 'Numbered list',
  'toolbar.unorderedList': 'Bullet list',
  'toolbar.link': 'Insert link',
  'toolbar.codeBlock': 'Code block',
  'toolbar.clearFormat': 'Clear formatting',
  'toolbar.source': 'View source',
  'formatBlock.paragraph': 'Paragraph',
  'formatBlock.h1': 'Heading 1',
  'formatBlock.h2': 'Heading 2',
  'formatBlock.h3': 'Heading 3',
  'formatBlock.h4': 'Heading 4',
  'formatBlock.h5': 'Heading 5',
  'formatBlock.h6': 'Heading 6',
  'formatBlock.blockquote': 'Blockquote',
  'formatBlock.pre': 'Preformatted',
  'fontSize.small': 'Small',
  'fontSize.normal': 'Normal',
  'fontSize.large': 'Large',
  'fontSize.huge': 'Huge',
  'link.url': 'URL',
  'link.urlPlaceholder': 'https://example.com',
  'link.newTab': 'Open in new tab',
  'link.remove': 'Remove link',
  'source.label': 'HTML source',
});

// -----------------------------------------------------------------------------
// Sanitizer — a best-effort, allowlist-based client-side HTML sanitizer for
// display/editing safety (initial value, setValue(), pasted content, and content
// coming back from the raw-HTML source view). It is NOT a substitute for
// server-side sanitization of anything that will later be rendered to other users.
// -----------------------------------------------------------------------------

const DANGEROUS_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form']);

const DEFAULT_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'div',
  'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
];

// style is always allowed (sanitized separately below); everything else must be named here.
const DEFAULT_ALLOWED_ATTRS = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
};

function buildTagSet(extra) {
  const set = new Set(DEFAULT_ALLOWED_TAGS);
  if (Array.isArray(extra)) extra.forEach((t) => set.add(String(t).toLowerCase()));
  return set;
}

function buildAttrMap(extra) {
  const map = {};
  Object.entries(DEFAULT_ALLOWED_ATTRS).forEach(([tag, attrs]) => { map[tag] = new Set(attrs); });
  if (Array.isArray(extra)) {
    if (!map['*']) map['*'] = new Set();
    extra.forEach((a) => map['*'].add(String(a).toLowerCase()));
  } else if (extra && typeof extra === 'object') {
    Object.entries(extra).forEach(([tag, attrs]) => {
      const key = String(tag).toLowerCase();
      if (!map[key]) map[key] = new Set();
      (Array.isArray(attrs) ? attrs : [attrs]).forEach((a) => map[key].add(String(a).toLowerCase()));
    });
  }
  return map;
}

function isSafeUrl(value) {
  const v = String(value || '').replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
  return !(v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:text/html'));
}

// Keep color / background-color / text-align / font-size / text-decoration etc. (what
// execCommand actually produces); drop only the known CSS injection vectors.
function sanitizeStyleValue(value) {
  const v = String(value || '');
  if (/expression\s*\(/i.test(v)) return '';
  if (/url\s*\(\s*['"]?\s*(javascript|vbscript|data:text\/html)\s*:/i.test(v)) return '';
  return v;
}

/**
 * Allowlist-based HTML sanitizer (DOMParser walk). Default allowlist is rich-text-safe:
 * see DEFAULT_ALLOWED_TAGS / DEFAULT_ALLOWED_ATTRS above.
 * @param {string} html
 * @param {Object} [options]
 * @param {string[]|Function} [options.allowedTags]       — array EXTENDS the default tag list; a function (tag) => boolean REPLACES the default check entirely
 * @param {string[]|Object|Function} [options.allowedAttributes] — array EXTENDS the global attribute list (allowed on every kept tag); an object `{ tag: [attrs] }` EXTENDS per tag; a function (tag, attr) => boolean REPLACES the default check entirely
 * @returns {string} sanitized HTML (the cleaned `<body>`'s innerHTML)
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== 'string' || !html) return '';
  if (typeof DOMParser === 'undefined') return html; // non-browser environment: nothing we can do here

  const tagSet = buildTagSet(options.allowedTags);
  const attrMap = buildAttrMap(options.allowedAttributes);
  const tagAllowed = typeof options.allowedTags === 'function' ? options.allowedTags : (t) => tagSet.has(t);
  const attrAllowed = typeof options.allowedAttributes === 'function'
    ? options.allowedAttributes
    : (tag, name) => (attrMap[tag] && attrMap[tag].has(name)) || (attrMap['*'] && attrMap['*'].has(name));

  let doc;
  try {
    doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  } catch {
    return '';
  }
  const body = doc.body;

  function walk(parent) {
    Array.from(parent.childNodes).forEach((child) => {
      if (child.nodeType === 8) { child.remove(); return; } // comment
      if (child.nodeType !== 1) return; // text node: keep as-is
      const tag = child.tagName.toLowerCase();
      if (DANGEROUS_TAGS.has(tag) || !tagAllowed(tag)) { child.remove(); return; }
      walk(child);
      Array.from(child.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) { child.removeAttribute(attr.name); return; }
        if (name === 'style') {
          const clean = sanitizeStyleValue(attr.value);
          if (clean) child.setAttribute('style', clean); else child.removeAttribute('style');
          return;
        }
        if (!attrAllowed(tag, name)) { child.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) child.removeAttribute(attr.name);
      });
    });
  }
  walk(body);
  return body.innerHTML;
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function stripTags(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html ?? '');
  return (tmp.textContent || '').replace(/ /g, ' ').trim();
}

function encodeEntities(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function decodeEntities(s) {
  const ta = document.createElement('textarea');
  ta.innerHTML = String(s ?? '');
  return ta.value;
}

const FORMAT_BLOCK_VALUES = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'];
const FONT_SIZE_CSS = { small: '0.8em', normal: '', large: '1.35em', huge: '1.85em' };

/**
 * Enhance a <textarea> with a WYSIWYG toolbar (built from lkToolbar) + a contenteditable
 * surface, with a raw-HTML source-view toggle. The native textarea stays in the DOM
 * (visually hidden) and is kept in sync with the current HTML so it still participates
 * in native <form> submission.
 *
 *   const ed = Look.lkEditor('#body', { label: 'Description', sanitize: true });
 *   ed.value;                        // current HTML (get = live; set = silent)
 *   ed.getValue({ encode: true });   // HTML-entity-encoded string
 *
 * @param {Element|string} el — <textarea> element or selector
 * @param {Object} [opts]
 * @param {string} [opts.value]            — initial HTML (default: the textarea's value)
 * @param {string} [opts.label] [opts.name] [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {string} [opts.placeholder]
 * @param {boolean|Function} [opts.sanitize=true] — true: built-in sanitizer; false: disabled (caller's responsibility); fn(html) => safeHtml: custom/wrapping sanitizer
 * @param {string[]|Function} [opts.allowedTags]        — extends (array) or replaces (function) the default tag allowlist
 * @param {string[]|Object|Function} [opts.allowedAttributes] — extends (array/object) or replaces (function) the default attribute allowlist
 * @param {boolean} [opts.encodeForSubmit=false] — the hidden native textarea posts the entity-encoded value instead of raw HTML
 * @param {Array}   [opts.rules] [opts.validate] — validation (required checks the TEXT content, stripped of tags)
 * @param {Function} [opts.onChange] — (value, { source: 'input'|'source'|'api', component }) — debounced (~300ms) on typing; also fires when the source view is applied back. `value =` is silent.
 * @param {Function} [opts.beforeChange]        — (value, { source, component }) guard around every content commit
 * @param {Function} [opts.beforeCommand]       — (name, value, { source, component }) guard wrapping every toolbar formatting command (execCommand name)
 * @param {Function} [opts.beforeSourceToggle]  — (toSource, { source, component }) guard around the WYSIWYG <-> source switch
 * @param {Object}  [opts.text] — text overrides (Look.i18n keys 'editor.*')
 * @param {Array} [opts.toolbarItems] — declarative toolbar layout; defaults to every built-in button. Entries:
 *   a built-in id ('undo'|'redo'|'formatBlock'|'fontSize'|'bold'|'italic'|'underline'|'strike'|'textColor'|
 *   'highlightColor'|'alignLeft'|'alignCenter'|'alignRight'|'alignJustify'|'orderedList'|'unorderedList'|
 *   'link'|'codeBlock'|'clearFormat'|'source'); a group name ('history'|'basic'|'coloring'|'adjustment'|'lists')
 *   expanding to several ids; '-' for a separator; 'spacer'; or a raw lkToolbar item object for a custom button.
 * @param {string[]} [opts.excludeToolbarItems] — ids/group names to drop from the default layout (ignored when `toolbarItems` is given)
 * @returns {Object} — also `comp.setToolbarItems(items)` (replace), `comp.addToolbarItem(item, index)`,
 *   `comp.removeToolbarItem(id)` to change the toolbar after creation (and `comp.toolbar` for the live lkToolbar instance)
 */
export function lkEditor(el, opts = {}) {
  const node = resolveEl(el, 'lkEditor');
  if (node.tagName !== 'TEXTAREA') throw new Error('Look.lkEditor: element must be a <textarea>');

  const dense = !!opts.dense;
  const sanitizeOpt = opts.sanitize === undefined ? true : opts.sanitize;
  const comp = {};
  let readonly = !!opts.readonly;
  let validation = null;
  let gone = false;
  let sourceMode = false;
  let lastCommitted = '';
  let savedRange = null;
  let commitTimer = null;

  function applySanitize(html) {
    if (sanitizeOpt === false) return String(html ?? '');
    if (typeof sanitizeOpt === 'function') return String(sanitizeOpt(String(html ?? '')) ?? '');
    return sanitizeHtml(String(html ?? ''), { allowedTags: opts.allowedTags, allowedAttributes: opts.allowedAttributes });
  }

  const original = {
    value: node.value,
    tabindex: node.getAttribute('tabindex'),
    ariaHidden: node.getAttribute('aria-hidden'),
  };
  node.tabIndex = -1;
  node.setAttribute('aria-hidden', 'true');
  node.classList.add('lk-editor__native');

  const field = wrapField(node, {
    label: opts.label,
    name: opts.name,
    required: opts.required ?? opts.mandatory,
    requiredMark: opts.requiredMark,
  });

  const tx = bindText('editor', opts.text, () => refreshTexts());

  // --- DOM ---------------------------------------------------------------------

  const root = createElement('div', { class: `lk-editor${dense ? ' lk-editor--dense' : ''}` });
  node.parentNode.insertBefore(root, node);

  const toolbarMount = createElement('div', { class: 'lk-editor__toolbar' });
  const body = createElement('div', { class: 'lk-editor__body' });
  const surface = createElement('div', { class: 'lk-editor__surface' });
  surface.contentEditable = 'true';
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  const sourceTextarea = createElement('textarea', { class: 'lk-editor__source', spellcheck: 'false' });
  sourceTextarea.hidden = true;
  body.append(surface, sourceTextarea);
  root.append(toolbarMount, body);

  const floatingPanels = []; // lkPopupProxy instances owned by custom toolbar items (link / colors)

  // --- Selection helpers ---------------------------------------------------------

  function canEdit() { return !node.disabled && !readonly; }
  function focusSurface() { if (document.activeElement !== surface) surface.focus(); }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && surface.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    focusSurface();
    if (!savedRange) return true;
    const sel = window.getSelection();
    sel.removeAllRanges();
    try { sel.addRange(savedRange); } catch { return false; }
    return true;
  }
  function currentAnchorElement() {
    if (!savedRange) return null;
    const n = savedRange.commonAncestorContainer;
    const elm = n.nodeType === 1 ? n : n.parentElement;
    return elm ? elm.closest('a') : null;
  }

  // --- execCommand plumbing -------------------------------------------------------

  // Without styleWithCSS, browsers format with legacy presentational markup — e.g. foreColor/
  // hiliteColor insert <font color|style>, justify* sets a legacy align="" attribute — none of
  // which is in the sanitizer's allowlist. That markup survived in the live surface right after
  // the command, but got silently stripped ~300ms later when the debounced commit re-sanitized
  // it, which looked exactly like "I formatted it and it reset back to normal". Forcing
  // styleWithCSS makes every command emit inline `style` on allowed tags (span/div/p/...) instead,
  // which the sanitizer already keeps.
  function ensureStyleWithCSS() {
    try { document.execCommand('styleWithCSS', false, true); } catch { /* unsupported: formatting still works, just via legacy markup */ }
  }

  function doExec(name, value) {
    ensureStyleWithCSS();
    try {
      if (name === 'hiliteColor' && typeof document.queryCommandSupported === 'function' && !document.queryCommandSupported('hiliteColor')) {
        document.execCommand('backColor', false, value);
        return;
      }
      document.execCommand(name, false, value);
    } catch { /* unsupported in this browser: a harmless no-op */ }
  }

  // beforeCommand(name, value, ctx) — a 3-argument guard (command name + its value), so it
  // is implemented locally rather than through helpers/guard.js's single-payload guard()
  // (same semantics: false vetoes, a Promise waits, a non-false/true/null/undefined return
  // replaces the value; also dispatches the matching cancelable 'lk:before-command' DOM event).
  function guardCommand(name, value, ctx, proceed) {
    const hook = opts.beforeCommand;
    const dispatch = (val) => {
      const detail = { ...ctx, name, value: val };
      if (typeof CustomEvent === 'function') {
        const ev = new CustomEvent('lk:before-command', { bubbles: true, cancelable: true, detail });
        root.dispatchEvent(ev);
        if (ev.defaultPrevented) return false;
        proceed(detail.value);
        return true;
      }
      proceed(val);
      return true;
    };
    if (typeof hook !== 'function') return dispatch(value);
    let result;
    try {
      result = hook(name, value, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Look: beforeCommand threw', err);
      return false;
    }
    const passthrough = (r) => (r === undefined || r === true || r === null ? value : r);
    if (result && typeof result.then === 'function') {
      return result.then(
        (r) => (r === false ? false : dispatch(passthrough(r))),
        (err) => {
          // eslint-disable-next-line no-console
          console.error('Look: beforeCommand rejected', err);
          return false;
        },
      );
    }
    if (result === false) return false;
    return dispatch(passthrough(result));
  }

  function runCommand(name, value) {
    if (!canEdit()) return false;
    return guardCommand(name, value, { source: 'user', component: comp }, (v) => {
      focusSurface();
      doExec(name, v);
      scheduleCommit();
      refreshToolbarState();
    });
  }

  function applyFontSizeImpl(key) {
    const css = FONT_SIZE_CSS[key] ?? '';
    doExec('fontSize', '7');
    surface.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      if (css) span.style.fontSize = css;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
  }

  function insertCodeBlockImpl() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    pre.appendChild(code);
    if (sel.isCollapsed) {
      let blockEl = range.startContainer;
      blockEl = blockEl.nodeType === 1 ? blockEl : blockEl.parentElement;
      blockEl = blockEl && blockEl.closest('p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
      if (blockEl && blockEl !== surface && surface.contains(blockEl)) {
        while (blockEl.firstChild) code.appendChild(blockEl.firstChild);
        if (!code.firstChild) code.appendChild(document.createElement('br'));
        blockEl.replaceWith(pre);
      } else {
        code.appendChild(document.createElement('br'));
        range.insertNode(pre);
      }
    } else {
      const frag = range.extractContents();
      code.appendChild(frag);
      range.insertNode(pre);
    }
    const r = document.createRange();
    r.selectNodeContents(code);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function applyLink(url, newTab) {
    if (!restoreSelection()) return;
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const textNode = document.createTextNode(url);
      range.insertNode(textNode);
      const r2 = document.createRange();
      r2.selectNode(textNode);
      sel.removeAllRanges();
      sel.addRange(r2);
      savedRange = r2.cloneRange();
    }
    doExec('createLink', url);
    let anchorEl = currentAnchorElement();
    if (!anchorEl) {
      const all = surface.querySelectorAll('a[href]');
      anchorEl = Array.from(all).find((a) => a.getAttribute('href') === url) || null;
    }
    if (anchorEl) {
      if (newTab) { anchorEl.target = '_blank'; anchorEl.rel = 'noopener noreferrer'; }
      else { anchorEl.removeAttribute('target'); anchorEl.removeAttribute('rel'); }
    }
    scheduleCommit();
    refreshToolbarState();
  }

  function removeLinkCmd() {
    if (!restoreSelection()) return;
    const anchorEl = currentAnchorElement();
    if (anchorEl) {
      const r = document.createRange();
      r.selectNodeContents(anchorEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    doExec('unlink');
    scheduleCommit();
  }

  // --- Commit / value pipeline -----------------------------------------------------

  function syncNative() {
    node.value = opts.encodeForSubmit ? encodeEntities(lastCommitted) : lastCommitted;
  }

  function updateEmptyState() {
    surface.classList.toggle('lk-editor__surface--empty', !stripTags(surface.innerHTML));
  }

  function commitValue(rawHtml, source) {
    const clean = applySanitize(rawHtml);
    if (clean === lastCommitted) {
      if (clean !== surface.innerHTML && source !== 'input') surface.innerHTML = clean;
      updateEmptyState();
      return;
    }
    guard(root, opts, 'change', clean, { source, component: comp }, (v) => {
      lastCommitted = v;
      if (source !== 'input' || v !== surface.innerHTML) surface.innerHTML = v;
      syncNative();
      updateEmptyState();
      validation?.changed();
      if (typeof opts.onChange === 'function') opts.onChange(v, { source, component: comp });
    });
  }

  function commitFromSurface() { commitValue(surface.innerHTML, 'input'); }

  function scheduleCommit(delay = 300) {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitFromSurface, delay);
  }

  function flushPendingCommit() {
    if (!commitTimer) return;
    clearTimeout(commitTimer);
    commitTimer = null;
    commitFromSurface();
  }

  function setValueSilent(html) {
    const clean = applySanitize(String(html ?? ''));
    lastCommitted = clean;
    if (sourceMode) sourceTextarea.value = clean; else surface.innerHTML = clean;
    syncNative();
    updateEmptyState();
  }

  // --- Source view -----------------------------------------------------------------

  const DISABLE_IN_SOURCE = [
    'undo', 'redo', 'formatBlock', 'fontSize', 'bold', 'italic', 'underline', 'strike',
    'textColor', 'highlightColor', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
    'orderedList', 'unorderedList', 'link', 'codeBlock', 'clearFormat',
  ];

  function setSourceView(toSource) {
    if (toSource === sourceMode) return;
    if (toSource) {
      flushPendingCommit(); // surface may hold un-debounced edits — commit them before copying into source
      sourceTextarea.value = lastCommitted;
      sourceMode = true;
      surface.hidden = true;
      sourceTextarea.hidden = false;
      root.classList.add('lk-editor--source');
      DISABLE_IN_SOURCE.forEach((id) => toolbar.setDisabled(id, true));
      sourceTextarea.focus();
    } else {
      clearTimeout(commitTimer); // nothing can have typed into the hidden surface, but guard against a stray timer
      commitTimer = null;
      const raw = sourceTextarea.value;
      sourceMode = false;
      surface.hidden = false;
      sourceTextarea.hidden = true;
      root.classList.remove('lk-editor--source');
      DISABLE_IN_SOURCE.forEach((id) => toolbar.setDisabled(id, false));
      commitValue(raw, 'source');
      surface.focus();
    }
  }

  // --- Toolbar live state -----------------------------------------------------------

  function queryState(c) { try { return document.queryCommandState(c); } catch { return false; } }

  function refreshToolbarState() {
    if (sourceMode || gone) return;
    toolbar.setActive('bold', queryState('bold'));
    toolbar.setActive('italic', queryState('italic'));
    toolbar.setActive('underline', queryState('underline'));
    toolbar.setActive('strike', queryState('strikeThrough'));
    toolbar.setActive('orderedList', queryState('insertOrderedList'));
    toolbar.setActive('unorderedList', queryState('insertUnorderedList'));
    const alignId = queryState('justifyCenter') ? 'alignCenter'
      : queryState('justifyRight') ? 'alignRight'
        : queryState('justifyFull') ? 'alignJustify' : 'alignLeft';
    toolbar.setActive(alignId, true);
    let block = '';
    try { block = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, ''); } catch { /* unsupported */ }
    const fb = toolbar.get('formatBlock');
    if (fb && FORMAT_BLOCK_VALUES.includes(block) && fb.value !== block) fb.value = block;
  }

  function onSelectionChange() {
    if (gone) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && document.activeElement === surface && surface.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
    if (document.activeElement === surface) refreshToolbarState();
  }
  document.addEventListener('selectionchange', onSelectionChange);

  // --- Surface events -----------------------------------------------------------------

  function onSurfaceInput() {
    updateEmptyState();
    scheduleCommit();
  }
  function onPaste(e) {
    if (!canEdit()) return;
    e.preventDefault();
    const html = e.clipboardData ? e.clipboardData.getData('text/html') : '';
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    const content = html ? applySanitize(html) : encodeEntities(text).replace(/\n/g, '<br>');
    doExec('insertHTML', content);
    onSurfaceInput();
  }
  surface.addEventListener('input', onSurfaceInput);
  surface.addEventListener('paste', onPaste);

  function onToolbarMouseDown(e) {
    // Keep the contenteditable selection alive while clicking toolbar controls
    // (the browser would otherwise steal focus/selection on mousedown).
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
  }
  toolbarMount.addEventListener('mousedown', onToolbarMouseDown);

  // --- Toolbar items ------------------------------------------------------------------

  function fmtBtn(id, text, { toggle, group, tooltip, run, className, icon } = {}) {
    return {
      id, type: 'button', text, icon, iconOnly: !!icon, toggle: !!toggle, group,
      className: `lk-editor__fmt-btn${className ? ` ${className}` : ''}`,
      tooltip,
      onClick() { run(); },
    };
  }

  function buildColorItem(id, label, command) {
    return {
      id, type: 'custom',
      render(wrap) {
        const btn = createElement('button', { type: 'button', class: 'lk-toolbar__btn lk-toolbar__btn--icon lk-editor__color-btn', 'aria-label': label, title: label });
        btn.appendChild(createElement('span', { class: 'lk-toolbar__btn-label' }, id === 'textColor' ? 'A' : 'H'));
        const bar = createElement('span', { class: 'lk-editor__color-bar' });
        btn.appendChild(bar);
        wrap.appendChild(btn);

        const panelBody = createElement('div', { class: 'lk-editor__color-panel' });
        const input = createElement('input', { type: 'text' });
        panelBody.appendChild(input);

        const proxy = lkPopupProxy(btn, {
          content: '',
          placement: 'bottom-left',
          className: 'lk-editor__color-popup',
          beforeShow: () => (canEdit() ? undefined : false),
          onShow() { saveSelection(); },
        });
        proxy.panelEl.appendChild(panelBody);
        floatingPanels.push(proxy);

        const colorComp = lkColor(input, {
          clearable: true,
          onChange(hex) {
            guardCommand(command, hex, { source: 'user', component: comp }, (v) => {
              if (!restoreSelection()) return;
              if (v) { doExec(command, v); bar.style.background = v; } else { doExec(command, 'inherit'); bar.style.background = ''; }
              scheduleCommit();
            });
            proxy.hide('select');
          },
        });

        return {
          el: btn,
          setDisabled(off) { btn.disabled = off; if (off) proxy.hide('disabled'); },
          destroy() { colorComp.destroy(); proxy.destroy(); const i = floatingPanels.indexOf(proxy); if (i > -1) floatingPanels.splice(i, 1); },
        };
      },
    };
  }

  function buildLinkItem() {
    return {
      id: 'link', type: 'custom',
      render(wrap) {
        const btn = createElement('button', { type: 'button', class: 'lk-toolbar__btn lk-toolbar__btn--icon', 'aria-label': tx.t('toolbar.link'), title: tx.t('toolbar.link') });
        btn.appendChild(lkIcon('link'));
        wrap.appendChild(btn);

        const form = createElement('div', { class: 'lk-editor__link-form' });
        const urlInput = createElement('input', { type: 'text', placeholder: tx.t('link.urlPlaceholder'), 'aria-label': tx.t('link.url') });
        const checkLabel = createElement('label', { class: 'lk-editor__link-check' });
        const checkInput = createElement('input', { type: 'checkbox' });
        checkLabel.append(checkInput, document.createTextNode(` ${tx.t('link.newTab')}`));
        const actions = createElement('div', { class: 'lk-editor__link-actions' });
        const removeBtn = createElement('button', { type: 'button', class: 'lk-btn lk-btn--ghost' }, tx.t('link.remove'));
        const applyBtn = createElement('button', { type: 'button', class: 'lk-btn lk-btn--primary' }, tx.tf('common.apply'));
        actions.append(removeBtn, applyBtn);
        form.append(urlInput, checkLabel, actions);

        const urlField = lkTextbox(urlInput, {});
        const checkField = lkCheckbox(checkInput, {});

        const proxy = lkPopupProxy(btn, {
          content: '',
          placement: 'bottom-left',
          className: 'lk-editor__link-popup',
          beforeShow: () => (canEdit() ? undefined : false),
          onShow() {
            saveSelection();
            const anchorEl = currentAnchorElement();
            urlInput.value = anchorEl ? anchorEl.getAttribute('href') || '' : '';
            checkInput.checked = !!(anchorEl && anchorEl.target === '_blank');
            setTimeout(() => { if (proxy.isOpen) urlInput.focus(); }, 0);
          },
        });
        proxy.panelEl.appendChild(form);
        floatingPanels.push(proxy);

        function doApply() {
          const url = urlInput.value.trim();
          if (!url) { proxy.hide('select'); return; }
          guardCommand('createLink', url, { source: 'user', component: comp }, (v) => applyLink(v, checkInput.checked));
          proxy.hide('select');
        }
        function doRemove() {
          guardCommand('unlink', null, { source: 'user', component: comp }, () => removeLinkCmd());
          proxy.hide('select');
        }
        function onKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); doApply(); } }
        applyBtn.addEventListener('click', doApply);
        removeBtn.addEventListener('click', doRemove);
        urlInput.addEventListener('keydown', onKeydown);

        return {
          el: btn,
          setDisabled(off) { btn.disabled = off; if (off) proxy.hide('disabled'); },
          destroy() {
            applyBtn.removeEventListener('click', doApply);
            removeBtn.removeEventListener('click', doRemove);
            urlInput.removeEventListener('keydown', onKeydown);
            urlField.destroy();
            checkField.destroy();
            proxy.destroy();
            const i = floatingPanels.indexOf(proxy);
            if (i > -1) floatingPanels.splice(i, 1);
          },
        };
      },
    };
  }

  function buildFormatBlockItem() {
    return {
      id: 'formatBlock', type: 'dropdown', width: 128,
      options: {
        items: FORMAT_BLOCK_VALUES.map((v) => ({ value: v, label: tx.t(`formatBlock.${v === 'p' ? 'paragraph' : v}`) })),
        value: 'p',
        // The dropdown's own option list opens outside the toolbar (appended to <body>) and its
        // options are focusable for keyboard nav, so picking one moves focus — and the browser
        // selection — off the surface before onChange fires. Without restoring it first, formatBlock
        // runs against whatever's left selected (often nothing useful), which looked like the
        // heading/format "not taking" or reverting. Mirrors the save/restore the color & link tools do.
        onOpen() { saveSelection(); },
        onChange(value) { if (!restoreSelection()) return; runCommand('formatBlock', `<${value}>`); },
      },
    };
  }

  function buildFontSizeItem() {
    return {
      id: 'fontSize', type: 'dropdown', width: 104,
      options: {
        items: ['small', 'normal', 'large', 'huge'].map((v) => ({ value: v, label: tx.t(`fontSize.${v}`) })),
        value: 'normal',
        onOpen() { saveSelection(); },
        onChange(value) {
          if (!canEdit()) return;
          if (!restoreSelection()) return;
          guardCommand('fontSize', value, { source: 'user', component: comp }, (v) => {
            restoreSelection();
            applyFontSizeImpl(v);
            scheduleCommit();
          });
        },
      },
    };
  }

  function handleSourceClick(e, { item }) {
    const toSource = !!item.active; // lkToolbar already flipped `active` before calling onClick
    const outcome = guard(root, opts, 'sourceToggle', toSource, { source: 'user', component: comp }, (allow) => setSourceView(!!allow));
    const revert = (ok) => { if (ok === false) toolbar.setActive('source', !toSource); };
    if (outcome && typeof outcome.then === 'function') outcome.then(revert); else revert(outcome);
  }

  // One builder per built-in button/group, keyed by id — the registry `opts.toolbarItems` /
  // `opts.excludeToolbarItems` / addToolbarItem() / removeToolbarItem() all resolve against.
  const ITEM_BUILDERS = {
    undo: () => ({ id: 'undo', type: 'button', icon: 'undo', iconOnly: true, text: tx.t('toolbar.undo'), tooltip: tx.t('toolbar.undo'), onClick() { runCommand('undo'); } }),
    redo: () => ({ id: 'redo', type: 'button', icon: 'redo', iconOnly: true, text: tx.t('toolbar.redo'), tooltip: tx.t('toolbar.redo'), onClick() { runCommand('redo'); } }),
    formatBlock: buildFormatBlockItem,
    fontSize: buildFontSizeItem,
    bold: () => fmtBtn('bold', 'B', { toggle: true, tooltip: tx.t('toolbar.bold'), className: 'lk-editor__fmt-bold', run: () => runCommand('bold') }),
    italic: () => fmtBtn('italic', 'I', { toggle: true, tooltip: tx.t('toolbar.italic'), className: 'lk-editor__fmt-italic', run: () => runCommand('italic') }),
    underline: () => fmtBtn('underline', 'U', { toggle: true, tooltip: tx.t('toolbar.underline'), className: 'lk-editor__fmt-underline', run: () => runCommand('underline') }),
    strike: () => fmtBtn('strike', 'S', { toggle: true, tooltip: tx.t('toolbar.strike'), className: 'lk-editor__fmt-strike', run: () => runCommand('strikeThrough') }),
    textColor: () => buildColorItem('textColor', tx.t('toolbar.textColor'), 'foreColor'),
    highlightColor: () => buildColorItem('highlightColor', tx.t('toolbar.highlightColor'), 'hiliteColor'),
    alignLeft: () => fmtBtn('alignLeft', 'L', { icon: 'align-left', group: 'align', tooltip: tx.t('toolbar.alignLeft'), run: () => runCommand('justifyLeft') }),
    alignCenter: () => fmtBtn('alignCenter', 'C', { icon: 'align-center', group: 'align', tooltip: tx.t('toolbar.alignCenter'), run: () => runCommand('justifyCenter') }),
    alignRight: () => fmtBtn('alignRight', 'R', { icon: 'align-right', group: 'align', tooltip: tx.t('toolbar.alignRight'), run: () => runCommand('justifyRight') }),
    alignJustify: () => fmtBtn('alignJustify', 'J', { icon: 'align-justify', group: 'align', tooltip: tx.t('toolbar.alignJustify'), run: () => runCommand('justifyFull') }),
    orderedList: () => fmtBtn('orderedList', '1.', { toggle: true, tooltip: tx.t('toolbar.orderedList'), run: () => runCommand('insertOrderedList') }),
    unorderedList: () => fmtBtn('unorderedList', '•', { toggle: true, tooltip: tx.t('toolbar.unorderedList'), run: () => runCommand('insertUnorderedList') }),
    link: buildLinkItem,
    codeBlock: () => fmtBtn('codeBlock', '</>', { tooltip: tx.t('toolbar.codeBlock'), className: 'lk-editor__fmt-code', run: () => { if (!canEdit()) return; guardCommand('insertCodeBlock', null, { source: 'user', component: comp }, () => { if (!restoreSelection()) return; insertCodeBlockImpl(); scheduleCommit(); }); } }),
    clearFormat: () => fmtBtn('clearFormat', tx.t('toolbar.clearFormat'), { tooltip: tx.t('toolbar.clearFormat'), run: () => runCommand('removeFormat') }),
    source: () => ({ id: 'source', type: 'button', text: tx.t('toolbar.source'), toggle: true, tooltip: tx.t('toolbar.source'), onClick: handleSourceClick }),
  };

  // Named shortcuts for `opts.toolbarItems` / `opts.excludeToolbarItems` that expand to several
  // ids at once (e.g. `excludeToolbarItems: ['coloring']` drops both color buttons in one go).
  const TOOLBAR_GROUPS = {
    history: ['undo', 'redo'],
    basic: ['bold', 'italic', 'underline', 'strike'],
    coloring: ['textColor', 'highlightColor'],
    colors: ['textColor', 'highlightColor'],
    adjustment: ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'],
    alignment: ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'],
    lists: ['orderedList', 'unorderedList'],
  };

  const DEFAULT_TOOLBAR_ITEMS = [
    'undo', 'redo', '-',
    'formatBlock', 'fontSize', '-',
    'bold', 'italic', 'underline', 'strike', '-',
    'textColor', 'highlightColor', '-',
    'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', '-',
    'orderedList', 'unorderedList', '-',
    'link', 'codeBlock', 'clearFormat',
    'spacer',
    'source',
  ];

  // The current declarative layout: built-in ids / group names (expanded by TOOLBAR_GROUPS),
  // '-' separators, 'spacer', or a caller-supplied lkToolbar item object (a fully custom button).
  // Kept around (rather than only ever building a one-off array) so a locale/dictionary change
  // (refreshTexts) rebuilds from it instead of silently reverting removeToolbarItem()/
  // addToolbarItem() calls made since the editor was created.
  let toolbarSpec = Array.isArray(opts.toolbarItems) ? opts.toolbarItems.slice() : DEFAULT_TOOLBAR_ITEMS.slice();
  if (!opts.toolbarItems && Array.isArray(opts.excludeToolbarItems)) {
    const exclude = new Set();
    opts.excludeToolbarItems.forEach((name) => (TOOLBAR_GROUPS[name] || [name]).forEach((id) => exclude.add(id)));
    toolbarSpec = toolbarSpec.filter((entry) => typeof entry !== 'string' || !exclude.has(entry));
  }

  // Rebuilt on every toolbar (re)render — from `toolbarSpec`, not a hardcoded list — so it
  // reflects whatever setToolbarItems()/addToolbarItem()/removeToolbarItem() left in place, and
  // every static tooltip re-localizes on a locale/dictionary change (the toolbar is cheap to
  // rebuild; document content, selection and validation state are untouched by it).
  function buildItems() {
    return toolbarSpec.flatMap((entry) => {
      if (entry === '-' || entry === '|') return [{ type: 'separator' }];
      if (entry === 'spacer') return [{ type: 'spacer' }];
      if (typeof entry === 'string') {
        const group = TOOLBAR_GROUPS[entry];
        if (group) return group.filter((id) => ITEM_BUILDERS[id]).map((id) => ITEM_BUILDERS[id]());
        const builder = ITEM_BUILDERS[entry];
        return builder ? [builder()] : [];
      }
      return [entry]; // custom item object — passed through as-is
    });
  }

  const toolbar = lkToolbar(toolbarMount, { items: buildItems(), dense, ariaLabel: tx.t('ariaLabel') });

  function refreshTexts() {
    if (gone) return;
    surface.dataset.placeholder = opts.placeholder ?? tx.t('placeholder');
    toolbar.setItems(buildItems());
    if (sourceMode) DISABLE_IN_SOURCE.forEach((id) => toolbar.setDisabled(id, true));
  }

  // --- Public API ---------------------------------------------------------------------

  applyBase(comp, node, { hiddenTarget: field.wrapper || root });

  function setDisabled(v) {
    node.disabled = !!v;
    surface.contentEditable = v ? 'false' : 'true';
    sourceTextarea.disabled = !!v;
    toolbar.enabled = !v;
    root.classList.toggle('lk-editor--disabled', !!v);
  }
  function setReadonly(v) {
    readonly = !!v;
    const off = readonly || node.disabled;
    surface.contentEditable = off ? 'false' : 'true';
    sourceTextarea.readOnly = readonly;
    toolbar.enabled = !off;
    root.classList.toggle('lk-editor--readonly', readonly);
  }

  Object.defineProperties(comp, {
    value: {
      get() { return sourceMode ? sourceTextarea.value : surface.innerHTML; },
      set(v) { setValueSilent(v); },
      enumerable: true,
    },
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true },
    name: { get() { return node.name; }, set(v) { node.name = v; }, enumerable: true },
    label: { get() { return field.getLabel(); }, set(v) { field.setLabel(v); }, enumerable: true },
    labels: { get() { return field.labels; }, enumerable: true },
    required: { get() { return node.required; }, set(v) { field.setRequired(v); }, enumerable: true },
    mandatory: { get() { return node.required; }, set(v) { field.setRequired(v); } },
    readonly: { get() { return readonly; }, set: setReadonly, enumerable: true },
    disabled: { get() { return node.disabled; }, set: setDisabled, enumerable: true },
    isSource: { get() { return sourceMode; }, enumerable: true },
    rootEl: { value: root, enumerable: true },
    surfaceEl: { value: surface, enumerable: true },
    sourceEl: { value: sourceTextarea, enumerable: true },
    toolbar: { value: toolbar, enumerable: true },
  });
  Object.defineProperty(comp, 'enabled', {
    get() { return !node.disabled; },
    set(v) { setDisabled(!v); },
    enumerable: true,
    configurable: true,
  });

  comp.setError = (m) => { field.setError(m); root.classList.add('lk-editor--error'); };
  comp.clearError = () => { field.clearError(); root.classList.remove('lk-editor--error'); };
  comp.refreshLabels = () => field.refreshLabels();
  comp.focus = (o) => { if (sourceMode) sourceTextarea.focus(o); else surface.focus(o); };
  comp.getValue = ({ encode = false } = {}) => (encode ? encodeEntities(comp.value) : comp.value);
  comp.setValue = (value, { encoded = false } = {}) => { comp.value = encoded ? decodeEntities(String(value ?? '')) : String(value ?? ''); };
  comp.toggleSource = (force) => {
    const want = force == null ? !sourceMode : !!force;
    if (want === sourceMode) return comp;
    toolbar.setActive('source', want);
    const outcome = guard(root, opts, 'sourceToggle', want, { source: 'api', component: comp }, (allow) => setSourceView(!!allow));
    if (outcome === false) toolbar.setActive('source', !want);
    return comp;
  };

  // Toolbar composition — declarative replace, or incremental add/remove that (unlike calling
  // comp.toolbar.add/remove directly) survives a locale/dictionary refresh. Entries accepted
  // anywhere a built-in id is: a group name ('history'|'basic'|'coloring'|'adjustment'|'lists'),
  // '-' for a separator, 'spacer', or a raw lkToolbar item object for a fully custom button.
  comp.setToolbarItems = (items) => {
    toolbarSpec = Array.isArray(items) ? items.slice() : DEFAULT_TOOLBAR_ITEMS.slice();
    toolbar.setItems(buildItems());
    if (sourceMode) DISABLE_IN_SOURCE.forEach((id) => toolbar.setDisabled(id, true));
    return comp;
  };
  comp.addToolbarItem = (item, index) => {
    toolbarSpec = index == null ? [...toolbarSpec, item] : [...toolbarSpec.slice(0, index), item, ...toolbarSpec.slice(index)];
    toolbar.add(item, index);
    return comp;
  };
  comp.removeToolbarItem = (id) => {
    toolbarSpec = toolbarSpec.filter((entry) => entry !== id && !(entry && typeof entry === 'object' && entry.id === id));
    toolbar.remove(id);
    return comp;
  };

  // Initial content
  const initialRaw = opts.value !== undefined ? String(opts.value) : (node.value || '');
  lastCommitted = applySanitize(initialRaw);
  surface.innerHTML = lastCommitted;
  surface.dataset.placeholder = opts.placeholder ?? tx.t('placeholder');
  updateEmptyState();
  syncNative();

  if (opts.disabled || node.disabled) setDisabled(true);
  if (readonly) setReadonly(true);

  validation = attachValidation(comp, {
    opts,
    t: tx.tf,
    getValue: () => stripTags(comp.value),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => node.required,
    requiredMessage: () => tx.t('required'),
    roots: () => [field.wrapper || root, ...floatingPanels.map((p) => p.panelEl)],
    isOpen: () => floatingPanels.some((p) => p.isOpen),
    setError: comp.setError,
    clearError: comp.clearError,
  });

  comp.destroy = function () {
    gone = true;
    clearTimeout(commitTimer);
    tx.destroy();
    validation.destroy();
    document.removeEventListener('selectionchange', onSelectionChange);
    surface.removeEventListener('input', onSurfaceInput);
    surface.removeEventListener('paste', onPaste);
    toolbarMount.removeEventListener('mousedown', onToolbarMouseDown);
    toolbar.destroy();
    comp.clearError();
    root.remove();
    node.classList.remove('lk-editor__native');
    const restore = (name, v) => (v == null ? node.removeAttribute(name) : node.setAttribute(name, v));
    restore('tabindex', original.tabindex);
    restore('aria-hidden', original.ariaHidden);
    node.value = original.value;
    field.destroyField();
  };

  return comp;
}
