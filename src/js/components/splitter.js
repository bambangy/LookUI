// Splitter component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qsa, qs } from '../core/index.js';

/**
 * Enhance a splitter container with drag-to-resize panes.
 * @param {Element|string} el — .lk-splitter container
 * @param {Object} [opts]
 * @param {number[]} [opts.sizes]  — initial sizes as percentages [50, 50]
 * @param {number}   [opts.minSize] — minimum pane size in px (default 50)
 * @returns {Object}
 */
export function lkSplitter(el, opts = {}) {
  const node = resolveEl(el, 'lkSplitter');
  node.classList.add('lk-splitter');

  const panes   = qsa('.lk-splitter__pane', node);
  const handles = qsa('.lk-splitter__handle', node);
  const minSize = opts.minSize ?? 50;
  const isVert  = node.classList.contains('lk-splitter--vertical');

  // Apply initial sizes
  if (opts.sizes && opts.sizes.length === panes.length) {
    panes.forEach((pane, i) => {
      pane.style.flexBasis = opts.sizes[i] + '%';
      pane.style.flexGrow = '0';
      pane.style.flexShrink = '0';
    });
  }

  let dragging    = null;
  let startPos    = 0;
  let startSizes  = [];

  function onPointerDown(e) {
    const handleIdx = handles.indexOf(e.currentTarget);
    if (handleIdx < 0) return;

    dragging = handleIdx;
    startPos = isVert ? e.clientY : e.clientX;

    // Record current sizes in px
    startSizes = panes.map(p => isVert ? p.offsetHeight : p.offsetWidth);

    e.currentTarget.classList.add('lk-splitter__handle--active');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (dragging == null) return;

    const delta = (isVert ? e.clientY : e.clientX) - startPos;
    const paneA = panes[dragging];
    const paneB = panes[dragging + 1];
    if (!paneA || !paneB) return;

    const newA = Math.max(minSize, startSizes[dragging] + delta);
    const newB = Math.max(minSize, startSizes[dragging + 1] - delta);

    const total = startSizes[dragging] + startSizes[dragging + 1];
    const containerSize = isVert ? node.clientHeight : node.clientWidth;

    paneA.style.flexBasis = (newA / containerSize * 100) + '%';
    paneB.style.flexBasis = (newB / containerSize * 100) + '%';
  }

  function onPointerUp() {
    if (dragging != null) {
      handles[dragging].classList.remove('lk-splitter__handle--active');
    }
    dragging = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  handles.forEach(h => h.addEventListener('pointerdown', onPointerDown));

  const comp = {};
  applyBase(comp, node);

  Object.defineProperty(comp, 'sizes', {
    get() {
      const containerSize = isVert ? node.clientHeight : node.clientWidth;
      return panes.map(p => {
        const size = isVert ? p.offsetHeight : p.offsetWidth;
        return containerSize > 0 ? Math.round(size / containerSize * 100) : 0;
      });
    },
    set(arr) {
      if (arr && arr.length === panes.length) {
        panes.forEach((pane, i) => {
          pane.style.flexBasis = arr[i] + '%';
        });
      }
    },
    enumerable: true,
  });

  comp.destroy = function () {
    handles.forEach(h => h.removeEventListener('pointerdown', onPointerDown));
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    node.classList.remove('lk-splitter');
  };

  return comp;
}
