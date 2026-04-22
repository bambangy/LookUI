import { lkIcon } from '../components/icon.js';

const CONTAINER_PREFIX = 'lk-toast-container';

const POSITION_MAP = {
  'top-left':      { top: 'var(--lk-space-4)', left: 'var(--lk-space-4)' },
  'top-center':    { top: 'var(--lk-space-4)', left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: 'var(--lk-space-4)', right: 'var(--lk-space-4)' },
  'bottom-left':   { bottom: 'var(--lk-space-4)', left: 'var(--lk-space-4)' },
  'bottom-center': { bottom: 'var(--lk-space-4)', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: 'var(--lk-space-4)', right: 'var(--lk-space-4)' },
};

// Default icon per type
const TYPE_ICONS = {
  positive: 'circle-check',
  negative: 'circle-x',
  warning:  'alert-triangle',
  info:     'circle-info',
  primary:  'circle-info',
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
  container.style.zIndex = String(zIndex);
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
 * @param {string} [opts.title]        — bold heading text
 * @param {string} [opts.message]      — body text
 * @param {string} [opts.type]         — 'positive' | 'negative' | 'warning' | 'info' | 'primary' | '' (default neutral)
 * @param {string} [opts.icon]         — override icon name (defaults per type, pass false to suppress)
 * @param {number} [opts.duration]     — ms before auto-close; 0 = no auto-close (default 3000)
 * @param {string} [opts.position]     — 'top-right' | 'top-left' | 'top-center' | 'bottom-*' (default 'top-right')
 * @param {boolean}[opts.dismissible]  — show close button (default true)
 * @param {number} [opts.zIndex]       — (default 110)
 * @param {string} [opts.actionText]   — text for optional action link
 * @param {Function}[opts.onAction]    — callback when action clicked
 * @param {Function}[opts.onClose]     — callback(reason) on close
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
    zIndex: 110,
    actionText: '',
    onAction: null,
    onClose: null,
    ...opts,
  };

  const container = getContainer(options.position, options.zIndex);

  // --- Root element ---
  const toast = document.createElement('div');
  toast.className = 'lk-toast' + (options.type ? ` lk-toast--${options.type}` : '');

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
  if (!options.title) titleEl.style.display = 'none';

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

  function cleanupContainerIfEmpty() {
    if (container.childElementCount === 0 && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  function close(reason = 'close') {
    if (!open) return;
    open = false;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (actionBtn) actionBtn.removeEventListener('click', onActionClick);
    if (closeBtn)  closeBtn.removeEventListener('click', onCloseClick);

    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }

    cleanupContainerIfEmpty();

    if (typeof options.onClose === 'function') {
      options.onClose(reason);
    }
  }

  function onCloseClick()  { close('dismiss'); }

  function onActionClick() {
    if (typeof options.onAction === 'function') options.onAction();
    close('action');
  }

  function update(next = {}) {
    if (typeof next.title === 'string') {
      options.title = next.title;
      titleEl.textContent = next.title;
      titleEl.style.display = next.title ? '' : 'none';
    }
    if (typeof next.message === 'string') {
      options.message = next.message;
      messageEl.textContent = next.message;
    }
  }

  if (actionBtn) actionBtn.addEventListener('click', onActionClick);
  if (closeBtn)  closeBtn.addEventListener('click', onCloseClick);

  container.appendChild(toast);

  if (options.duration > 0) {
    timer = setTimeout(() => close('timeout'), options.duration);
  }

  return {
    el: toast,
    close,
    update,
    get isOpen() { return open; },
  };
}
