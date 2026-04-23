import { createPresenceController } from '../helpers/motion.js';

const LAYER_CLASS = 'lk-popup-proxy';
const PANEL_CLASS = 'lk-popup-proxy__panel';
const STASH_ID = 'lk-popup-proxy-stash';
const EXIT_MS = 280;

const PLACEMENT_ALIAS = {
  top: 'top-left',
  bottom: 'bottom-left',
  left: 'left-top',
  right: 'right-top',
};

const PLACEMENT_ORDER = {
  'bottom-left': ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'right-top', 'left-top', 'right-bottom', 'left-bottom'],
  'bottom-right': ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'left-top', 'right-top', 'left-bottom', 'right-bottom'],
  'top-left': ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'right-top', 'left-top', 'right-bottom', 'left-bottom'],
  'top-right': ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'left-top', 'right-top', 'left-bottom', 'right-bottom'],
  'left-top': ['left-top', 'left-bottom', 'right-top', 'right-bottom', 'bottom-left', 'top-left', 'bottom-right', 'top-right'],
  'left-bottom': ['left-bottom', 'left-top', 'right-bottom', 'right-top', 'top-left', 'bottom-left', 'top-right', 'bottom-right'],
  'right-top': ['right-top', 'right-bottom', 'left-top', 'left-bottom', 'bottom-right', 'top-right', 'bottom-left', 'top-left'],
  'right-bottom': ['right-bottom', 'right-top', 'left-bottom', 'left-top', 'top-right', 'bottom-right', 'top-left', 'bottom-left'],
};

function resolveTarget(target) {
  if (!target) throw new Error('Look.lkPopupProxy: target is required.');

  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`Look.lkPopupProxy: target not found - "${target}"`);

  return node;
}

function normalizePlacement(value) {
  if (!value) return 'bottom-left';

  const normalized = String(value).toLowerCase().trim();
  if (PLACEMENT_ALIAS[normalized]) return PLACEMENT_ALIAS[normalized];
  if (PLACEMENT_ORDER[normalized]) return normalized;
  return 'bottom-left';
}

function ensureStashRoot() {
  let stash = document.getElementById(STASH_ID);
  if (stash) return stash;

  stash = document.createElement('div');
  stash.id = STASH_ID;
  stash.hidden = true;
  stash.style.display = 'none';
  document.body.appendChild(stash);
  return stash;
}

function toRenderableContent(input, ctx) {
  const { options, stashRoot, adoptSourceElement } = ctx;

  if (input == null) return document.createTextNode('');

  if (typeof input === 'function') {
    return toRenderableContent(input(), ctx);
  }

  if (typeof input === 'string') {
    const value = input.trim();

    if (value.startsWith('#')) {
      const source = document.querySelector(value);
      if (source) {
        return toRenderableContent(source, ctx);
      }
    }

    if (options.allowHtml && /<[^>]+>/.test(value)) {
      const html = document.createElement('div');
      html.innerHTML = value;
      return html;
    }

    const text = document.createElement('div');
    text.textContent = input;
    return text;
  }

  if (typeof Node !== 'undefined' && input instanceof Node) {
    if (input instanceof HTMLTemplateElement) {
      return input.content.cloneNode(true);
    }

    if (input.isConnected) {
      adoptSourceElement(input, stashRoot);
    }

    return input.cloneNode(true);
  }

  const fallback = document.createElement('div');
  fallback.textContent = String(input);
  return fallback;
}

function getCandidatePosition(rect, popupRect, placement, gap, offsetX, offsetY) {
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;

  switch (placement) {
    case 'bottom-right':
      return { top: rect.bottom + gap + offsetY, left: rect.right - popupWidth + offsetX };
    case 'top-left':
      return { top: rect.top - popupHeight - gap + offsetY, left: rect.left + offsetX };
    case 'top-right':
      return { top: rect.top - popupHeight - gap + offsetY, left: rect.right - popupWidth + offsetX };
    case 'left-top':
      return { top: rect.top + offsetY, left: rect.left - popupWidth - gap + offsetX };
    case 'left-bottom':
      return { top: rect.bottom - popupHeight + offsetY, left: rect.left - popupWidth - gap + offsetX };
    case 'right-top':
      return { top: rect.top + offsetY, left: rect.right + gap + offsetX };
    case 'right-bottom':
      return { top: rect.bottom - popupHeight + offsetY, left: rect.right + gap + offsetX };
    case 'bottom-left':
    default:
      return { top: rect.bottom + gap + offsetY, left: rect.left + offsetX };
  }
}

