// Behavioral mixins — reusable imperative behaviors applied to existing elements

/**
 * Apply toggle behavior: clicking `triggerEl` toggles `activeClass` on `targetEl`.
 * @param {Element} triggerEl
 * @param {Element} targetEl
 * @param {string} [activeClass='is-active']
 * @returns {{ destroy: Function }}
 */
export function lkToggleable(triggerEl, targetEl, activeClass = 'is-active') {
  function onClick() {
    targetEl.classList.toggle(activeClass);
    const isActive = targetEl.classList.contains(activeClass);
    triggerEl.setAttribute('aria-expanded', String(isActive));
  }

  triggerEl.addEventListener('click', onClick);

  return {
    destroy() {
      triggerEl.removeEventListener('click', onClick);
    },
  };
}

/**
 * Trap focus within a container element (for modals, dialogs).
 * @param {Element} containerEl
 * @returns {{ destroy: Function }}
 */
export function lkFocusTrap(containerEl) {
  const focusable = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(containerEl.querySelectorAll(focusable));
    if (!nodes.length) return;
    const first = nodes[0];
    const last  = nodes[nodes.length - 1];
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }

  containerEl.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      containerEl.removeEventListener('keydown', onKeydown);
    },
  };
}
