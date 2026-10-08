// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
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
 * @param {Function} [opts.onChange] — (value, { source, component, prev }) after a drag or key press
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
  let step  = opts.step > 0 ? opts.step : 1;
  let value = 0;
  let dragging = false;
  const hadTabindex = node.hasAttribute('tabindex');

  // Decimal places of the step, used to strip float noise (0.1 + 0.2 ...)
  function precision() {
    const s = String(step);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  // Snap to the step grid anchored at `min`, then clamp to [min, max]
  function clamp(v) {
    v = Number(v);
    if (!Number.isFinite(v)) v = min;
    v = min + Math.round((v - min) / step) * step;
    v = Number(v.toFixed(precision()));
    return Math.max(min, Math.min(max, v));
  }

  value = clamp(opts.value ?? min);

  function isDisabled() {
    return node.hasAttribute('disabled')
      || node.classList.contains('lk-disabled')
      || node.classList.contains('lk-slider--disabled');
  }

  function updateView() {
    const range = max - min;
    const pct = range > 0 ? ((value - min) / range) * 100 : 0;
    if (fill)  fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (label) label.textContent = value;
    node.setAttribute('aria-valuenow', value);
    node.setAttribute('aria-valuemin', min);
    node.setAttribute('aria-valuemax', max);
  }

  // source: 'pointer' | 'key'
  function commit(v, source) {
    const next = clamp(v);
    if (next === value) return;
    const prev = value;
    value = next;
    updateView();
    if (opts.onChange) opts.onChange(value, { source, component: comp, prev });
  }

  function setFromEvent(e) {
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    commit(min + ratio * (max - min), 'pointer');
  }

  // Thumb lives inside the track, so a single listener on the track
  // (or the thumb when it is outside) handles both without double-firing.
  function onPointerDown(e) {
    if (dragging || isDisabled()) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    node.classList.add('lk-slider--dragging');
    if (node.focus) node.focus({ preventScroll: true });
    setFromEvent(e);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (dragging) setFromEvent(e);
  }

  function onPointerUp() {
    dragging = false;
    node.classList.remove('lk-slider--dragging');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  function onKeyDown(e) {
    if (isDisabled()) return;
    const big = Math.max(step, (max - min) / 10);
    let next = null;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp':   next = value + step; break;
      case 'ArrowLeft':  case 'ArrowDown': next = value - step; break;
      case 'PageUp':   next = value + big; break;
      case 'PageDown': next = value - big; break;
      case 'Home': next = min; break;
      case 'End':  next = max; break;
      default: return;
    }
    e.preventDefault();
    commit(next, 'key');
  }

  const thumbOutsideTrack = thumb && (!track || !track.contains(thumb));
  if (track) track.addEventListener('pointerdown', onPointerDown);
  if (thumbOutsideTrack) thumb.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('keydown', onKeyDown);

  node.setAttribute('role', 'slider');
  if (!hadTabindex) node.setAttribute('tabindex', '0');
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
      set(v) { min = Number(v); value = clamp(value); updateView(); },
      enumerable: true,
    },
    max: {
      get() { return max; },
      set(v) { max = Number(v); value = clamp(value); updateView(); },
      enumerable: true,
    },
    step: {
      get() { return step; },
      set(v) { step = v > 0 ? Number(v) : 1; value = clamp(value); updateView(); },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    onPointerUp();
    if (track) track.removeEventListener('pointerdown', onPointerDown);
    if (thumbOutsideTrack) thumb.removeEventListener('pointerdown', onPointerDown);
    node.removeEventListener('keydown', onKeyDown);
    node.classList.remove('lk-slider', 'lk-slider--dragging');
    node.removeAttribute('role');
    if (!hadTabindex) node.removeAttribute('tabindex');
    node.removeAttribute('aria-valuenow');
    node.removeAttribute('aria-valuemin');
    node.removeAttribute('aria-valuemax');
  };

  return comp;
}
