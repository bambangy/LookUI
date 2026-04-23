import { createPresenceController } from '../helpers/motion.js';

function resolveTarget(target) {
  if (!target) throw new Error('Look.lkPingBadge: target is required.');
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`Look.lkPingBadge: target not found - "${target}"`);
  return node;
}

const POSITION_MAP = {
  'top-right': { top: '-0.375rem', right: '-0.375rem' },
  'top-left': { top: '-0.375rem', left: '-0.375rem' },
  'bottom-right': { bottom: '-0.375rem', right: '-0.375rem' },
  'bottom-left': { bottom: '-0.375rem', left: '-0.375rem' },
};

const EXIT_MS = 280;

/**
 * Attach an animated ping badge to a target element.
 * Counter is displayed inside the badge dot itself.
 * @param {Element|string} target
 * @param {Object} [opts={}]
 * @returns {{ el: Element, show: Function, hide: Function, setCount: Function, destroy: Function, isVisible: boolean }}
 */
export function lkPingBadge(target, opts = {}) {
  const node = resolveTarget(target);
  const options = {
    position: 'top-right',
    colorClass: 'lk-badge--negative',
    pulse: true,
    count: null,
    open: true,
    ...opts,
  };

  // Wrapper holds badge + pulse ring
  const wrapper = document.createElement('span');
  wrapper.className = 'lk-ping-badge';
  wrapper.hidden = true;
  wrapper.style.position = 'absolute';
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';

  // The badge - shows as dot when no count, expands to pill with number when count is set
  const badge = document.createElement('span');
  badge.className = `lk-badge lk-badge--dot ${options.colorClass}`.trim();
  badge.style.position = 'relative';
  badge.style.zIndex = '1';
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.textAlign = 'center';
  badge.style.fontWeight = '600';
  badge.style.color = '#fff';
  badge.style.transition = 'min-width 0.15s, padding 0.15s';

  // Pulse layer (animates behind the badge)
  const pulse = document.createElement('span');
  pulse.className = `lk-badge ${options.colorClass}`.trim();
  pulse.style.position = 'absolute';
  pulse.style.inset = '0';
  pulse.style.width = '100%';
  pulse.style.height = '100%';
  pulse.style.padding = '0';
  pulse.style.opacity = '0.6';
  pulse.style.zIndex = '0';

  updateBadge(options.count);

  wrapper.appendChild(pulse);
  wrapper.appendChild(badge);

  const pos = POSITION_MAP[options.position] || POSITION_MAP['top-right'];
  Object.assign(wrapper.style, pos);

  let visible = false;
  let destroyed = false;
  let animation = null;
  const prevPosition = node.style.position;

  if (getComputedStyle(node).position === 'static') {
    node.style.position = 'relative';
  }

  node.appendChild(wrapper);

  if (options.pulse && typeof pulse.animate === 'function') {
    animation = pulse.animate(
      [
        { transform: 'scale(1)', opacity: 0.6 },
        { transform: 'scale(1.8)', opacity: 0 },
      ],
      {
        duration: 1500,
        iterations: Infinity,
        easing: 'ease-out',
      },
    );
  }

  const presence = createPresenceController({
    element: wrapper,
    visibleClass: 'lk-ping-badge--open',
    closingClass: '',
    exitMs: EXIT_MS,
    hideWithHiddenAttr: true,
  });

  function applyShape(targetEl, shape) {
    targetEl.style.minWidth = shape.minWidth;
    targetEl.style.height = shape.height;
    targetEl.style.padding = shape.padding;
    targetEl.style.borderRadius = shape.borderRadius;
  }

  function updateBadge(count) {
    if (count == null || count === 0) {
      // Dot mode - pulse must exactly match the visible dot shape.
      const dotShape = {
        minWidth: '',
        height: '',
        padding: '',
        borderRadius: '',
      };

      badge.textContent = '';
      badge.style.fontSize = '';
      badge.style.lineHeight = '';
      applyShape(badge, dotShape);
      applyShape(pulse, dotShape);
      return;
    }

    // Counter mode - badge and pulse should share the same pill geometry.
    const counterShape = {
      minWidth: '1.125rem',
      height: '1.125rem',
      padding: '0 0.25rem',
      borderRadius: '9999px',
    };

    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.fontSize = '0.625rem';
    badge.style.lineHeight = '1.125rem';
    applyShape(badge, counterShape);
    applyShape(pulse, counterShape);
  }

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

  function setCount(nextCount) {
    options.count = nextCount;
    updateBadge(nextCount);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    presence.destroy();

    if (animation) {
      animation.cancel();
      animation = null;
    }

    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }

    node.style.position = prevPosition;
  }

  if (options.open) {
    show();
  } else {
    hide();
  }

  return {
    el: wrapper,
    show,
    hide,
    setCount,
    destroy,
    get isVisible() {
      return visible;
    },
  };
}


