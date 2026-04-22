import { lkDialog } from './dialog.js';

/**
 * Create a one-button alert dialog from options.
 * @param {Object} [opts={}]
 * @returns {{ el: Element, overlayEl: Element, dialogEl: Element, isOpen: boolean, open: Function, close: Function, setTitle: Function, setContent: Function, destroy: Function }}
 */
export function lkAlert(opts = {}) {
  const content = opts.content ?? opts.message ?? '';

  return lkDialog({
    ...opts,
    title: opts.title ?? 'Alert',
    content,
    confirmText: opts.okText ?? opts.confirmText ?? 'OK',
    showCancel: opts.showCancel ?? false,
    showClose: opts.showClose ?? false,
    closeOnOverlay: opts.closeOnOverlay ?? false,
    destroyOnClose: opts.destroyOnClose ?? true,
    onConfirm: opts.onConfirm ?? opts.onOk,
  });
}
