import { lkFocusTrap } from '../behaviors/index.js';
import { lkIcon } from '../components/icon.js';

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
 * @param {Object} [opts={}]
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
    ...opts,
  };

  const root = document.createElement('div');
  root.className = 'lk-composable-dialog';
  root.hidden = true;

  const overlay = document.createElement('div');
  overlay.className = 'lk-modal-overlay';

  const modal = document.createElement('div');
  modal.className = `lk-modal ${options.className}`.trim();
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
  confirmBtn.className = 'lk-btn lk-btn--primary';
  confirmBtn.textContent = options.confirmText;

  if (options.showCancel) {
    footer.appendChild(cancelBtn);
  }
  footer.appendChild(confirmBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  root.appendChild(overlay);

  let isOpen = false;
  let destroyed = false;
  let previousFocus = null;

  const trap = lkFocusTrap(modal);

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

    previousFocus = document.activeElement;
    root.hidden = false;
    root.classList.add('lk-modal--open');
    isOpen = true;

    const autoFocusTarget = confirmBtn || closeBtn || modal;
    requestAnimationFrame(() => autoFocusTarget.focus());

    callMaybe(options.onOpen, api);
    return api;
  }

  function close(reason = 'close') {
    if (destroyed || !isOpen) return api;

    root.classList.remove('lk-modal--open');
    root.hidden = true;
    isOpen = false;

    if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
      previousFocus.focus();
    }

    callMaybe(options.onClose, reason, api);

    if (options.destroyOnClose) {
      destroy();
    }

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
    destroyed = true;
    isOpen = false;

    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onEsc);
    confirmBtn.removeEventListener('click', onConfirmClick);
    cancelBtn.removeEventListener('click', onCancelClick);
    closeBtn.removeEventListener('click', onCloseClick);
    trap.destroy();

    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
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