function scoreOverflow(position, popupRect, viewport, margin) {
  const right = position.left + popupRect.width;
  const bottom = position.top + popupRect.height;

  const overflowLeft = Math.max(0, margin - position.left);
  const overflowRight = Math.max(0, right - (viewport.width - margin));
  const overflowTop = Math.max(0, margin - position.top);
  const overflowBottom = Math.max(0, bottom - (viewport.height - margin));

  return overflowLeft + overflowRight + overflowTop + overflowBottom;
}

function clampPosition(position, popupRect, viewport, margin) {
  const minLeft = margin;
  const maxLeft = Math.max(margin, viewport.width - popupRect.width - margin);
  const minTop = margin;
  const maxTop = Math.max(margin, viewport.height - popupRect.height - margin);

  return {
    top: Math.min(Math.max(position.top, minTop), maxTop),
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
  };
}

function getSideFromPlacement(placement) {
  const side = String(placement || '').split('-')[0];
  if (side === 'top' || side === 'bottom' || side === 'left' || side === 'right') return side;
  return 'bottom';
}

/**
 * Create a popup proxy attached to a trigger element.
 * Supports text, HTML, Node, template, or existing element selector as content.
 * @param {Element|string} target
 * @param {Object} [opts={}]
 * @returns {{ el: Element, panelEl: Element, show: Function, hide: Function, toggle: Function, setContent: Function, setPlacement: Function, updatePosition: Function, destroy: Function, isOpen: boolean }}
 */
