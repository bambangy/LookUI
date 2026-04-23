/**
 * Shared show/hide presence controller for animated UI visibility.
 * Uses class toggling plus delayed hide to allow CSS exit transitions.
 *
 * @param {Object} opts
 * @param {Element} opts.element
 * @param {string} [opts.visibleClass='is-open']
 * @param {string} [opts.closingClass='is-closing']
 * @param {number} [opts.exitMs=180]
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

    const exitMs = Math.max(0, Number(options.exitMs) || 0);
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
