// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { lkIcon } from '../components/icon.js';
import { createPresenceController, readDurationMs } from '../helpers/motion.js';

const CONTAINER_PREFIX = 'lk-toast-container';
const EXIT_MS = 320;

const POSITION_MAP = {
  'top-left': { top: 'var(--lk-space-4)', left: 'var(--lk-space-4)' },
  'top-center': { top: 'var(--lk-space-4)', left: '50%', transform: 'translateX(-50%)' },
  'top-right': { top: 'var(--lk-space-4)', right: 'var(--lk-space-4)' },
  'bottom-left': { bottom: 'var(--lk-space-4)', left: 'var(--lk-space-4)' },
  'bottom-center': { bottom: 'var(--lk-space-4)', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right': { bottom: 'var(--lk-space-4)', right: 'var(--lk-space-4)' },
};

// Default icon per type
const TYPE_ICONS = {
  positive: 'circle-check',
  negative: 'circle-x',
  warning: 'alert-triangle',
  info: 'circle-info',
  primary: 'circle-info',
};

function createContainer(position, zIndex) {
  const pos = POSITION_MAP[position] || POSITION_MAP['top-right'];
  const container = document.createElement('div');
  container.className = `${CONTAINER_PREFIX} ${CONTAINER_PREFIX}--${position}`;
  container.style.position = 'fixed';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = 'var(--lk-space-2)';
  container.style.pointerEvents = 'none';
  container.style.zIndex = zIndex == null ? 'var(--lk-z-toast)' : String(zIndex);
  container.style.maxWidth = 'min(28rem, calc(100vw - var(--lk-space-8)))';
  Object.assign(container.style, pos);

  document.body.appendChild(container);
  return container;
}

function getContainer(position, zIndex) {
  const selector = `.${CONTAINER_PREFIX}--${position}`;
  let container = document.querySelector(selector);
  if (!container) {
    container = createContainer(position, zIndex);
  }
  return container;
}

/**
 * Show a disposable toast notification.
 * @param {Object} [opts={}]
 * @param {string} [opts.title] - bold heading text
 * @param {string} [opts.message] - body text
 * @param {string} [opts.type] - 'positive' | 'negative' | 'warning' | 'info' | 'primary' | '' (default neutral)
 * @param {string} [opts.icon] - override icon name (defaults per type, pass false to suppress)
 * @param {number} [opts.duration] - ms before auto-close; 0 = no auto-close (default 3000)
 * @param {string} [opts.position] - 'top-right' | 'top-left' | 'top-center' | 'bottom-*' (default 'top-right')
 * @param {boolean} [opts.dismissible] - show close button (default true)
 * @param {number} [opts.zIndex] - (default var(--lk-z-toast))
 * @param {string} [opts.actionText] - text for optional action link
 * @param {Function} [opts.onAction] - (toast) when the action button is clicked
 * @param {Function} [opts.onClose] - (reason, toast) on close
 * @returns {{ el: Element, close: Function, update: Function, isOpen: boolean }}
 */
export function lkToast(opts = {}) {
  const options = {
    title: '',
    message: '',
    type: '',
    icon: null,
    duration: 3000,
    position: 'top-right',
    dismissible: true,
    zIndex: null,
    actionText: '',
    onAction: null,
    onClose: null,
    ...opts,
  };

  const container = getContainer(options.position, options.zIndex);

  // --- Root element ---
  const toast = document.createElement('div');
  toast.className = 'lk-toast' + (options.type ? ` lk-toast--${options.type}` : '');
  // Exit direction: toward the edge the stack sits on
  const exitDir = options.position.endsWith('left') ? 'left'
    : options.position.endsWith('right') ? 'right'
      : (options.position.startsWith('bottom') ? 'down' : 'up');
  toast.classList.add(`lk-toast--exit-${exitDir}`);
  if (options.position.startsWith('bottom')) {
    toast.classList.add('lk-toast--from-bottom');
  }

  // --- Icon slot ---
  const iconName = options.icon !== false
    ? (options.icon ?? TYPE_ICONS[options.type] ?? null)
    : null;

  if (iconName) {
    const iconSlot = document.createElement('div');
    iconSlot.className = 'lk-toast__icon';
    iconSlot.appendChild(lkIcon(iconName));
    toast.appendChild(iconSlot);
  }

  // --- Content slot ---
  const content = document.createElement('div');
  content.className = 'lk-toast__content';

  const titleEl = document.createElement('div');
  titleEl.className = 'lk-toast__title';
  titleEl.textContent = options.title;
  titleEl.hidden = !options.title;

  const messageEl = document.createElement('div');
  messageEl.className = 'lk-toast__message';
  messageEl.textContent = options.message;

  content.appendChild(titleEl);
  content.appendChild(messageEl);
  toast.appendChild(content);

  // --- Action button ---
  let actionBtn = null;
  if (options.actionText) {
    actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'lk-toast__action';
    actionBtn.textContent = options.actionText;
    toast.appendChild(actionBtn);
  }

  // --- Close button ---
  let closeBtn = null;
  if (options.dismissible) {
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lk-toast__close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.appendChild(lkIcon('close', { size: 'sm' }));
    toast.appendChild(closeBtn);
  }

  // --- Logic ---
  let timer = null;
  let open = true;
  let closeReason = 'close';

  function cleanupContainerIfEmpty() {
    if (container.childElementCount === 0 && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  const presence = createPresenceController({
    element: toast,
    visibleClass: 'lk-toast--open',
    closingClass: 'lk-toast--closing',
    exitMs: () => readDurationMs(toast, '--lk-toast-slide-duration', EXIT_MS)
      + readDurationMs(toast, '--lk-toast-collapse-duration', 0) + 20,
    hideWithHiddenAttr: false,
    beforeHide() {
      // Collapse animates from the real height, so pin it before the closing class lands
      toast.style.maxHeight = `${toast.offsetHeight}px`;
      void toast.offsetHeight;
    },
    afterHide() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }

      cleanupContainerIfEmpty();

      if (typeof options.onClose === 'function') {
        options.onClose(closeReason, instance);
      }
    },
  });

  function clearAutoTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function close(reason = 'close') {
    if (!open) return;
    open = false;
    closeReason = reason;

    clearAutoTimer();

    if (actionBtn) actionBtn.removeEventListener('click', onActionClick);
    if (closeBtn) closeBtn.removeEventListener('click', onCloseClick);

    presence.hide();
  }

  function onCloseClick() { close('dismiss'); }

  function onActionClick() {
    if (typeof options.onAction === 'function') options.onAction(instance);
    close('action');
  }

  function update(next = {}) {
    if (typeof next.title === 'string') {
      options.title = next.title;
      titleEl.textContent = next.title;
      titleEl.hidden = !next.title;
    }
    if (typeof next.message === 'string') {
      options.message = next.message;
      messageEl.textContent = next.message;
    }
  }

  if (actionBtn) actionBtn.addEventListener('click', onActionClick);
  if (closeBtn) closeBtn.addEventListener('click', onCloseClick);

  container.appendChild(toast);
  presence.show();

  if (options.duration > 0) {
    timer = setTimeout(() => close('timeout'), options.duration);
  }

  const instance = {
    el: toast,
    close,
    update,
    get isOpen() { return open; },
  };

  return instance;
}


