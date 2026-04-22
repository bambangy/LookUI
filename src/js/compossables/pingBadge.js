function resolveTarget(target) {
  if (!target) throw new Error('Look.lkPingBadge: target is required.');
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`Look.lkPingBadge: target not found - "${target}"`);
  return node;
}

const POSITION_MAP = {
  'top-right': { top: '-0.125rem', right: '-0.125rem' },
  'top-left': { top: '-0.125rem', left: '-0.125rem' },
  'bottom-right': { bottom: '-0.125rem', right: '-0.125rem' },
  'bottom-left': { bottom: '-0.125rem', left: '-0.125rem' },
};

/**
 * Attach an animated ping badge to a target element.
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

  const wrapper = document.createElement('span');
  wrapper.className = 'lk-ping-badge';
  wrapper.style.position = 'absolute';
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';

  const point = document.createElement('span');
  point.className = `lk-badge lk-badge--dot ${options.colorClass}`.trim();
  point.style.position = 'relative';

  const pulse = document.createElement('span');
  pulse.className = `lk-badge lk-badge--dot ${options.colorClass}`.trim();
  pulse.style.position = 'absolute';
  pulse.style.inset = '0';
  pulse.style.opacity = '0.6';

  const countEl = document.createElement('span');
  countEl.className = `lk-badge ${options.colorClass}`.trim();
  countEl.style.position = 'absolute';
  countEl.style.top = '-0.75rem';
  countEl.style.right = '-0.75rem';
  countEl.style.display = options.count == null ? 'none' : 'inline-flex';
  countEl.style.minWidth = '1rem';
  countEl.style.height = '1rem';
  countEl.style.padding = '0 var(--lk-space-1)';
  countEl.style.fontSize = '0.625rem';
  countEl.textContent = options.count == null ? '' : String(options.count);

  wrapper.appendChild(pulse);
  wrapper.appendChild(point);
  wrapper.appendChild(countEl);

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
        duration: 1200,
        iterations: Infinity,
        easing: 'ease-out',
      },
    );
  }

  function show() {
    if (destroyed || visible) return;
    wrapper.hidden = false;
    visible = true;
  }

  function hide() {
    if (destroyed || !visible) return;
    wrapper.hidden = true;
    visible = false;
  }

  function setCount(nextCount) {
    options.count = nextCount;

    if (nextCount == null) {
      countEl.style.display = 'none';
      countEl.textContent = '';
      return;
    }

    countEl.style.display = 'inline-flex';
    countEl.textContent = String(nextCount);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

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
