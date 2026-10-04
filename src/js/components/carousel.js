// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Carousel component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs, qsa } from '../core/index.js';

const SWIPE_RATIO    = 0.18; // fraction of width that commits a swipe
const SWIPE_VELOCITY = 0.4;  // px/ms flick that commits a swipe regardless of distance
const DRAG_SLOP      = 6;    // px before a pointer press counts as a drag

function parseDurationMs(value) {
  const first = String(value || '').split(',')[0].trim();
  if (!first) return 0;
  const n = parseFloat(first);
  if (!Number.isFinite(n)) return 0;
  return first.endsWith('ms') ? n : n * 1000;
}

/**
 * Enhance a carousel container with slide navigation.
 *
 * With `loop` (default) the carousel wraps seamlessly: clones of the first and
 * last slides sit at the track ends, so last → first keeps sliding forward
 * instead of rewinding across every slide.
 *
 * @param {Element|string} el — .lk-carousel container
 * @param {Object} [opts]
 * @param {boolean} [opts.autoplay]          — auto-advance slides
 * @param {number}  [opts.interval]          — autoplay interval in ms (default 5000)
 * @param {boolean} [opts.loop]              — loop back to start (default true)
 * @param {boolean} [opts.swipe]             — pointer/touch swipe (default true)
 * @param {boolean} [opts.keyboard]          — ←/→ keys when focus is inside (default true)
 * @param {boolean} [opts.pauseOnHover]      — pause autoplay on hover/focus (default true)
 * @param {Function} [opts.onChange]         — (index) => void after the active slide changes
 * @returns {Object}
 */
