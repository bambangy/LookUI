// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Carousel component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs, qsa } from '../core/index.js';
import { renderContent } from '../helpers/content.js';

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

function make(tag, cls, attrs = {}) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// Slide spec: an object with url / html / content / template (see helpers/content.js),
// or anything else, used as `content` (text, Node, function).
function toSpec(item) {
  if (item != null && typeof item === 'object' && !(item instanceof Node)) return item;
  return { content: item };
}

// Markup slides opt into async content with data-url (+ data-select)
function specFromSlide(slide) {
  const url = slide.dataset.url;
  return url ? { url, select: slide.dataset.select || undefined } : null;
}

/**
 * Enhance a carousel container with slide navigation.
 *
 * With `loop` (default) the carousel wraps seamlessly: clones of the first and
 * last slides sit at the track ends, so last → first keeps sliding forward
 * instead of rewinding across every slide.
 *
 * Slides come from the markup (`.lk-carousel__track > .lk-carousel__slide`, a slide with
 * `data-url` loads its HTML) or from `opts.slides` — an array of content specs, or a function /
 * Promise resolving to one. Content from a URL is loaded lazily around the active slide.
 *
 * @param {Element|string} el — .lk-carousel container
 * @param {Object} [opts]
 * @param {boolean} [opts.autoplay]          — auto-advance slides
 * @param {number}  [opts.interval]          — autoplay interval in ms (default 5000)
 * @param {boolean} [opts.loop]              — loop back to start (default true)
 * @param {boolean} [opts.swipe]             — pointer/touch swipe (default true)
 * @param {boolean} [opts.keyboard]          — ←/→ keys when focus is inside (default true)
 * @param {boolean} [opts.pauseOnHover]      — pause autoplay on hover/focus (default true)
 * @param {Array|Function|Promise} [opts.slides] — slide specs ({ url | html | content | template, className, label })
 * @param {boolean} [opts.lazy]              — load slide content only near the active slide (default true)
 * @param {number}  [opts.preload]           — neighbours loaded on each side when lazy (default 1)
 * @param {boolean} [opts.arrows]            — build prev/next buttons when missing (default true with `slides`)
 * @param {boolean} [opts.indicators]        — build dots when missing (default true with `slides`)
 * @param {string}  [opts.loadingText]       — text beside the spinner while content loads
 * @param {Function} [opts.onChange]         — (index, { source, component, prev, slide }) after the active slide changes
 * @param {Function} [opts.onLoad]           — (slideEl, { index, component }) after a slide's content is in place
 * @param {Function} [opts.onError]          — (error, { slide, index, component }) when a slide (or the slide list: slide null, index -1) fails to load
 * @returns {Object}
 */
