import { createPresenceController } from '../helpers/motion.js';

let activeCount = 0;
const EXIT_MS = 360;

function toElement(content) {
  if (content == null) return null;
  if (typeof content === 'function') return toElement(content());
  if (typeof Node !== 'undefined' && content instanceof Node) return content;

  const text = document.createElement('div');
  text.textContent = String(content);
  return text;
}

/**
 * Create a fullscreen loading overlay.
 * @param {Object} [opts={}]
 * @returns {{ el: Element, show: Function, hide: Function, setContent: Function, destroy: Function, isVisible: boolean }}
 */
export function lkLoading(opts = {}) {
  const options = {
    content: null,
    text: '',
    spinner: true,
    spinnerSize: 'lg',
    backdrop: true,
    closeOnClick: false,
    lockScroll: true,
    zIndexBase: 100,
    open: true,
    onShow: null,
    onHide: null,
    ...opts,
  };

  const root = document.createElement('div');
  root.className = 'lk-loading-overlay';
  root.hidden = true;
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.zIndex = String(options.zIndexBase + activeCount);
  root.style.background = options.backdrop ? 'var(--lk-overlay)' : 'transparent';

  const panel = document.createElement('div');
  panel.className = 'lk-card lk-card--raised';
  panel.style.minWidth = '10rem';

  const body = document.createElement('div');
  body.className = 'lk-card__body';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.alignItems = 'center';
  body.style.gap = 'var(--lk-space-3)';

  const spinner = document.createElement('span');
  spinner.className = `lk-spinner lk-spinner--${options.spinnerSize}`;

  const text = document.createElement('div');
  text.style.textAlign = 'center';
  text.textContent = options.text;

  const contentSlot = document.createElement('div');

  if (options.spinner) {
    body.appendChild(spinner);
  }

  if (options.text) {
    body.appendChild(text);
  }

  const extraContent = toElement(options.content);
  if (extraContent) {
    contentSlot.appendChild(extraContent);
    body.appendChild(contentSlot);
  }

  panel.appendChild(body);
  root.appendChild(panel);

  let visible = false;
  let destroyed = false;
  let previousOverflow = '';

  const presence = createPresenceController({
    element: root,
    visibleClass: 'lk-loading-overlay--open',
    closingClass: '',
    exitMs: EXIT_MS,
    hideWithHiddenAttr: true,
  });

  function setBodyLock(lock) {
    if (!options.lockScroll) return;

    if (lock) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow;
    }
  }

  function show() {
    if (destroyed || visible) return;

    if (!root.isConnected) {
      document.body.appendChild(root);
    }

    activeCount += 1;
    root.style.zIndex = String(options.zIndexBase + activeCount);

    presence.show();
    visible = true;
    setBodyLock(true);

    if (typeof options.onShow === 'function') {
      options.onShow();
    }
  }

  function hide(reason = 'hide') {
    if (destroyed || !visible) return;

    presence.hide();
    visible = false;
    setBodyLock(false);
    if (activeCount > 0) activeCount -= 1;

    if (typeof options.onHide === 'function') {
      options.onHide(reason);
    }
  }

  function setContent(nextContent) {
    options.content = nextContent;
    contentSlot.textContent = '';

    const normalized = toElement(nextContent);
    if (!normalized) {
      if (contentSlot.parentNode) contentSlot.parentNode.removeChild(contentSlot);
      return;
    }

    contentSlot.appendChild(normalized);
    if (!contentSlot.parentNode) {
      body.appendChild(contentSlot);
    }
  }

  function onRootClick(e) {
    if (!options.closeOnClick) return;
    if (e.target === root) {
      hide('backdrop');
    }
  }

  function destroy() {
    if (destroyed) return;

    hide('destroy');
    destroyed = true;
    presence.destroy();
    root.removeEventListener('click', onRootClick);

    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  root.addEventListener('click', onRootClick);

  if (options.open) {
    show();
  }

  return {
    el: root,
    show,
    hide,
    setContent,
    destroy,
    get isVisible() {
      return visible;
    },
  };
}


