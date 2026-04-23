import { createPresenceController } from '../helpers/motion.js';

const EXIT_MS = 360;

function resolveTarget(target) {
  if (!target) throw new Error('Look.lkInnerLoading: target is required.');
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`Look.lkInnerLoading: target not found - "${target}"`);
  return node;
}

function toNode(content) {
  if (content == null) return null;
  if (typeof content === 'function') return toNode(content());
  if (typeof Node !== 'undefined' && content instanceof Node) return content;

  const el = document.createElement('div');
  el.textContent = String(content);
  return el;
}

/**
 * Create an inner loading overlay inside a target element.
 * @param {Element|string} target
 * @param {Object} [opts={}]
 * @returns {{ el: Element, show: Function, hide: Function, setContent: Function, destroy: Function, isVisible: boolean }}
 */
export function lkInnerLoading(target, opts = {}) {
  const node = resolveTarget(target);
  const options = {
    content: null,
    text: '',
    spinner: true,
    spinnerSize: 'sm',
    backdrop: true,
    lockPointer: true,
    open: true,
    ...opts,
  };

  const overlay = document.createElement('div');
  overlay.className = 'lk-inner-loading';
  overlay.hidden = true;
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = options.backdrop ? 'var(--lk-overlay)' : 'transparent';
  overlay.style.pointerEvents = options.lockPointer ? 'auto' : 'none';

  const panel = document.createElement('div');
  panel.className = 'lk-card';

  const body = document.createElement('div');
  body.className = 'lk-card__body';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.alignItems = 'center';
  body.style.gap = 'var(--lk-space-2)';

  if (options.spinner) {
    const spinner = document.createElement('span');
    spinner.className = `lk-spinner lk-spinner--${options.spinnerSize}`;
    body.appendChild(spinner);
  }

  if (options.text) {
    const label = document.createElement('div');
    label.textContent = options.text;
    label.style.fontSize = 'var(--lk-text-sm)';
    body.appendChild(label);
  }

  const contentSlot = document.createElement('div');
  const content = toNode(options.content);
  if (content) {
    contentSlot.appendChild(content);
    body.appendChild(contentSlot);
  }

  panel.appendChild(body);
  overlay.appendChild(panel);

  let visible = false;
  let destroyed = false;
  const hadPosition = node.style.position;

  if (getComputedStyle(node).position === 'static') {
    node.style.position = 'relative';
  }

  node.appendChild(overlay);

  const presence = createPresenceController({
    element: overlay,
    visibleClass: 'lk-inner-loading--open',
    closingClass: '',
    exitMs: EXIT_MS,
    hideWithHiddenAttr: true,
  });

  function show() {
    if (destroyed || visible) return;

    presence.show();
    visible = true;
  }

  function hide() {
    if (destroyed || !visible) return;

    presence.hide();
    visible = false;
  }

  function setContent(nextContent) {
    options.content = nextContent;
    contentSlot.textContent = '';
    const normalized = toNode(nextContent);

    if (!normalized) {
      if (contentSlot.parentNode) {
        contentSlot.parentNode.removeChild(contentSlot);
      }
      return;
    }

    contentSlot.appendChild(normalized);
    if (!contentSlot.parentNode) {
      body.appendChild(contentSlot);
    }
  }

  function destroy() {
    if (destroyed) return;

    hide();
    destroyed = true;
    presence.destroy();

    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    node.style.position = hadPosition;
  }

  if (options.open) {
    show();
  }

  return {
    el: overlay,
    show,
    hide,
    setContent,
    destroy,
    get isVisible() {
      return visible;
    },
  };
}