export function lkCarousel(el, opts = {}) {
  const node = resolveEl(el, 'lkCarousel');
  const addedRootClass = !node.classList.contains('lk-carousel');
  node.classList.add('lk-carousel');

  const fromOptions  = opts.slides != null;
  const loop         = opts.loop !== false;
  const interval     = opts.interval || 5000;
  const swipe        = opts.swipe !== false;
  const keyboard     = opts.keyboard !== false;
  const pauseOnHover = opts.pauseOnHover !== false;
  const lazy         = opts.lazy !== false;
  const preload      = Number.isFinite(opts.preload) ? Math.max(0, opts.preload) : 1;

  // Nodes this instance created (removed again on destroy)
  const built = [];

  let track = qs('.lk-carousel__track', node);
  if (!track) {
    track = make('div', 'lk-carousel__track');
    node.prepend(track);
    built.push(track);
  }
  let prevBtn = qs('.lk-carousel__prev', node);
  let nextBtn = qs('.lk-carousel__next', node);
  if (fromOptions && opts.arrows !== false) {
    const arrow = (cls, label, icon) => {
      const b = make('button', `${cls} lk-btn lk-btn--ghost`, { type: 'button', 'aria-label': label });
      b.innerHTML = `<span class="lk-icon lk-icon--${icon}" aria-hidden="true"></span>`;
      node.appendChild(b);
      built.push(b);
      return b;
    };
    if (!prevBtn) prevBtn = arrow('lk-carousel__prev', 'Previous slide', 'chevron-left');
    if (!nextBtn) nextBtn = arrow('lk-carousel__next', 'Next slide', 'chevron-right');
  }
  let indicators = qs('.lk-carousel__indicators', node);
  if (!indicators && fromOptions && opts.indicators !== false) {
    indicators = make('div', 'lk-carousel__indicators');
    node.appendChild(indicators);
    built.push(indicators);
  }

  let slides  = [];
  let specs   = [];         // per slide: content spec or null (static markup)
  let dots    = [];
  let clones  = [];
  let count   = 0;
  let useClones = false;
  let offset  = 0;
  let ownSlides = false;    // slides were created from options (removed on destroy / replace)
  const loaded = new Map(); // slide -> renderContent handle

  let current  = 0;         // logical index 0..count-1
  let position = 0;         // track index (includes the leading clone when looping)
  let timer    = null;
  let paused   = false;
  let settleTimer = null;
  let destroyed = false;
  let listToken = 0;

  // --- Slides ---------------------------------------------------------------------

  function makeClone(slide) {
    const clone = slide.cloneNode(true);
    clone.classList.add('lk-carousel__slide--clone');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    clone.removeAttribute('id');
    return clone;
  }

  function removeClones() {
    clones.forEach((c) => c.remove());
    clones = [];
  }

  function addClones() {
    removeClones();
    useClones = loop && count > 1;
    offset = useClones ? 1 : 0;
    if (!useClones) return;
    clones = [makeClone(slides[count - 1]), makeClone(slides[0])];
    track.insertBefore(clones[0], track.firstChild);
    track.appendChild(clones[1]);
  }

  // A clone mirrors its slide; refresh it once that slide's content arrives
  function refreshClone(index) {
    if (!useClones) return;
    if (index === count - 1) { const c = makeClone(slides[index]); clones[0].replaceWith(c); clones[0] = c; }
    if (index === 0) { const c = makeClone(slides[0]); clones[1].replaceWith(c); clones[1] = c; }
  }

  function buildDots() {
    // Markup dots are kept as long as they match the markup slides
    const existing = qsa('.lk-carousel__dot', node);
    if (!ownSlides && existing.length === count) { dots = existing; return; }
    if (!indicators) { dots = []; return; }
    indicators.replaceChildren();
    dots = slides.map((_, i) => {
      const d = make('button', 'lk-carousel__dot', { type: 'button', 'aria-label': specs[i]?.label || `Slide ${i + 1}` });
      indicators.appendChild(d);
      return d;
    });
  }

  function load(i) {
    const slide = slides[i];
    const spec = specs[i];
    if (!slide || !spec || loaded.has(slide)) return;
    const handle = renderContent(slide, spec, {
      ctx: { index: i, carousel: comp },
      loadingText: opts.loadingText,
      onLoad: () => { refreshClone(slides.indexOf(slide)); opts.onLoad?.(slide, { index: slides.indexOf(slide), component: comp }); },
      onError: (err) => { refreshClone(slides.indexOf(slide)); opts.onError?.(err, { slide, index: slides.indexOf(slide), component: comp }); },
    });
    loaded.set(slide, handle);
  }

  function loadAround(index) {
    if (!count) return;
    if (!lazy) { slides.forEach((_, i) => load(i)); return; }
    for (let d = -preload; d <= preload; d++) {
      let i = index + d;
      if (loop) i = ((i % count) + count) % count;
      if (i >= 0 && i < count) load(i);
    }
  }

  function clearSlides() {
    loaded.forEach((h) => h.destroy());
    loaded.clear();
    removeClones();
    if (ownSlides) slides.forEach((s) => s.remove());
    track.querySelectorAll(':scope > .lk-carousel__slide--status').forEach((s) => s.remove());
  }

  function mount(nextSlides, nextSpecs, index) {
    slides = nextSlides;
    specs = nextSpecs;
    count = slides.length;
    slides.forEach((s, i) => {
      if (!ownSlides) return;
      s.setAttribute('role', 'group');
      s.setAttribute('aria-roledescription', 'slide');
      s.setAttribute('aria-label', specs[i]?.label || `${i + 1} of ${count}`);
    });
    addClones();
    buildDots();
    current = Math.min(Math.max(Math.trunc(Number(index) || 0), 0), Math.max(count - 1, 0));
    position = current + offset;
    setTrack(position, true);
    updateIndicators();
    loadAround(current);
  }

  function slidesFromList(list) {
    clearSlides();
    ownSlides = true;
    const els = [];
    const sp = (list || []).map(toSpec);
    sp.forEach((spec) => {
      const s = make('div', `lk-carousel__slide${spec.className ? ` ${spec.className}` : ''}`);
      track.appendChild(s);
      els.push(s);
    });
    return { els, sp };
  }

  function showListStatus(error) {
    clearSlides();
    slides = []; specs = []; count = 0;
    buildDots();
    const s = make('div', 'lk-carousel__slide lk-carousel__slide--status');
    const status = make('div', `lk-async__status lk-async__status--${error ? 'error' : 'loading'}`);
    if (error) {
      status.setAttribute('role', 'alert');
      status.innerHTML = '<span class="lk-icon lk-icon--alert-triangle" aria-hidden="true"></span><span></span>';
      status.lastChild.textContent = error.message || 'Could not load the slides.';
    } else {
      status.innerHTML = '<span class="lk-spinner lk-spinner--sm" aria-hidden="true"></span><span></span>';
      status.lastChild.textContent = opts.loadingText ?? 'Loading…';
    }
    s.appendChild(status);
    track.appendChild(s);
    setTrack(0, true);
    updateIndicators();
  }

  /**
   * Replace every slide. `list` = array of specs, or a function / Promise resolving to one.
   * @returns {Promise<void>}
   */
  async function setSlides(list, index = 0) {
    const my = ++listToken;
    stopAutoplay();
    let value = typeof list === 'function' ? list() : list;
    if (value && typeof value.then === 'function') {
      showListStatus(null);
      try {
        value = await value;
      } catch (err) {
        if (my === listToken && !destroyed) { showListStatus(err); opts.onError?.(err, { slide: null, index: -1, component: comp }); }
        return;
      }
      if (my !== listToken || destroyed) return;
    }
    const { els, sp } = slidesFromList(Array.isArray(value) ? value : []);
    mount(els, sp, index);
    startAutoplay();
  }

  // --- Rendering ---------------------------------------------------------------

  function setTrack(pos, instant) {
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
    if (!loop || count < 2) {
      if (prevBtn) prevBtn.disabled = current <= 0;
      if (nextBtn) nextBtn.disabled = current >= count - 1;
    }
  }

  function transitionMs() {
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

  // Who moved the carousel, reported as onChange ctx.source; public methods report 'api'
  let changeSource = 'api';
  function via(source, fn) {
    changeSource = source;
    try { fn(); } finally { changeSource = 'api'; }
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
    loadAround(current);

    if (useClones && position !== current + offset) {
      // transitionend can be skipped (hidden tab, reduced motion) — back it up.
      settleTimer = setTimeout(settle, transitionMs() + 50);
    }

    if (prevIndex !== current && typeof opts.onChange === 'function') {
      opts.onChange(current, { source: changeSource, component: comp, prev: prevIndex, slide: slides[current] });
    }
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

  /** Load a slide's content again (URL / function slides). */
  function reload(index = current) {
    const slide = slides[index];
    if (!slide || !specs[index]) return Promise.resolve(false);
    loaded.get(slide)?.destroy();
    loaded.delete(slide);
    load(index);
    return loaded.get(slide).promise;
  }

  // --- Autoplay ------------------------------------------------------------------

  function startAutoplay() {
    if (opts.autoplay && !timer && !paused && count > 1 && !destroyed) {
      timer = setInterval(() => via('autoplay', next), interval);
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

  function onPrev(source) { via(source, prev); resetAutoplay(); }
  function onNext(source) { via(source, next); resetAutoplay(); }
  const onPrevClick = () => onPrev('arrow');
  const onNextClick = () => onNext('arrow');
  function onDot(e) {
    const dot = e.target.closest?.('.lk-carousel__dot');
    const idx = dot ? dots.indexOf(dot) : -1;
    if (idx >= 0) { via('dot', () => goTo(idx)); resetAutoplay(); }
  }

  function onKeydown(e) {
    if (!keyboard || e.defaultPrevented) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev('key'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onNext('key'); }
  }

  // --- Swipe / drag ----------------------------------------------------------------

  let drag = null;
  let suppressClick = false;

  function onPointerDown(e) {
    if (!swipe || count < 2) return;
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
    if (commit && dx < 0 && (loop || current < count - 1)) via('swipe', next);
    else if (commit && dx > 0 && (loop || current > 0)) via('swipe', prev);
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

  if (prevBtn) prevBtn.addEventListener('click', onPrevClick);
  if (nextBtn) nextBtn.addEventListener('click', onNextClick);
  node.addEventListener('click', onDot);
  node.addEventListener('keydown', onKeydown);
  node.addEventListener('mouseenter', onMouseEnter);
  node.addEventListener('mouseleave', onMouseLeave);
  node.addEventListener('focusin', onFocusIn);
  node.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onVisibility);
  track.addEventListener('transitionend', onTransitionEnd);
  track.addEventListener('pointerdown', onPointerDown);
  track.addEventListener('pointermove', onPointerMove);
  track.addEventListener('pointerup', onPointerUp);
  track.addEventListener('pointercancel', onPointerUp);
  track.addEventListener('click', onClickCapture, true);

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

  Object.defineProperty(comp, 'slides', {
    get() { return slides.slice(); },
    enumerable: true,
  });

  comp.next   = next;
  comp.prev   = prev;
  comp.goTo   = goTo;
  comp.pause  = pause;
  comp.resume = resume;
  comp.reload = reload;
  comp.setSlides = setSlides;
  comp.ready = Promise.resolve();

  if (fromOptions) {
    comp.ready = setSlides(opts.slides, opts.index);
  } else {
    const markup = qsa(':scope > .lk-carousel__slide', track);
    mount(markup, markup.map(specFromSlide), opts.index);
    startAutoplay();
  }

  comp.destroy = function () {
    destroyed = true;
    listToken += 1;
    stopAutoplay();
    clearTimeout(settleTimer);
    if (prevBtn) {
      prevBtn.removeEventListener('click', onPrevClick);
      prevBtn.disabled = false;
    }
    if (nextBtn) {
      nextBtn.removeEventListener('click', onNextClick);
      nextBtn.disabled = false;
    }
    node.removeEventListener('click', onDot);
    dots.forEach((dot) => {
      dot.classList.remove('lk-carousel__dot--active');
      dot.removeAttribute('aria-current');
    });
    if (ownSlides && indicators) indicators.replaceChildren();
    clearSlides();
    slides.forEach((slide) => slide.removeAttribute('aria-hidden'));
    node.removeEventListener('keydown', onKeydown);
    node.removeEventListener('mouseenter', onMouseEnter);
    node.removeEventListener('mouseleave', onMouseLeave);
    node.removeEventListener('focusin', onFocusIn);
    node.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('visibilitychange', onVisibility);
    track.removeEventListener('transitionend', onTransitionEnd);
    track.removeEventListener('pointerdown', onPointerDown);
    track.removeEventListener('pointermove', onPointerMove);
    track.removeEventListener('pointerup', onPointerUp);
    track.removeEventListener('pointercancel', onPointerUp);
    track.removeEventListener('click', onClickCapture, true);
    track.classList.remove('lk-carousel__track--instant');
    track.style.transform = '';
    built.forEach((n) => n.remove());
    node.classList.remove('lk-carousel--dragging');
    if (addedRootClass) node.classList.remove('lk-carousel');
  };

  return comp;
}
