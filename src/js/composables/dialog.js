// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { lkFocusTrap } from '../behaviors/index.js';
import { lkIcon } from '../components/icon.js';
import { createPresenceController, readDurationMs } from '../helpers/motion.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { guard } from '../helpers/guard.js';

lkI18n.define('dialog', {
  closeLabel: 'Close dialog',
  'type.success': 'Success',
  'type.error': 'Error',
  'type.warning': 'Warning',
  'type.info': 'Information',
  'type.question': 'Question',
});

// Fallback when --lk-modal-exit-duration can't be read; the real value comes from CSS.
const EXIT_MS = 180;

// Status presets: big animated icon + centered layout (SweetAlert-style)
const STATUS_TYPES = ['success', 'error', 'warning', 'info', 'question'];

// Inline SVG (80×80) — strokes use pathLength="1" so CSS can draw them in.
const STATUS_MARKS = {
  success: '<path class="lk-dialog-status__mark" pathLength="1" d="M25 41.5l10.5 10.5L56 30"/>',
  error:
    '<path class="lk-dialog-status__mark" pathLength="1" d="M29 29l22 22"/>'
    + '<path class="lk-dialog-status__mark lk-dialog-status__mark--2" pathLength="1" d="M51 29L29 51"/>',
  warning:
    '<path class="lk-dialog-status__mark" pathLength="1" d="M40 23v20"/>'
    + '<circle class="lk-dialog-status__dot" cx="40" cy="55" r="3"/>',
  info:
    '<circle class="lk-dialog-status__dot" cx="40" cy="25" r="3"/>'
    + '<path class="lk-dialog-status__mark" pathLength="1" d="M40 35v21"/>',
  question:
    '<path class="lk-dialog-status__mark" pathLength="1" d="M31.5 31a8.5 8.5 0 1 1 12.4 7.5c-2.6 1.4-3.9 3.2-3.9 6V46"/>'
    + '<circle class="lk-dialog-status__dot" cx="40" cy="55.5" r="3"/>',
};