export function lkCarousel(el, opts = {}) {
  const node = resolveEl(el, 'lkCarousel');
  const addedRootClass = !node.classList.contains('lk-carousel');
  node.classList.add('lk-carousel');

  const track    = qs('.lk-carousel__track', node);
  const slides   = track ? qsa(':scope > .lk-carousel__slide', track) : qsa('.lk-carousel__slide', node);
  const prevBtn  = qs('.lk-carousel__prev', node);
  const nextBtn  = qs('.lk-carousel__next', node);
  const dots     = qsa('.lk-carousel__dot', node);

  const count        = slides.length;
  const loop         = opts.loop !== false;
  const interval     = opts.interval || 5000;
  const swipe        = opts.swipe !== false;
  const keyboard     = opts.keyboard !== false;
  const pauseOnHover = opts.pauseOnHover !== false;

  let current  = 0;         // logical index 0..count-1
  let position = 0;         // track index (includes the leading clone when looping)
  let timer    = null;
  let paused   = false;
  let settleTimer = null;
  let destroyed = false;

  // --- Seamless loop clones ---------------------------------------------------

  const clones = [];
  const useClones = loop && count > 1 && !!track;
  if (useClones) {
    const makeClone = (slide) => {
      const clone = slide.cloneNode(true);
      clone.classList.add('lk-carousel__slide--clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('inert', '');
      clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      clone.removeAttribute('id');
      clones.push(clone);
      return clone;
    };
    track.insertBefore(makeClone(slides[count - 1]), track.firstChild);
    track.appendChild(makeClone(slides[0]));
  }
  const offset = useClones ? 1 : 0;

  // --- Rendering ---------------------------------------------------------------

  function setTrack(pos, instant) {
    if (!track) return;
    if (instant) track.classList.add('lk-carousel__track--instant');
    track.style.transform = `translate3d(${-pos * 100}%, 0, 0)`;
    if (instant) {
      void track.offsetWidth; // commit the jump before transitions come back
      track.classList.remove('lk-carousel__track--instant');
    }
  }

  function updateIndicators() {
    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle('lk-carousel__dot--active', active);
      if (active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    slides.forEach((slide, i) => {
      if (i === current) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });
    if (!loop) {
      if (prevBtn) prevBtn.disabled = current <= 0;
      if (nextBtn) nextBtn.disabled = current >= count - 1;
    }
  }

  function transitionMs() {
    if (!track) return 0;
    return parseDurationMs(getComputedStyle(track).transitionDuration);
  }

  // After sliding onto a clone, silently jump to the real slide it mirrors.
  function settle() {
    clearTimeout(settleTimer);
    settleTimer = null;
    if (!useClones) return;
    const real = current + offset;
    if (position !== real) {
      position = real;
      setTrack(position, true);
    }
  }

  function onTransitionEnd(e) {
    if (e.target === track && e.propertyName === 'transform') settle();
  }

  function moveTo(pos, logical) {
    if (!count) return;
    // Finish any pending clone jump first so rapid clicks never drift.
    if (settleTimer) settle();

    const prevIndex = current;
    current  = logical;
    position = pos;
    setTrack(position, false);
    updateIndicators();

    if (useClones && position !== current + offset) {
      // transitionend can be skipped (hidden tab, reduced motion) — back it up.
      settleTimer = setTimeout(settle, transitionMs() + 50);
    }

    if (prevIndex !== current && typeof opts.onChange === 'function') opts.onChange(current);
  }

  function goTo(index) {
    if (!count) return;
    let i = Math.trunc(Number(index) || 0);
    if (loop) i = ((i % count) + count) % count;
    else i = Math.min(Math.max(i, 0), count - 1);
    moveTo(i + offset, i);
  }

  function next() {
    if (!count) return;
    if (current < count - 1) moveTo(current + 1 + offset, current + 1);
    else if (useClones) moveTo(count + offset, 0); // slide forward onto the first-slide clone
    else if (loop) moveTo(0, 0);
  }

  function prev() {
    if (!count) return;
    if (current > 0) moveTo(current - 1 + offset, current - 1);
    else if (useClones) moveTo(0, count - 1); // slide back onto the last-slide clone
    else if (loop) moveTo(count - 1, count - 1);
  }

  // --- Autoplay ------------------------------------------------------------------

  function startAutoplay() {
    if (opts.autoplay && !timer && !paused && count > 1 && !destroyed) {
      timer = setInterval(next, interval);
    }
  }

  function stopAutoplay() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function resetAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  function pause()  { paused = true;  stopAutoplay(); }
  function resume() { paused = false; startAutoplay(); }

  function onMouseEnter() { if (pauseOnHover) pause(); }
  function onMouseLeave() { if (pauseOnHover && !node.contains(document.activeElement)) resume(); }
  function onFocusIn()    { if (pauseOnHover) pause(); }
  function onFocusOut(e)  {
    if (pauseOnHover && !node.contains(e.relatedTarget) && !node.matches(':hover')) resume();
  }
  function onVisibility() {
    if (document.hidden) stopAutoplay();
    else startAutoplay();
  }

  // --- Controls ------------------------------------------------------------------

  function onPrev() { prev(); resetAutoplay(); }
  function onNext() { next(); resetAutoplay(); }
  function onDot(e) {
    const idx = dots.indexOf(e.currentTarget);
    if (idx >= 0) { goTo(idx); resetAutoplay(); }
  }

  function onKeydown(e) {
    if (!keyboard || e.defaultPrevented) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
  }

  // --- Swipe / drag ----------------------------------------------------------------

  let drag = null;
  let suppressClick = false;

  function onPointerDown(e) {
    if (!swipe || count < 2 || !track) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, a[href], input, select, textarea, [contenteditable]')
      && !e.target.closest('.lk-carousel__slide')) return;
    if (settleTimer) settle();
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      dx: 0,
      width: node.clientWidth || 1,
      active: false,
    };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (!drag.active) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // vertical scroll wins
      drag.active = true;
      node.classList.add('lk-carousel--dragging');
      track.setPointerCapture?.(e.pointerId);
      stopAutoplay();
    }

    // Resist past the ends when not looping
    let delta = dx;
    if (!loop && ((current === 0 && dx > 0) || (current === count - 1 && dx < 0))) delta = dx / 3;
    drag.dx = dx;
    const pct = (-position * 100) + (delta / drag.width) * 100;
    track.style.transform = `translate3d(${pct}%, 0, 0)`;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { active, dx, width, t } = drag;
    drag = null;
    if (!active) return;

    node.classList.remove('lk-carousel--dragging');
    track.releasePointerCapture?.(e.pointerId);
    suppressClick = true;

    const velocity = Math.abs(dx) / Math.max(1, performance.now() - t);
    const commit = Math.abs(dx) > width * SWIPE_RATIO || velocity > SWIPE_VELOCITY;
    if (commit && dx < 0 && (loop || current < count - 1)) next();
    else if (commit && dx > 0 && (loop || current > 0)) prev();
    else setTrack(position, false); // snap back

    if (!(pauseOnHover && node.matches(':hover'))) resetAutoplay();
  }

  // A drag must not also click a link/button inside the slide
  function onClickCapture(e) {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // --- Bind ----------------------------------------------------------------------

  if (prevBtn) prevBtn.addEventListener('click', onPrev);
  if (nextBtn) nextBtn.addEventListener('click', onNext);
  dots.forEach((dot) => dot.addEventListener('click', onDot));
  node.addEventListener('keydown', onKeydown);
  node.addEventListener('mouseenter', onMouseEnter);
  node.addEventListener('mouseleave', onMouseLeave);
  node.addEventListener('focusin', onFocusIn);
  node.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onVisibility);
  if (track) {
    track.addEventListener('transitionend', onTransitionEnd);
    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);
    track.addEventListener('click', onClickCapture, true);
  }

  const startIndex = Math.min(Math.max(Math.trunc(Number(opts.index) || 0), 0), Math.max(count - 1, 0));
  current  = startIndex;
  position = startIndex + offset;
  setTrack(position, true);
  updateIndicators();
  startAutoplay();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperty(comp, 'activeIndex', {
    get() { return current; },
    set(v) { goTo(v); },
    enumerable: true,
  });

  Object.defineProperty(comp, 'count', {
    get() { return count; },
    enumerable: true,
  });

  comp.next   = next;
  comp.prev   = prev;
  comp.goTo   = goTo;
  comp.pause  = pause;
  comp.resume = resume;

  comp.destroy = function () {
    destroyed = true;
    stopAutoplay();
    clearTimeout(settleTimer);
    if (prevBtn) {
      prevBtn.removeEventListener('click', onPrev);
      if (!loop) prevBtn.disabled = false;
    }
    if (nextBtn) {
      nextBtn.removeEventListener('click', onNext);
      if (!loop) nextBtn.disabled = false;
    }
    dots.forEach((dot) => {
      dot.removeEventListener('click', onDot);
      dot.classList.remove('lk-carousel__dot--active');
      dot.removeAttribute('aria-current');
    });
    slides.forEach((slide) => slide.removeAttribute('aria-hidden'));
    node.removeEventListener('keydown', onKeydown);
    node.removeEventListener('mouseenter', onMouseEnter);
    node.removeEventListener('mouseleave', onMouseLeave);
    node.removeEventListener('focusin', onFocusIn);
    node.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('visibilitychange', onVisibility);
    if (track) {
      track.removeEventListener('transitionend', onTransitionEnd);
      track.removeEventListener('pointerdown', onPointerDown);
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', onPointerUp);
      track.removeEventListener('pointercancel', onPointerUp);
      track.removeEventListener('click', onClickCapture, true);
      track.classList.remove('lk-carousel__track--instant');
      track.style.transform = '';
    }
    clones.forEach((clone) => clone.remove());
    node.classList.remove('lk-carousel--dragging');
    if (addedRootClass) node.classList.remove('lk-carousel');
  };

  return comp;
}
