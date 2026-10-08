// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * Read a CSS time value (e.g. a duration custom property) from an element and
 * return milliseconds. Comma lists use the longest entry.
 * @param {Element} el
 * @param {string} prop — e.g. '--lk-modal-exit-duration'
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function readDurationMs(el, prop, fallback = 0) {
  if (!el || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(el).getPropertyValue(prop);
  if (!raw || !raw.trim()) return fallback;
  const values = raw.split(',').map((part) => {
    const v = part.trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return NaN;
    return v.endsWith('ms') ? n : n * 1000;
  }).filter(Number.isFinite);
  return values.length ? Math.max(...values) : fallback;
}

/**
 * Shared show/hide presence controller for animated UI visibility.
 * Uses class toggling plus delayed hide to allow CSS exit transitions.
 *
 * @param {Object} opts
 * @param {Element} opts.element
 * @param {string} [opts.visibleClass='is-open']
 * @param {string} [opts.closingClass='is-closing']
 * @param {number|Function} [opts.exitMs=180] — ms, or a function read at hide time
 * @param {boolean} [opts.hideWithHiddenAttr=true]
 * @param {Function} [opts.beforeShow]
 * @param {Function} [opts.afterShow]
 * @param {Function} [opts.beforeHide]
 * @param {Function} [opts.afterHide]
 * @returns {{ show: Function, hide: Function, clear: Function, destroy: Function, isVisible: boolean }}
 */
export function createPresenceController(opts) {
  const options = {
    element: null,
    visibleClass: 'is-open',
    closingClass: 'is-closing',
    exitMs: 180,
    hideWithHiddenAttr: true,
    beforeShow: null,
    afterShow: null,
    beforeHide: null,
    afterHide: null,
    ...opts,
  };

  if (!options.element) {
    throw new Error('createPresenceController: element is required.');
  }

  const el = options.element;
  let visible = false;
  let destroyed = false;
  let hideTimer = null;
  let showFrame = null;

  function clear() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (showFrame != null) {
      cancelAnimationFrame(showFrame);
      showFrame = null;
    }
  }

  function show() {
    if (destroyed || visible) return false;

    // Re-opened while the exit transition is still running: reverse from the
    // current in-between state instead of snapping back to the hidden start.
    const interruptingExit = hideTimer != null;
    clear();

    if (typeof options.beforeShow === 'function') {
      options.beforeShow();
    }

    if (options.hideWithHiddenAttr) {
      el.hidden = false;
    }

    if (options.closingClass) {
      el.classList.remove(options.closingClass);
    }

    if (interruptingExit) {
      if (options.visibleClass) el.classList.add(options.visibleClass);
      visible = true;
      if (typeof options.afterShow === 'function') options.afterShow();
      return true;
    }

    // Flush styles so the element's hidden/initial state is committed before the
    // visible class lands. Without this, an element coming out of display:none
    // (the [hidden] attribute) or freshly inserted has no 'before' style and the
    // enter transition is skipped.
    void el.offsetWidth;

    showFrame = requestAnimationFrame(() => {
      if (options.visibleClass) {
        el.classList.add(options.visibleClass);
      }
      showFrame = null;

      if (typeof options.afterShow === 'function') {
        options.afterShow();
      }
    });

    visible = true;
    return true;
  }

  function hide() {
    if (destroyed || !visible) return false;

    clear();

    if (typeof options.beforeHide === 'function') {
      options.beforeHide();
    }

    if (options.visibleClass) {
      el.classList.remove(options.visibleClass);
    }

    if (options.closingClass) {
      el.classList.add(options.closingClass);
    }

    const finish = () => {
      if (options.hideWithHiddenAttr) {
        el.hidden = true;
      }

      if (options.closingClass) {
        el.classList.remove(options.closingClass);
      }

      hideTimer = null;

      if (typeof options.afterHide === 'function') {
        options.afterHide();
      }
    };

    const rawExit = typeof options.exitMs === 'function' ? options.exitMs() : options.exitMs;
    const exitMs = Math.max(0, Number(rawExit) || 0);
    if (exitMs === 0) {
      finish();
    } else {
      hideTimer = setTimeout(finish, exitMs);
    }

    visible = false;
    return true;
  }

  function destroy() {
    destroyed = true;
    clear();
  }

  return {
    show,
    hide,
    clear,
    destroy,
    get isVisible() {
      return visible;
    },
  };
}

/**
 * Shared collapsible-height state helper for slide open/close UIs.
 *
 * @param {Element} element
 * @param {Object} opts
 * @param {boolean} opts.open
 * @param {string} [opts.openClass='is-open']
 * @param {string} [opts.heightVar='--lk-collapsible-h']
 */
export function setCollapsibleState(element, opts) {
  const options = {
    open: false,
    openClass: 'is-open',
    heightVar: '--lk-collapsible-h',
    ...opts,
  };

  if (!element) return;

  const fullHeight = `${element.scrollHeight}px`;
  element.style.setProperty(options.heightVar, fullHeight);

  if (options.open) {
    element.classList.add(options.openClass);
    return;
  }

  requestAnimationFrame(() => {
    element.style.setProperty(options.heightVar, '0px');
  });
  element.classList.remove(options.openClass);
}

/**
 * z-index a floating layer (dropdown panel, popup proxy) needs so it paints above
 * the stacking context its anchor lives in — e.g. a field inside an lkDialog.
 * Returns null when no positioned ancestor outranks `base`, so callers keep their default.
 * @param {Element} anchor
 * @param {number} [base=0] — the layer's own default z-index
 * @returns {number|null}
 */
export function floatingZIndex(anchor, base = 0) {
  if (!anchor || typeof getComputedStyle !== 'function') return null;
  let top = null;
  for (let node = anchor.parentElement; node && node !== document.body; node = node.parentElement) {
    const z = parseInt(getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(z) && z >= base && (top == null || z > top)) top = z;
  }
  return top == null ? null : top + 1;
}
