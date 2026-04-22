function resolveTarget(target) {
  if (!target) throw new Error('Look.lkShimmer: target is required.');
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`Look.lkShimmer: target not found - "${target}"`);
  return node;
}

/**
 * Apply an animated shimmer overlay on top of a target element.
 * @param {Element|string} target
 * @param {Object} [opts={}]
 * @returns {{ el: Element, show: Function, hide: Function, destroy: Function, isVisible: boolean }}
 */
export function lkShimmer(target, opts = {}) {
  const node = resolveTarget(target);
  const options = {
    backdrop: true,
    radius: 'var(--lk-radius)',
    lockPointer: true,
    open: true,
    ...opts,
  };

  const overlay = document.createElement('div');
  overlay.className = 'lk-shimmer-overlay';
  overlay.hidden = true;
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.borderRadius = options.radius;
  overlay.style.overflow = 'hidden';
  overlay.style.pointerEvents = options.lockPointer ? 'auto' : 'none';
  overlay.style.background = options.backdrop
    ? 'color-mix(in srgb, var(--lk-bg) 85%, transparent)'
    : 'transparent';

  const wave = document.createElement('div');
  wave.className = 'lk-shimmer-wave';
  wave.style.position = 'absolute';
  wave.style.inset = '0';
  wave.style.background =
    'linear-gradient(110deg, transparent 20%, color-mix(in srgb, var(--lk-surface) 65%, transparent) 45%, transparent 70%)';
  wave.style.backgroundSize = '250% 100%';

  overlay.appendChild(wave);

  let animation = null;
  let visible = false;
  let destroyed = false;
  const prevPosition = node.style.position;

  if (getComputedStyle(node).position === 'static') {
    node.style.position = 'relative';
  }

  node.appendChild(overlay);

  function startWave() {
    if (typeof wave.animate !== 'function' || animation) return;

    animation = wave.animate(
      [
        { backgroundPosition: '200% 0' },
        { backgroundPosition: '-50% 0' },
      ],
      {
        duration: 1250,
        iterations: Infinity,
        easing: 'linear',
      },
    );
  }

  function stopWave() {
    if (!animation) return;
    animation.cancel();
    animation = null;
  }

  function show() {
    if (destroyed || visible) return;
    overlay.hidden = false;
    visible = true;
    startWave();
  }

  function hide() {
    if (destroyed || !visible) return;
    overlay.hidden = true;
    visible = false;
    stopWave();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    hide();

    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    node.style.position = prevPosition;
  }

  if (options.open) {
    show();
  }

  return {
    el: overlay,
    show,
    hide,
    destroy,
    get isVisible() {
      return visible;
    },
  };
}
