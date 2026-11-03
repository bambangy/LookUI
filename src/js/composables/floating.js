// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { renderContent, hasContent } from '../helpers/content.js';
import { guard } from '../helpers/guard.js';

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function toLen(v) {
  return typeof v === 'number' ? `${v}px` : String(v);
}

/**
 * A persistent element pinned to a screen corner (FAB, floating widget, chat launcher, …).
 * Content is one of `html` (trusted markup string), `content` (text | Node | fn(host, ctx) | Promise
 * of those | cleanup fn — see helpers/content.js), `template` (a `<template>` selector/element), or
 * `component` ({ component: factory, options, tag }) to mount a Look component as the content —
 * mirrors lkTable's `editor` convention: `tag` creates the host element, `component(host, options)`
 * is called on it, and its returned `destroy()` is called when the content changes or the floating
 * element is destroyed.
 *
 * @param {Object} [opts={}]
 * @param {string} [opts.position='bottom-right'] - 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
 * @param {number|string|{x,y}} [opts.offset] - gap from the corner (px number or CSS length); default the `--lk-space-4` token
 * @param {Element|string} [opts.container=document.body] - mount point
 * @param {boolean} [opts.visible=true] - initial visibility
 * @param {number} [opts.zIndex] - overrides the default `--lk-z-sticky` stacking
 * @param {boolean} [opts.dense=false] - smaller corner offset
 * @param {string} [opts.className] - extra class(es) on the root
 * @param {string} [opts.html] - raw HTML string (trusted markup only)
 * @param {string|Node|Function} [opts.content] - text | Node | fn(host, ctx) => Node|text|{html}|cleanup|Promise
 * @param {string|Element} [opts.template] - `<template>` selector or element to clone
 * @param {{component: Function, options?: Object, tag?: string}} [opts.component] - mount a Look component as the content
 * @param {Function} [opts.onShow] - (component) after showing
 * @param {Function} [opts.onHide] - (reason, component) after hiding
 * @param {Function} [opts.beforeShow] - (ctx) => false|Promise — veto showing
 * @param {Function} [opts.beforeHide] - (reason, ctx) => false|Promise — veto hiding
 * @returns {{ el: Element, visible: boolean, position: string, show: Function, hide: Function, toggle: Function, setContent: Function, destroy: Function }}
 */
export function lkFloating(opts = {}) {
  const options = { position: 'bottom-right', visible: true, container: document.body, dense: false, className: '', ...opts };

  const container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
  if (!container) throw new Error('Look.lkFloating: container not found.');

  let position = POSITIONS.includes(options.position) ? options.position : 'bottom-right';

  const root = document.createElement('div');
  root.className = ['lk-floating', `lk-floating--${position}`, options.dense ? 'lk-floating--dense' : '', options.className]
    .filter(Boolean).join(' ');
  if (options.zIndex != null) root.style.zIndex = String(options.zIndex);

  let visible = options.visible !== false;
  root.hidden = !visible;

  let embedded = null;
  let contentHandle = null;
  let destroyed = false;
  let comp = null;

  function applyOffset() {
    if (options.offset == null) {
      root.style.removeProperty('--lk-floating-offset-x');
      root.style.removeProperty('--lk-floating-offset-y');
      return;
    }
    const o = typeof options.offset === 'object' ? options.offset : { x: options.offset, y: options.offset };
    root.style.setProperty('--lk-floating-offset-x', toLen(o.x));
    root.style.setProperty('--lk-floating-offset-y', toLen(o.y));
  }

  function clearContent() {
    embedded?.destroy?.();
    embedded = null;
    contentHandle?.destroy();
    contentHandle = null;
    root.replaceChildren();
  }

  function render() {
    clearContent();
    if (options.component) {
      const spec = options.component;
      const host = document.createElement(spec.tag || 'div');
      root.appendChild(host);
      const built = spec.component(host, spec.options || {});
      embedded = built && typeof built.destroy === 'function' ? built : null;
      return;
    }
    const spec = { html: options.html, content: options.content, template: options.template };
    if (hasContent(spec)) contentHandle = renderContent(root, spec, {});
  }

  function doShow() {
    visible = true;
    root.hidden = false;
    options.onShow?.(comp);
  }

  function doHide(reason) {
    visible = false;
    root.hidden = true;
    options.onHide?.(reason, comp);
  }

  function show() {
    if (destroyed || visible) return comp;
    guard(root, options, 'show', undefined, { source: 'api', component: comp }, doShow);
    return comp;
  }

  function hide(reason) {
    if (destroyed || !visible) return comp;
    guard(root, options, 'hide', reason, { source: 'api', component: comp }, (r) => doHide(r || reason || 'api'));
    return comp;
  }

  comp = {
    el: root,
    get visible() { return visible; },
    get position() { return position; },
    set position(p) {
      if (!POSITIONS.includes(p) || p === position || destroyed) return;
      root.classList.remove(`lk-floating--${position}`);
      position = p;
      root.classList.add(`lk-floating--${position}`);
    },
    show,
    hide,
    toggle() { return visible ? hide('api') : show(); },
    setContent(spec = {}) {
      Object.assign(options, { html: undefined, content: undefined, template: undefined, component: undefined, ...spec });
      render();
      return comp;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearContent();
      root.remove();
    },
  };

  render();
  applyOffset();
  container.appendChild(root);
  return comp;
}
