// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Progress component factory

import { resolveEl, applyBase } from '../helpers/base.js';
import { qs } from '../core/index.js';
import { lkI18n, bindText } from '../helpers/i18n.js';

lkI18n.define('progress', { label: 'Progress' });

/**
 * Enhance a progress bar with imperative value control.
 * @param {Element|string} el — .lk-progress container
 * @param {Object} [opts]
 * @param {number}  [opts.value]         — initial value (default 0)
 * @param {number}  [opts.max]           — max value (default 100)
 * @param {boolean} [opts.indeterminate] — indeterminate loading state
 * @param {Object}  [opts.text]          — text overrides (progress.label: aria-label when the markup has none; the percent label uses Intl with the active locale)
 * @returns {Object}
 */
export function lkProgress(el, opts = {}) {
  const node = resolveEl(el, 'lkProgress');
  node.classList.add('lk-progress');

  const bar   = qs('.lk-progress__bar', node);
  const label = qs('.lk-progress__label', node);

  let max            = Math.max(0, opts.max ?? 100);
  let value          = Math.max(0, Math.min(max, Number(opts.value) || 0));
  let indeterminate  = opts.indeterminate ?? false;
  const hadLabel = node.hasAttribute('aria-label') || node.hasAttribute('aria-labelledby');
  const tx = bindText('progress', opts.text, () => updateView());

  function percentText(pct) {
    try { return new Intl.NumberFormat(lkI18n.locale, { style: 'percent', maximumFractionDigits: 0 }).format(Math.round(pct) / 100); } catch { return Math.round(pct) + '%'; }
  }

  function updateView() {
    node.setAttribute('role', 'progressbar');
    if (!hadLabel) node.setAttribute('aria-label', tx.t('label'));

    if (indeterminate) {
      node.classList.add('lk-progress--indeterminate');
      if (bar) bar.style.width = '';
      node.removeAttribute('aria-valuenow');
      node.removeAttribute('aria-valuemin');
      node.removeAttribute('aria-valuemax');
      node.setAttribute('aria-valuetext', tx.tf('common.loading'));
    } else {
      node.removeAttribute('aria-valuetext');
      node.classList.remove('lk-progress--indeterminate');
      const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = percentText(pct);
      node.setAttribute('aria-valuenow', value);
      node.setAttribute('aria-valuemin', 0);
      node.setAttribute('aria-valuemax', max);
    }
  }

  updateView();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true },
    value: {
      get() { return value; },
      set(v) { value = Math.max(0, Math.min(max, v)); updateView(); },
      enumerable: true,
    },
    max: {
      get() { return max; },
      set(v) { max = Math.max(0, v); value = Math.min(value, max); updateView(); },
      enumerable: true,
    },
    indeterminate: {
      get() { return indeterminate; },
      set(v) { indeterminate = !!v; updateView(); },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    tx.destroy();
    if (!hadLabel) node.removeAttribute('aria-label');
    node.removeAttribute('aria-valuetext');
    node.classList.remove('lk-progress', 'lk-progress--indeterminate');
    node.removeAttribute('role');
    node.removeAttribute('aria-valuenow');
    node.removeAttribute('aria-valuemin');
    node.removeAttribute('aria-valuemax');
  };

  return comp;
}
