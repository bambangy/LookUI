// Slider component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs } from '../core/index.js';

/**
 * Enhance a slider container with drag-to-set-value behavior.
 * @param {Element|string} el — .lk-slider container
 * @param {Object} [opts]
 * @param {number}  [opts.min]    — minimum value (default 0)
 * @param {number}  [opts.max]    — maximum value (default 100)
 * @param {number}  [opts.value]  — initial value (default min)
 * @param {number}  [opts.step]   — step increment (default 1)
 * @param {Function} [opts.onChange] — callback(value)
 * @returns {Object}
 */
export function lkSlider(el, opts = {}) {
  const node = resolveEl(el, 'lkSlider');
  node.classList.add('lk-slider');

  const track = qs('.lk-slider__track', node);
  const fill  = qs('.lk-slider__fill', node);
  const thumb = qs('.lk-slider__thumb', node);
  const label = qs('.lk-slider__label', node);

  let min   = opts.min ?? 0;
  let max   = opts.max ?? 100;
  let step  = opts.step ?? 1;
  let value = opts.value ?? min;
  let dragging = false;

  function clamp(v) {
    v = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, v));
  }

  function updateView() {
    const pct = ((value - min) / (max - min)) * 100;
    if (fill)  fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (label) label.textContent = value;
    node.setAttribute('aria-valuenow', value);
    node.setAttribute('aria-valuemin', min);
    node.setAttribute('aria-valuemax', max);
  }

  function setFromEvent(e) {
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    value = clamp(raw);
    updateView();
    if (opts.onChange) opts.onChange(value);
  }

  function onPointerDown(e) {
    dragging = true;
    setFromEvent(e);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (dragging) setFromEvent(e);
  }

  function onPointerUp() {
    dragging = false;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  if (track) track.addEventListener('pointerdown', onPointerDown);
  if (thumb) thumb.addEventListener('pointerdown', onPointerDown);

  node.setAttribute('role', 'slider');
  updateView();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    value: {
      get() { return value; },
      set(v) { value = clamp(v); updateView(); },
      enumerable: true,
    },
    min: {
      get() { return min; },
      set(v) { min = v; value = clamp(value); updateView(); },
      enumerable: true,
    },
    max: {
      get() { return max; },
      set(v) { max = v; value = clamp(value); updateView(); },
      enumerable: true,
    },
    step: {
      get() { return step; },
      set(v) { step = v; },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    if (track) track.removeEventListener('pointerdown', onPointerDown);
    if (thumb) thumb.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    node.removeAttribute('role');
    node.removeAttribute('aria-valuenow');
    node.removeAttribute('aria-valuemin');
    node.removeAttribute('aria-valuemax');
  };

  return comp;
}
