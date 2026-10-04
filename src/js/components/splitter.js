// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Splitter component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qsa } from '../core/index.js';

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

  // Only direct children belong to this splitter (nested splitters are allowed)
  const panes   = qsa('.lk-splitter__pane', node).filter(p => p.parentElement === node);
  const handles = qsa('.lk-splitter__handle', node).filter(h => h.parentElement === node);
  const minSize = opts.minSize ?? 50;
  const isVert  = node.classList.contains('lk-splitter--vertical');

  // flex-shrink stays 1 so percentages + handle sizes always fit the container
  function setBasis(pane, pct) {
    pane.style.flexBasis = pct + '%';
    pane.style.flexGrow = '0';
    pane.style.flexShrink = '1';
  }

  function applySizes(arr) {
    if (!arr || arr.length !== panes.length) return;
    panes.forEach((pane, i) => setBasis(pane, Number(arr[i]) || 0));
  }

  handles.forEach(h => {
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', isVert ? 'horizontal' : 'vertical');
  });

  applySizes(opts.sizes);

  let dragging    = null;
  let activeHandle = null;
  let startPos    = 0;
  let startSizes  = [];
  let paneTotal   = 0;

  function onPointerDown(e) {
    const handleIdx = handles.indexOf(e.currentTarget);
    if (handleIdx < 0 || dragging != null) return;
    if (e.button !== undefined && e.button !== 0) return;

    dragging = handleIdx;
    activeHandle = e.currentTarget;
    startPos = isVert ? e.clientY : e.clientX;

    // Record current sizes in px and freeze every pane at its current size,
    // relative to the space available to panes (container minus handles).
    startSizes = panes.map(p => (isVert ? p.getBoundingClientRect().height : p.getBoundingClientRect().width));
    paneTotal = startSizes.reduce((a, b) => a + b, 0);
    if (paneTotal > 0) {
      panes.forEach((p, i) => setBasis(p, startSizes[i] / paneTotal * 100));
    }

    activeHandle.classList.add('lk-splitter__handle--active');
    node.classList.add('lk-splitter--dragging');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (dragging == null || paneTotal <= 0) return;

    const delta = (isVert ? e.clientY : e.clientX) - startPos;
    const paneA = panes[dragging];
    const paneB = panes[dragging + 1];
    if (!paneA || !paneB) return;

    const total = startSizes[dragging] + startSizes[dragging + 1];
    const minA = Math.min(minSize, total / 2);
    let newA = Math.max(minA, startSizes[dragging] + delta);
    let newB = total - newA;
    if (newB < minA) { newB = minA; newA = total - newB; }

    setBasis(paneA, newA / paneTotal * 100);
    setBasis(paneB, newB / paneTotal * 100);
  }

  function onPointerUp() {
    if (activeHandle) activeHandle.classList.remove('lk-splitter__handle--active');
    node.classList.remove('lk-splitter--dragging');
    dragging = null;
    activeHandle = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  handles.forEach(h => h.addEventListener('pointerdown', onPointerDown));

  const comp = {};
  applyBase(comp, node);

  Object.defineProperty(comp, 'sizes', {
    get() {
      const sizes = panes.map(p => (isVert ? p.offsetHeight : p.offsetWidth));
      const total = sizes.reduce((a, b) => a + b, 0);
      return sizes.map(s => (total > 0 ? Math.round(s / total * 100) : 0));
    },
    set(arr) { applySizes(arr); },
    enumerable: true,
  });

  comp.destroy = function () {
    onPointerUp();
    handles.forEach(h => {
      h.removeEventListener('pointerdown', onPointerDown);
      h.removeAttribute('role');
      h.removeAttribute('aria-orientation');
    });
    node.classList.remove('lk-splitter');
  };

  return comp;
}