export function lkPopupProxy(target, opts = {}) {
  const trigger = resolveTarget(target);
  const options = {
    content: '',
    placement: 'bottom-left',
    autoPlacement: true,
    gap: 8,
    viewportMargin: 8,
    offsetX: 0,
    offsetY: 0,
    closeOnOutside: true,
    closeOnEscape: true,
    toggleOnTrigger: true,
    allowHtml: true,
    className: '',
    zIndex: 95,
    mount: document.body,
    open: false,
    onShow: null,
    onHide: null,
    ...opts,
  };

  const stashRoot = ensureStashRoot();
  const adoptedSources = [];

  const layer = document.createElement('div');
  layer.className = LAYER_CLASS;
  layer.hidden = true;
  layer.style.position = 'fixed';
  layer.style.inset = '0';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = String(options.zIndex);

  const panel = document.createElement('div');
  panel.className = `${PANEL_CLASS} ${options.className}`.trim();
  panel.style.position = 'fixed';
  panel.style.pointerEvents = 'auto';

  layer.appendChild(panel);

  let open = false;
  let destroyed = false;
  let placement = normalizePlacement(options.placement);
  let anchorEl = trigger;
  let rafId = null;

  const presence = createPresenceController({
    element: layer,
    visibleClass: 'lk-popup-proxy--open',
    closingClass: 'lk-popup-proxy--closing',
    exitMs: EXIT_MS,
    hideWithHiddenAttr: true,
  });

  function adoptSourceElement(source, stash) {
    if (!source || source === trigger || source === panel || panel.contains(source)) return;

    const exists = adoptedSources.find((x) => x.el === source);
    if (exists) return;

    const parent = source.parentNode;
    if (!parent) return;

    const marker = document.createComment('lk-popup-proxy-source');
    parent.insertBefore(marker, source);
    stash.appendChild(source);

    adoptedSources.push({ el: source, parent, marker });
  }

  function renderContent(nextContent) {
    panel.textContent = '';

    const normalized = toRenderableContent(nextContent, {
      options,
      stashRoot,
      adoptSourceElement,
    });

    panel.appendChild(normalized);
  }

  function computePlacement(rect, popupRect) {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const candidateList = options.autoPlacement
      ? (PLACEMENT_ORDER[placement] || PLACEMENT_ORDER['bottom-left'])
      : [placement];

    let best = null;

    for (const candidate of candidateList) {
      const base = getCandidatePosition(
        rect,
        popupRect,
        candidate,
        Number(options.gap) || 0,
        Number(options.offsetX) || 0,
        Number(options.offsetY) || 0,
      );

      const overflow = scoreOverflow(base, popupRect, viewport, Number(options.viewportMargin) || 0);
      if (!best || overflow < best.overflow) {
        best = { candidate, overflow, base };
        if (overflow === 0) break;
      }
    }

    const chosen = best || {
      candidate: placement,
      base: getCandidatePosition(rect, popupRect, placement, Number(options.gap) || 0, Number(options.offsetX) || 0, Number(options.offsetY) || 0),
    };

    const clamped = clampPosition(chosen.base, popupRect, viewport, Number(options.viewportMargin) || 0);
    return {
      placement: chosen.candidate,
      top: clamped.top,
      left: clamped.left,
    };
  }

  function updatePosition(nextAnchor = anchorEl) {
    if (destroyed) return;

    const resolved = nextAnchor && nextAnchor.getBoundingClientRect ? nextAnchor : trigger;
    if (!resolved || !resolved.getBoundingClientRect) return;

    anchorEl = resolved;

    const rect = anchorEl.getBoundingClientRect();
    const popupRect = panel.getBoundingClientRect();
    const nextPosition = computePlacement(rect, popupRect);

    panel.style.top = `${nextPosition.top}px`;
    panel.style.left = `${nextPosition.left}px`;
    panel.dataset.side = getSideFromPlacement(nextPosition.placement);
    panel.dataset.placement = nextPosition.placement;
  }

  function scheduleUpdatePosition() {
    if (!open || destroyed) return;

    if (rafId != null) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      rafId = null;
      updatePosition(anchorEl);
    });
  }

  function onDocumentClick(e) {
    if (!open || !options.closeOnOutside) return;

    const targetNode = e.target;
    if (panel.contains(targetNode) || trigger.contains(targetNode)) return;

    hide('outside');
  }

  function onDocumentKeydown(e) {
    if (!open || !options.closeOnEscape) return;
    if (e.key === 'Escape') {
      hide('escape');
    }
  }

  function bindViewportListeners() {
    window.addEventListener('resize', scheduleUpdatePosition);
    window.addEventListener('scroll', scheduleUpdatePosition, true);
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown);
  }

  function unbindViewportListeners() {
    window.removeEventListener('resize', scheduleUpdatePosition);
    window.removeEventListener('scroll', scheduleUpdatePosition, true);
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown);
  }

  function show(anchor = trigger) {
    if (destroyed || open) return;

    if (!layer.isConnected) {
      options.mount.appendChild(layer);
    }

    anchorEl = anchor && anchor.getBoundingClientRect ? anchor : trigger;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-haspopup', 'dialog');

    if (layer.hidden) {
      layer.hidden = false;
      panel.style.visibility = 'hidden';
      updatePosition(anchorEl);
      panel.style.visibility = '';
      layer.hidden = true;
    }

    presence.show();
    open = true;
    bindViewportListeners();
    scheduleUpdatePosition();

    if (typeof options.onShow === 'function') {
      options.onShow({ anchor: anchorEl, placement: panel.dataset.placement || placement });
    }
  }

  function hide(reason = 'hide') {
    if (destroyed || !open) return;

    open = false;
    trigger.setAttribute('aria-expanded', 'false');
    unbindViewportListeners();

    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    presence.hide();

    if (typeof options.onHide === 'function') {
      options.onHide(reason);
    }
  }

  function toggle(anchor = trigger) {
    if (open) {
      hide('toggle');
      return;
    }

    show(anchor);
  }

  function onTriggerClick(e) {
    if (!options.toggleOnTrigger) {
      show(e.currentTarget || trigger);
      return;
    }

    toggle(e.currentTarget || trigger);
  }

  function setContent(nextContent) {
    options.content = nextContent;
    renderContent(nextContent);
    scheduleUpdatePosition();
  }

  function setPlacement(nextPlacement) {
    placement = normalizePlacement(nextPlacement);
    scheduleUpdatePosition();
  }

  function destroy() {
    if (destroyed) return;

    hide('destroy');
    destroyed = true;

    presence.destroy();
    trigger.removeEventListener('click', onTriggerClick);

    for (const source of adoptedSources) {
      if (!source.parent || !source.marker) continue;
      source.parent.insertBefore(source.el, source.marker);
      source.marker.remove();
    }

    if (layer.parentNode) {
      layer.parentNode.removeChild(layer);
    }
  }

  renderContent(options.content);
  trigger.addEventListener('click', onTriggerClick);

  if (options.open) {
    show(trigger);
  } else {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'dialog');
  }

  return {
    el: layer,
    panelEl: panel,
    show,
    hide,
    toggle,
    setContent,
    setPlacement,
    updatePosition,
    destroy,
    get isOpen() {
      return open;
    },
  };
}




