// Carousel component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs, qsa } from '../core/index.js';

/**
 * Enhance a carousel container with slide navigation.
 * @param {Element|string} el — .lk-carousel container
 * @param {Object} [opts]
 * @param {boolean} [opts.autoplay]   — auto-advance slides
 * @param {number}  [opts.interval]   — autoplay interval in ms (default 5000)
 * @param {boolean} [opts.loop]       — loop back to start (default true)
 * @returns {Object}
 */
export function lkCarousel(el, opts = {}) {
  const node = resolveEl(el, 'lkCarousel');
  node.classList.add('lk-carousel');

  const track    = qs('.lk-carousel__track', node);
  const slides   = qsa('.lk-carousel__slide', node);
  const prevBtn  = qs('.lk-carousel__prev', node);
  const nextBtn  = qs('.lk-carousel__next', node);
  const dots     = qsa('.lk-carousel__dot', node);

  const loop     = opts.loop !== false;
  const interval = opts.interval || 5000;
  let current    = 0;
  let timer      = null;

  function updateView() {
    if (track) track.style.transform = `translateX(-${current * 100}%)`;

    // Update dot indicators
    dots.forEach((dot, i) => {
      dot.classList.toggle('lk-carousel__dot--active', i === current);
    });
  }

  function goTo(index) {
    if (index < 0) index = loop ? slides.length - 1 : 0;
    if (index >= slides.length) index = loop ? 0 : slides.length - 1;
    current = index;
    updateView();
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function onPrev() { prev(); resetAutoplay(); }
  function onNext() { next(); resetAutoplay(); }
  function onDot(e) {
    const idx = dots.indexOf(e.currentTarget);
    if (idx >= 0) { goTo(idx); resetAutoplay(); }
  }

  // Autoplay
  function startAutoplay() {
    if (opts.autoplay && !timer) {
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

  // Bind events
  if (prevBtn) prevBtn.addEventListener('click', onPrev);
  if (nextBtn) nextBtn.addEventListener('click', onNext);
  dots.forEach(dot => dot.addEventListener('click', onDot));

  updateView();
  startAutoplay();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperty(comp, 'activeIndex', {
    get() { return current; },
    set(v) { goTo(v); },
    enumerable: true,
  });

  comp.next = next;
  comp.prev = prev;
  comp.goTo = goTo;

  comp.destroy = function () {
    stopAutoplay();
    if (prevBtn) prevBtn.removeEventListener('click', onPrev);
    if (nextBtn) nextBtn.removeEventListener('click', onNext);
    dots.forEach(dot => dot.removeEventListener('click', onDot));
  };

  return comp;
}
