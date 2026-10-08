// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { lkFocusTrap } from '../behaviors/index.js';
import { lkIcon } from '../components/icon.js';
import { createPresenceController, readDurationMs } from '../helpers/motion.js';

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

function createStatusIcon(type) {
  const wrap = document.createElement('div');
  wrap.className = `lk-dialog-status lk-dialog-status--${type}`;
  wrap.setAttribute('aria-hidden', 'true');
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

function appendDialogContent(container, content) {
  if (content == null) return;

  if (typeof content === 'function') {
    appendDialogContent(container, content());
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
 * @returns {{ el: Element, overlayEl: Element, dialogEl: Element, isOpen: boolean, open: Function, close: Function, setTitle: Function, setContent: Function, destroy: Function }}
 */
export function lkDialog(opts = {}) {
  const options = {
    title: '',
    content: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
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
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.appendChild(lkIcon('close'));

  header.appendChild(titleEl);
  if (options.showClose) {
    header.appendChild(closeBtn);
  }

  const body = document.createElement('div');
  body.className = 'lk-modal__body';
  appendDialogContent(body, options.content);

  const footer = document.createElement('div');
  footer.className = 'lk-modal__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'lk-btn lk-btn--secondary';
  cancelBtn.textContent = options.cancelText;

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = `lk-btn lk-btn--${confirmColor}`;
  confirmBtn.textContent = options.confirmText;

  if (options.showCancel) {
    footer.appendChild(cancelBtn);
  }
  footer.appendChild(confirmBtn);

  if (type && options.icon !== false) modal.appendChild(createStatusIcon(type));
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  root.appendChild(overlay);

  let isOpen = false;
  let destroyed = false;
  let shouldDestroyOnHide = false;
  let previousFocus = null;

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
    get isOpen() {
      return isOpen;
    },
    open,
    close,
    setTitle,
    setContent,
    destroy,
  };

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
    appendDialogContent(body, options.content);
  }

  function open() {
    if (destroyed || isOpen) return api;

    if (!root.isConnected) {
      options.mount.appendChild(root);
    }

    shouldDestroyOnHide = false;
    previousFocus = document.activeElement;
    presence.show();
    isOpen = true;
    removeFromStack(api);
    openStack.push(api);

    callMaybe(options.onOpen, api);
    return api;
  }

  function close(reason = 'close') {
    if (destroyed || !isOpen) return api;

    shouldDestroyOnHide = !!options.destroyOnClose;
    presence.hide();
    isOpen = false;
    removeFromStack(api);

    if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }

    callMaybe(options.onClose, reason, api);
    return api;
  }

  function onOverlayClick(e) {
    if (!options.closeOnOverlay) return;
    if (e.target === overlay) {
      close('overlay');
    }
  }

  function onEsc(e) {
    if (!options.closeOnEscape || !isOpen) return;
    if (openStack[openStack.length - 1] !== api) return;
    if (e.key === 'Escape') {
      close('escape');
    }
  }

  function onConfirmClick() {
    const result = callMaybe(options.onConfirm, api);
    if (result !== false) {
      close('confirm');
    }
  }

  function onCancelClick() {
    const result = callMaybe(options.onCancel, api);
    if (result !== false) {
      close('cancel');
    }
  }

  function onCloseClick() {
    close('close-button');
  }

  function destroy() {
    if (destroyed) return;
    const wasOpen = isOpen;
    destroyed = true;
    isOpen = false;
    shouldDestroyOnHide = false;
    removeFromStack(api);

    presence.destroy();

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