function createStatusIcon(type, label) {
  const wrap = document.createElement('div');
  wrap.className = `lk-dialog-status lk-dialog-status--${type}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', label);
  wrap.innerHTML = `<svg viewBox="0 0 80 80" focusable="false">`
    + `<circle class="lk-dialog-status__ring" pathLength="1" cx="40" cy="40" r="36"/>${STATUS_MARKS[type]}</svg>`;
  return wrap;
}

// Open dialogs, topmost last. Escape only closes the topmost one.
const openStack = [];

function removeFromStack(api) {
  const i = openStack.indexOf(api);
  if (i !== -1) openStack.splice(i, 1);
}

function appendDialogContent(container, content, api) {
  if (content == null) return;

  if (typeof content === 'function') {
    appendDialogContent(container, content(api), api);
    return;
  }

  if (typeof Node !== 'undefined' && content instanceof Node) {
    container.appendChild(content);
    return;
  }

  container.textContent = String(content);
}

function callMaybe(fn, ...args) {
  if (typeof fn !== 'function') return true;
  return fn(...args);
}

/**
 * Create a dialog from options without requiring pre-existing markup.
 *
 * Every dialog pops in SweetAlert2-style and slides out when hidden;
 * `animation: 'calm'` uses plain rise/fade transitions instead.
 * Status dialogs: `type: 'success' | 'error' | 'warning' | 'info' | 'question'`
 * add a large animated icon and center the layout.
 *
 * @param {Object} [opts={}]
 * @param {string}  [opts.type]          — status preset (see above)
 * @param {string}  [opts.animation]     — 'sweet' (default) | 'calm'
 * @param {boolean} [opts.icon=true]     — show the status icon when a type is set
 * @param {string}  [opts.confirmColor]  — button variant for confirm (default 'primary', 'negative' for error)
 * @param {Function} [opts.onDestroy]    — called once the dialog is torn down (after the exit animation with destroyOnClose)
 * @param {string}  [opts.confirmText]   — confirm caption (default common.ok); wins over `text` / the locale
 * @param {string}  [opts.cancelText]    — cancel caption (default common.cancel); wins over `text` / the locale
 * @param {Object}  [opts.text]          — per-instance text overrides (keys relative to 'dialog.' or absolute)
 * @param {Function} [opts.beforeClose]   — guard (reason, { source, component }); false / Promise<false> keeps it open
 * @param {Function} [opts.beforeConfirm] — guard (ctx); a pending Promise keeps the dialog open (confirm button disabled)
 * @param {Function} [opts.beforeCancel]  — guard (ctx)
 *
 * `open()` returns the usual chainable `api` (unchanged: `dialog.open().close()` still works), but
 * `api` is also thenable — `await Look.lkDialog({...}).open()` resolves once the dialog closes, with
 * `{ reason, confirmed, cancelled, value }` (`value` is `close(reason, source, value)`'s 3rd argument,
 * or the confirm handler's return value for a `confirm`). A dialog destroyed while open/pending
 * resolves with `reason: 'destroy'` rather than hanging the `await`.
 * `api.channel` — `{ send(name, payload), on(name, handler), off(name, handler) }` — a two-way pub/sub
 * scoped to this dialog instance; `content` functions receive `api` as their argument so they can read
 * `api.channel` without closing over the dialog from outside.
 * @returns {{ el: Element, overlayEl: Element, dialogEl: Element, channel: Object, isOpen: boolean, open: Function, close: Function, setTitle: Function, setContent: Function, destroy: Function }}
 */
export function lkDialog(opts = {}) {
  const options = {
    title: '',
    content: '',
    confirmText: null,
    cancelText: null,
    text: null,
    beforeClose: null,
    beforeConfirm: null,
    beforeCancel: null,
    showCancel: true,
    showClose: true,
    closeOnEscape: true,
    closeOnOverlay: true,
    destroyOnClose: false,
    className: '',
    mount: document.body,
    open: true,
    onOpen: null,
    onClose: null,
    onConfirm: null,
    onCancel: null,
    onDestroy: null,
    type: null,
    animation: undefined,
    icon: true,
    confirmColor: undefined,
    ...opts,
  };

  const type = STATUS_TYPES.includes(options.type) ? options.type : null;
  const tx = bindText('dialog', options.text, () => refresh());
  const confirmCaption = () => (options.confirmText != null ? String(options.confirmText) : tx.tf('common.ok'));
  const cancelCaption = () => (options.cancelText != null ? String(options.cancelText) : tx.tf('common.cancel'));
  const animation = options.animation === 'calm' ? 'calm' : 'sweet';
  // Status alerts are acknowledgements: only confirm-style types ask for a Cancel by default
  if (opts.showCancel === undefined && type) options.showCancel = type === 'question' || type === 'warning';
  const confirmColor = options.confirmColor || (type === 'error' ? 'negative' : 'primary');

  const root = document.createElement('div');
  root.className = 'lk-composable-dialog';
  root.hidden = true;

  const overlay = document.createElement('div');
  overlay.className = 'lk-modal-overlay';

  const modal = document.createElement('div');
  modal.className = [
    'lk-modal',
    type ? `lk-modal--status lk-modal--status-${type}` : '',
    animation === 'calm' ? 'lk-modal--calm' : '',
    options.className,
  ].filter(Boolean).join(' ');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('tabindex', '-1');

  const header = document.createElement('div');
  header.className = 'lk-modal__header';

  const titleEl = document.createElement('span');
  titleEl.className = 'lk-modal__title';
  titleEl.id = `lk-dialog-title-${Math.random().toString(36).slice(2, 9)}`;
  titleEl.textContent = options.title || '';

  if (options.title) {
    modal.setAttribute('aria-labelledby', titleEl.id);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'lk-modal__close';
  closeBtn.setAttribute('aria-label', tx.t('closeLabel'));
  closeBtn.appendChild(lkIcon('close'));

  header.appendChild(titleEl);
  if (options.showClose) {
    header.appendChild(closeBtn);
  }

  const body = document.createElement('div');
  body.className = 'lk-modal__body';

  const footer = document.createElement('div');
  footer.className = 'lk-modal__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'lk-btn lk-btn--secondary';
  cancelBtn.textContent = cancelCaption();

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = `lk-btn lk-btn--${confirmColor}`;
  confirmBtn.textContent = confirmCaption();

  if (options.showCancel) {
    footer.appendChild(cancelBtn);
  }
  footer.appendChild(confirmBtn);

  let statusEl = null;
  if (type && options.icon !== false) { statusEl = createStatusIcon(type, tx.t(`type.${type}`)); modal.appendChild(statusEl); }
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  root.appendChild(overlay);

  let isOpen = false;
  let destroyed = false;
  let shouldDestroyOnHide = false;
  let previousFocus = null;

  // Two-way channel (Feature.md F-02): lets content created as `content: (dialog) => node` — or any
  // outside code holding `api` — talk to whoever is awaiting `dialog.open()`, without callback plumbing.
  const channelHandlers = new Map(); // name -> Set<handler>
  const channel = {
    send(name, payload) {
      channelHandlers.get(name)?.forEach((fn) => fn(payload));
    },
    on(name, handler) {
      let set = channelHandlers.get(name);
      if (!set) channelHandlers.set(name, set = new Set());
      set.add(handler);
      return () => set.delete(handler);
    },
    off(name, handler) {
      channelHandlers.get(name)?.delete(handler);
    },
  };

  // open() returns a Promise-like `api` (Feature.md F-02): `await Look.lkDialog({...}).open()`
  // resolves once the dialog closes, with { reason, confirmed, cancelled, value }.
  let openResolve = null;
  let openPromise = Promise.resolve(undefined);
  let pendingValue;

  const trap = lkFocusTrap(modal);

  const presence = createPresenceController({
    element: root,
    visibleClass: 'lk-modal--open',
    closingClass: 'lk-modal--closing',
    exitMs: () => readDurationMs(root, '--lk-modal-exit-duration', EXIT_MS) + 20,
    hideWithHiddenAttr: true,
    afterShow() {
      const autoFocusTarget = confirmBtn || closeBtn || modal;
      if (autoFocusTarget && typeof autoFocusTarget.focus === 'function') {
        autoFocusTarget.focus({ preventScroll: true });
      }
    },
    afterHide() {
      if (shouldDestroyOnHide) {
        shouldDestroyOnHide = false;
        destroy();
      }
    },
  });

  const api = {
    el: root,
    overlayEl: overlay,
    dialogEl: modal,
    channel,
    get isOpen() {
      return isOpen;
    },
    open,
    close,
    setTitle,
    setContent,
    destroy,
    // Thenable: `await Look.lkDialog({...}).open()` resolves on close without changing what
    // `open()`/`close()` return for the existing synchronous chaining (`dialog.open().close()`).
    then(onFulfilled, onRejected) {
      return openPromise.then(onFulfilled, onRejected);
    },
    get text() { return tx.get(); },
    set text(v) { tx.set(v); },
  };

  appendDialogContent(body, options.content, api);

  // Re-apply every localized string to what is already rendered (locale switch / comp.text = …)
  function refresh() {
    if (destroyed) return;
    closeBtn.setAttribute('aria-label', tx.t('closeLabel'));
    cancelBtn.textContent = cancelCaption();
    confirmBtn.textContent = confirmCaption();
    if (statusEl) statusEl.setAttribute('aria-label', tx.t(`type.${type}`));
  }

  function setTitle(nextTitle) {
    options.title = nextTitle ?? '';
    titleEl.textContent = options.title;

    if (options.title) {
      modal.setAttribute('aria-labelledby', titleEl.id);
    } else {
      modal.removeAttribute('aria-labelledby');
    }
  }

  function setContent(nextContent) {
    options.content = nextContent;
    body.textContent = '';
    appendDialogContent(body, options.content, api);
  }

  function open() {
    if (destroyed) return api;
    if (isOpen) return api;

    if (!root.isConnected) {
      options.mount.appendChild(root);
    }

    shouldDestroyOnHide = false;
    previousFocus = document.activeElement;
    openPromise = new Promise((resolve) => { openResolve = resolve; });
    presence.show();
    isOpen = true;
    removeFromStack(api);
    openStack.push(api);

    callMaybe(options.onOpen, api);
    return api;
  }

  function settleOpenPromise(reason, value) {
    if (!openResolve) return;
    const resolve = openResolve;
    openResolve = null;
    resolve({ reason, confirmed: reason === 'confirm', cancelled: reason === 'cancel', value });
  }

  function close(reason = 'close', source = 'api', value) {
    if (destroyed || !isOpen) return api;
    pendingValue = value;
    guard(root, options, 'close', reason, { source, component: api }, (next) => doClose(typeof next === 'string' ? next : reason));
    return api;
  }

  function doClose(reason) {
    if (destroyed || !isOpen) return api;

    const value = pendingValue;
    pendingValue = undefined;
    shouldDestroyOnHide = !!options.destroyOnClose;
    presence.hide();
    isOpen = false;
    removeFromStack(api);

    if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }

    callMaybe(options.onClose, reason, api);
    settleOpenPromise(reason, value);
    return api;
  }

  function onOverlayClick(e) {
    if (!options.closeOnOverlay) return;
    if (e.target === overlay) {
      close('overlay', 'user');
    }
  }

  function onEsc(e) {
    if (!options.closeOnEscape || !isOpen) return;
    if (openStack[openStack.length - 1] !== api) return;
    if (e.key === 'Escape') {
      close('escape', 'user');
    }
  }

  let confirming = false;

  function onConfirmClick() {
    if (confirming || !isOpen) return;
    const outcome = guard(root, options, 'confirm', undefined, { source: 'user', component: api }, () => {
      // Legacy veto-by-return stays honoured; a non-boolean return becomes the resolved `value`
      // (so `onConfirm: () => selectedUser` surfaces as `(await dialog.open()).value`).
      const result = callMaybe(options.onConfirm, api);
      if (result !== false) close('confirm', 'user', result === true ? undefined : result);
    });
    if (outcome && typeof outcome.then === 'function') {
      // Async guard pending: keep the dialog open and the button inert until it decides
      confirming = true;
      confirmBtn.disabled = true;
      confirmBtn.setAttribute('aria-busy', 'true');
      outcome.then(() => {}, () => {}).then(() => {
        confirming = false;
        if (destroyed) return;
        confirmBtn.disabled = false;
        confirmBtn.removeAttribute('aria-busy');
      });
    }
  }

  function onCancelClick() {
    guard(root, options, 'cancel', undefined, { source: 'user', component: api }, () => {
      const result = callMaybe(options.onCancel, api);
      if (result !== false) close('cancel', 'user');
    });
  }

  function onCloseClick() {
    close('close-button', 'user');
  }

  function destroy() {
    if (destroyed) return;
    const wasOpen = isOpen;
    destroyed = true;
    isOpen = false;
    shouldDestroyOnHide = false;
    removeFromStack(api);
    // Never leave an `await dialog.open()` hanging if the dialog is torn down while open/pending.
    settleOpenPromise('destroy', undefined);
    channelHandlers.clear();

    presence.destroy();
    tx.destroy();

    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onEsc);
    confirmBtn.removeEventListener('click', onConfirmClick);
    cancelBtn.removeEventListener('click', onCancelClick);
    closeBtn.removeEventListener('click', onCloseClick);
    trap.destroy();

    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
    callMaybe(options.onDestroy, api);

    if (wasOpen && previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onEsc);
  confirmBtn.addEventListener('click', onConfirmClick);
  if (options.showCancel) cancelBtn.addEventListener('click', onCancelClick);
  if (options.showClose) closeBtn.addEventListener('click', onCloseClick);

  if (options.open) {
    open();
  }

  return api;
}

// Shorthands: lkDialog.success(title, content?, opts?) …
STATUS_TYPES.forEach((t) => {
  lkDialog[t] = (title, content = '', more = {}) => lkDialog({ destroyOnClose: true, ...more, type: t, title, content });
});
