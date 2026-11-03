// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkStepper — a multi-step flow (wizard): a row / column of step headers, one panel per step,
 * and optional Back / Next / Finish buttons.
 *
 *   const wizard = Look.lkStepper('#wizard', {
 *     steps: [
 *       { id: 'account', title: 'Account', content: (host) => buildForm(host), fields: [email, password] },
 *       { id: 'plan', title: 'Plan', description: 'Pick one', content: { url: '/partials/plan.html' } },
 *       { id: 'confirm', title: 'Confirm', content: 'All set?', validate: async () => (await check()) || 'Not ready' },
 *     ],
 *     onChange(step, { source, prev }) { … },
 *     onComplete({ component }) { … },
 *   });
 *   await wizard.next();   wizard.goTo('plan');   wizard.complete();
 *
 * Enhance existing markup: `<div id="w"><section data-step data-title="Account">…</section>…</div>`
 * (`data-title`, `data-description`, `data-icon`, `data-id`, `data-optional`, `data-disabled`); the
 * sections become the panels and are put back on destroy().
 *
 * Leaving a step FORWARD (Next, a click on a later step, next(), goTo(later), complete()) runs the
 * step's validation first: `fields` (lkValidation over those components, async rules awaited), then
 * `validate()`. Only when that passes does the `beforeChange` guard run. Going back never validates.
 *
 * @param {Element|string} target — container to build in, or a container holding `[data-step]` panels
 * @param {Object} [opts]
 * @param {Array}   [opts.steps] — [{ id, title, description, icon, content, optional, disabled, fields, validate, render, panel }]
 *        content: text | Node | (panel, ctx) => … | { url, select, … } | { html } | { template } (lazy by default)
 * @param {number|string} [opts.current=0] — first step (index or id); earlier steps count as completed
 * @param {boolean} [opts.linear=true]     — only the next step is reachable by click; earlier ones always are
 * @param {string}  [opts.orientation='horizontal'] — 'horizontal' | 'vertical'
 * @param {string}  [opts.variant='default'] — 'default' | 'compact' | 'bar'
 * @param {boolean} [opts.buttons=true]    — render Back / Next / Finish
 * @param {string}  [opts.render='lazy']   — 'lazy' (first visit) | 'eager' (all at once); per step `render`
 * @param {string}  [opts.animation='slide'] — 'slide' | 'none'
 * @param {boolean} [opts.dense=false]
 * @param {Object}  [opts.text]            — per-instance text overrides (keys relative to 'stepper.' or absolute)
 * @param {Function} [opts.beforeChange]   — guard (next, { prev, direction, source, component }); false keeps the step, a step / id / index redirects
 * @param {Function} [opts.beforeComplete] — guard ({ source, component }); false / Promise<false> cancels finishing
 * @param {Function} [opts.onChange]   — (step, { source: 'next'|'prev'|'click'|'api', component, prev })
 * @param {Function} [opts.onComplete] — ({ component, source })
 * @param {Function} [opts.onError]    — (error, { step, source: 'validate'|'load', component })
 * @param {Function} [opts.onLoad]     — (panel, { step, component }) after lazy content is in place
 * @returns {Object}
 */

import { resolveEl } from '../helpers/base.js';
import { renderContent, contentUid } from '../helpers/content.js';
import { guard } from '../helpers/guard.js';
import { lkI18n, bindText } from '../helpers/i18n.js';
import { readDurationMs } from '../helpers/motion.js';
import { lkIcon } from '../components/icon.js';
import { lkValidation } from './validation.js';

lkI18n.define('stepper', {
  label: 'Steps',
  back: 'Back',
  next: 'Next',
  finish: 'Finish',
  optional: 'Optional',
  status: 'Step {current} of {total}',
  'state.done': 'Completed',
  'state.error': 'Has errors',
});

const VARIANTS = ['default', 'compact', 'bar'];
const EXIT_MS = 180;

function contentSpec(step) {
  const c = step.content;
  if (c != null) {
    if (typeof c === 'object' && !(c instanceof Node)
      && (c.url != null || c.html != null || c.content != null || c.template != null)) return c;
    return { content: c };
  }
  if (step.url != null || step.html != null || step.template != null) {
    return { url: step.url, html: step.html, template: step.template, select: step.select, fetchOptions: step.fetchOptions, transform: step.transform, scripts: step.scripts };
  }
  return null;
}

export function lkStepper(target, opts = {}) {
  const root = resolveEl(target, 'lkStepper');
  const options = {
    linear: true, orientation: 'horizontal', variant: 'default', buttons: true,
    render: 'lazy', animation: 'slide', dense: false, current: 0, ...opts,
  };
  const vertical = options.orientation === 'vertical';
  const variant = VARIANTS.includes(options.variant) ? options.variant : 'default';
  const animate = options.animation !== 'none';

  const tx = bindText('stepper', options.text, () => refresh());
  const steps = [];
  const completed = new Set();
  const created = [];          // nodes this instance added
  const restore = [];          // undo functions
  const leaving = new Set();   // panels playing their exit
  let current = -1;
  let busy = false;
  let destroyed = false;
  let isComplete = false;
  let comp = null;

  // --- Root --------------------------------------------------------------------------

  const rootHadClass = root.hasAttribute('class');
  const addedClasses = ['lk-stepper', `lk-stepper--${vertical ? 'vertical' : 'horizontal'}`,
    ...(variant !== 'default' ? [`lk-stepper--${variant}`] : []),
    ...(options.dense ? ['lk-stepper--dense'] : []),
    ...(!animate ? ['lk-stepper--static'] : []),
  ].filter((c) => !root.classList.contains(c));
  root.classList.add(...addedClasses);
  restore.push(() => {
    root.classList.remove(...addedClasses);
    if (!rootHadClass && !root.classList.length) root.removeAttribute('class');
  });

  const list = document.createElement('ol');
  list.className = 'lk-stepper__list';
  list.setAttribute('aria-label', tx.t('label'));
  const panelsEl = document.createElement('div');
  panelsEl.className = 'lk-stepper__panels';
  const messageEl = document.createElement('p');
  messageEl.className = 'lk-stepper__message';
  messageEl.setAttribute('role', 'alert');
  messageEl.hidden = true;
  const statusEl = document.createElement('div');
  statusEl.className = 'lk-sr-only';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');

  let footer = null;
  let backBtn = null;
  let nextBtn = null;
  let finishBtn = null;
  if (options.buttons !== false) {
    footer = document.createElement('div');
    footer.className = 'lk-stepper__footer';
    const sm = options.dense ? ' lk-btn--sm' : '';
    backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = `lk-btn lk-btn--ghost lk-stepper__back${sm}`;
    nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = `lk-btn lk-btn--primary lk-stepper__next${sm}`;
    finishBtn = document.createElement('button');
    finishBtn.type = 'button';
    finishBtn.className = `lk-btn lk-btn--primary lk-stepper__finish${sm}`;
    footer.append(backBtn, nextBtn, finishBtn);
  }

  // --- Public step shape -----------------------------------------------------------

  function statusOf(s) {
    if (s.error) return 'error';
    if (steps[current] === s) return 'active';
    if (completed.has(s.id)) return 'done';
    return 'pending';
  }

  function publicStep(s) {
    if (!s) return null;
    return {
      id: s.id, index: steps.indexOf(s), title: s.title, description: s.description,
      optional: s.optional, disabled: s.disabled, status: statusOf(s),
      panel: s.panel, headEl: s.head, el: s.li,
    };
  }

  function find(ref) {
    if (ref == null) return null;
    if (typeof ref === 'number') return steps[ref] || null;
    if (typeof ref === 'object') return steps.find((s) => s.id === ref.id) || steps.find((s) => s.panel === ref.panel) || null;
    return steps.find((s) => s.id === String(ref)) || (/^\d+$/.test(String(ref)) ? steps[Number(ref)] || null : null);
  }

  // --- Building ------------------------------------------------------------------------

  function makeStep(spec, existingPanel) {
    const s = {
      id: spec.id != null ? String(spec.id) : contentUid('step'),
      title: spec.title != null ? String(spec.title) : '',
      description: spec.description || '',
      icon: spec.icon || '',
      optional: !!spec.optional,
      disabled: !!spec.disabled,
      fields: spec.fields || [],
      validate: typeof spec.validate === 'function' ? spec.validate : null,
      spec: contentSpec(spec),
      render: spec.render === 'eager' || spec.render === 'always' ? 'eager' : spec.render === 'lazy' ? 'lazy' : options.render === 'eager' ? 'eager' : 'lazy',
      error: false,
      rendered: false,
      handle: null,
      own: !existingPanel,
      undo: null,
    };

    s.li = document.createElement('li');
    s.li.className = 'lk-stepper__step';
    s.head = document.createElement('button');
    s.head.type = 'button';
    s.head.className = 'lk-stepper__head';
    s.head.id = contentUid('lk-step-head');
    s.marker = document.createElement('span');
    s.marker.className = 'lk-stepper__marker';
    s.marker.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'lk-stepper__label';
    s.titleEl = document.createElement('span');
    s.titleEl.className = 'lk-stepper__title';
    s.descEl = document.createElement('span');
    s.descEl.className = 'lk-stepper__desc';
    s.optEl = document.createElement('span');
    s.optEl.className = 'lk-stepper__optional';
    s.srEl = document.createElement('span');
    s.srEl.className = 'lk-sr-only';
    label.append(s.titleEl, s.descEl, s.optEl, s.srEl);
    s.head.append(s.marker, label);
    s.line = document.createElement('span');
    s.line.className = 'lk-stepper__line';
    s.line.setAttribute('aria-hidden', 'true');
    s.li.append(s.head, s.line);

    if (existingPanel) {
      const el = existingPanel;
      const snap = {};
      ['id', 'class', 'role', 'aria-labelledby', 'hidden'].forEach((a) => { snap[a] = el.getAttribute(a); });
      const marker = document.createComment('lk-stepper');
      el.replaceWith(marker);
      s.panel = el;
      s.undo = () => {
        Object.entries(snap).forEach(([a, v]) => { if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); });
        marker.replaceWith(el);
      };
    } else {
      s.panel = document.createElement('div');
    }
    s.panel.classList.add('lk-stepper__panel');
    if (!s.panel.id) s.panel.id = contentUid('lk-step-panel');
    s.panel.setAttribute('role', 'region');
    s.panel.setAttribute('aria-labelledby', s.head.id);
    s.panel.hidden = true;
    s.head.setAttribute('aria-controls', s.panel.id);
    return s;
  }

  function paint(s) {
    const i = steps.indexOf(s);
    const st = statusOf(s);
    s.li.className = `lk-stepper__step lk-stepper__step--${st}`
      + (s.disabled ? ' lk-stepper__step--disabled' : '')
      + (s.optional ? ' lk-stepper__step--optional' : '')
      + (completed.has(s.id) && !s.error ? ' lk-stepper__step--done' : '');
    s.head.disabled = s.disabled;
    if (st === 'active') s.head.setAttribute('aria-current', 'step'); else s.head.removeAttribute('aria-current');
    const locked = !s.disabled && st !== 'active' && !reachable(i);
    if (locked) s.head.setAttribute('aria-disabled', 'true'); else s.head.removeAttribute('aria-disabled');
    s.titleEl.textContent = s.title;
    s.descEl.textContent = s.description;
    s.descEl.hidden = !s.description;
    s.optEl.textContent = tx.t('optional');
    s.optEl.hidden = !s.optional;
    s.srEl.textContent = s.error ? tx.t('state.error') : completed.has(s.id) && st !== 'active' ? tx.t('state.done') : '';
    s.marker.textContent = '';
    if (s.error) s.marker.appendChild(lkIcon('close'));
    else if (completed.has(s.id) && st !== 'active') s.marker.appendChild(lkIcon('check'));
    else if (s.icon) s.marker.appendChild(lkIcon(s.icon));
    else s.marker.textContent = String(i + 1);
    s.li.classList.toggle('lk-stepper__step--last', i === steps.length - 1);
  }

  function paintAll() {
    steps.forEach(paint);
    paintFooter();
    statusEl.textContent = current >= 0 ? tx.t('status', { current: current + 1, total: steps.length }) : '';
  }

  function lastEnabled() {
    for (let i = steps.length - 1; i >= 0; i -= 1) if (!steps[i].disabled) return i;
    return -1;
  }

  function neighbour(from, dir) {
    for (let i = from + dir; i >= 0 && i < steps.length; i += dir) if (!steps[i].disabled) return i;
    return -1;
  }

  function paintFooter() {
    if (!footer) return;
    backBtn.textContent = tx.t('back');
    nextBtn.textContent = tx.t('next');
    finishBtn.textContent = tx.t('finish');
    const atEnd = current === lastEnabled();
    const hadFocus = footer.contains(document.activeElement) ? document.activeElement : null;
    backBtn.disabled = neighbour(current, -1) === -1;
    nextBtn.hidden = atEnd;
    finishBtn.hidden = !atEnd;
    nextBtn.disabled = atEnd || neighbour(current, 1) === -1;
    if (hadFocus && (hadFocus.disabled || hadFocus.hidden)) (atEnd ? finishBtn : nextBtn).focus({ preventScroll: true });
  }

  function refresh() {
    if (destroyed) return;
    list.setAttribute('aria-label', tx.t('label'));
    paintAll();
  }

  function insertStep(s, index) {
    const at = index == null || index < 0 || index > steps.length ? steps.length : index;
    steps.splice(at, 0, s);
    list.insertBefore(s.li, list.children[at] || null);
    panelsEl.insertBefore(s.panel, panelsEl.children[at] || null);
    return at;
  }

  // --- Reachability --------------------------------------------------------------------

  function reachable(idx) {
    const s = steps[idx];
    if (!s || s.disabled) return false;
    if (idx <= current || !options.linear) return true;
    for (let j = 0; j < idx; j += 1) {
      const p = steps[j];
      if (j === current || p.disabled || p.optional || completed.has(p.id)) continue;
      return false;
    }
    return true;
  }

  // --- Content -------------------------------------------------------------------------

  function renderStep(s) {
    if (s.rendered || !s.spec || !s.own) return;
    s.rendered = true;
    s.handle = renderContent(s.panel, s.spec, {
      ctx: { step: publicStep(s), component: comp },
      onLoad: (panel) => options.onLoad?.(panel, { step: publicStep(s), component: comp }),
      onError: (err) => options.onError?.(err, { step: publicStep(s), source: 'load', component: comp }),
    });
  }

  // --- Panels ------------------------------------------------------------------------------

  function finishLeave(p) {
    p.panel.classList.remove('lk-stepper__panel--leave');
    p.panel.style.removeProperty('--lk-stepper-dir');
    if (p.panel !== steps[current]?.panel) p.panel.hidden = true;
    clearTimeout(p.timer);
    leaving.delete(p);
  }

  function reduced() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function showPanel(s, dir) {
    for (const p of Array.from(leaving)) if (p.panel === s.panel) finishLeave(p);
    s.panel.hidden = false;
    s.panel.classList.remove('lk-stepper__panel--enter');
    if (dir && animate && !reduced()) {
      s.panel.style.setProperty('--lk-stepper-dir', String(dir));
      void s.panel.offsetWidth;
      s.panel.classList.add('lk-stepper__panel--enter');
    }
  }

  function hidePanel(s, dir) {
    s.panel.classList.remove('lk-stepper__panel--enter');
    if (!animate || !dir || reduced() || s.panel.hidden) { s.panel.hidden = true; return; }
    s.panel.style.setProperty('--lk-stepper-dir', String(dir));
    s.panel.classList.add('lk-stepper__panel--leave');
    const p = { panel: s.panel, timer: null };
    p.timer = setTimeout(() => finishLeave(p), readDurationMs(panelsEl, '--lk-stepper-exit-duration', EXIT_MS) + 30);
    leaving.add(p);
  }

  function showMessage(text) {
    messageEl.textContent = text || '';
    messageEl.hidden = !text;
  }

  function activate(s, { source, silent }) {
    const prev = steps[current] || null;
    const dir = prev ? (steps.indexOf(s) > steps.indexOf(prev) ? 1 : -1) : 0;
    if (prev && prev !== s) hidePanel(prev, dir);
    current = steps.indexOf(s);
    isComplete = false;
    showPanel(s, prev ? dir : 0);
    renderStep(s);
    showMessage('');
    paintAll();
    if (!silent && prev) options.onChange?.(publicStep(s), { source, component: comp, prev: publicStep(prev) });
  }

  // --- Leaving a step --------------------------------------------------------------------

  /** Validate the step being left forward. Resolves true to go on. */
  async function checkLeave(s, source) {
    const members = (s.fields || []).filter((c) => c && typeof c.validate === 'function');
    let ok = true;
    let message = '';
    if (members.length) {
      const v = lkValidation(members, { focusFirst: true, scroll: true });
      try {
        const res = await v.validateAsync();
        if (res.hasError) ok = false;
      } catch (error) {
        ok = false;
        options.onError?.(error, { step: publicStep(s), source: 'validate', component: comp });
      } finally {
        v.destroy();
      }
    }
    if (ok && s.validate) {
      try {
        const r = await s.validate(publicStep(s), { source, component: comp });
        if (r === false) ok = false;
        else if (typeof r === 'string' && r) { ok = false; message = r; }
      } catch (error) {
        ok = false;
        message = error?.message || '';
        options.onError?.(error, { step: publicStep(s), source: 'validate', component: comp });
      }
    }
    if (destroyed) return false;
    s.error = !ok;
    if (ok) completed.add(s.id);
    showMessage(message);
    paint(s);
    return ok;
  }

  function decide(name, payload, ctx) {
    return new Promise((resolve) => {
      const r = guard(root, options, name, payload, ctx, (next) => resolve({ next }));
      if (r === false) resolve(null);
      else if (r && typeof r.then === 'function') r.then((v) => { if (v === false) resolve(null); }, () => resolve(null));
    });
  }

  async function change(idx, source, o = {}) {
    if (destroyed || busy) return false;
    const target = steps[idx];
    const prev = steps[current];
    if (!target || target.disabled || target === prev) return false;
    if (source === 'click' && !reachable(idx)) return false;
    const forward = idx > current;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try {
      if (forward && prev && o.validate !== false) {
        if (!(await checkLeave(prev, source))) return false;
      }
      const out = await decide('change', publicStep(target), { prev: publicStep(prev), direction: forward ? 'forward' : 'backward', source, component: comp });
      if (!out || destroyed) return false;
      let dest = target;
      if (out.next && out.next !== true) {
        const alt = find(out.next);
        if (alt) dest = alt;
      }
      if (!steps.includes(dest) || dest.disabled || dest === steps[current]) return false;
      activate(dest, { source, silent: false });
      return true;
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
    }
  }

  async function finish(source = 'api') {
    if (destroyed || busy || current < 0) return false;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try {
      const s = steps[current];
      if (!(await checkLeave(s, source))) return false;
      const out = await decide('complete', undefined, { source, component: comp });
      if (!out || destroyed) return false;
      isComplete = true;
      completed.add(s.id);
      paintAll();
      options.onComplete?.({ component: comp, source });
      return true;
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
    }
  }

  // --- Events ------------------------------------------------------------------------------

  function onListClick(e) {
    const head = e.target.closest?.('.lk-stepper__head');
    if (!head) return;
    const idx = steps.findIndex((s) => s.head === head);
    if (idx !== -1) change(idx, 'click');
  }

  function onListKey(e) {
    const head = e.target.closest?.('.lk-stepper__head');
    if (!head) return;
    const enabled = steps.filter((s) => !s.disabled);
    const at = enabled.findIndex((s) => s.head === head);
    if (at === -1) return;
    const fwd = vertical ? 'ArrowDown' : (getComputedStyle(root).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    const back = vertical ? 'ArrowUp' : (getComputedStyle(root).direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft');
    let to = null;
    if (e.key === fwd) to = enabled[Math.min(at + 1, enabled.length - 1)];
    else if (e.key === back) to = enabled[Math.max(at - 1, 0)];
    else if (e.key === 'Home') to = enabled[0];
    else if (e.key === 'End') to = enabled[enabled.length - 1];
    if (to) { e.preventDefault(); to.head.focus(); }
  }

  const onBack = () => change(neighbour(current, -1), 'prev');
  const onNext = () => change(neighbour(current, 1), 'next');
  const onFinish = () => finish('finish');

  // --- API -------------------------------------------------------------------------------------

  function resolveIndex(ref) {
    const s = find(ref);
    return s ? steps.indexOf(s) : -1;
  }

  comp = {
    el: root,
    listEl: list,
    panelsEl,
    footerEl: footer,
    next() { return change(neighbour(current, 1), 'api'); },
    prev() { return change(neighbour(current, -1), 'api'); },
    goTo(ref, o) { return change(resolveIndex(ref), 'api', o); },
    complete() { return finish('api'); },
    reset() {
      if (destroyed) return comp;
      completed.clear();
      isComplete = false;
      steps.forEach((s) => { s.error = false; });
      const first = steps.findIndex((s) => !s.disabled);
      if (first !== -1 && first !== current) activate(steps[first], { source: 'api', silent: true });
      else paintAll();
      showMessage('');
      return comp;
    },
    get(ref) { return publicStep(find(ref)); },
    get steps() { return steps.map(publicStep); },
    panel(ref) { return find(ref)?.panel || null; },
    setStatus(ref, status) {
      const s = find(ref);
      if (!s) return comp;
      s.error = status === 'error';
      if (status === 'done') completed.add(s.id);
      else if (status === 'pending') completed.delete(s.id);
      paintAll();
      return comp;
    },
    enable(ref) { const s = find(ref); if (s) { s.disabled = false; paintAll(); } return comp; },
    disable(ref) { const s = find(ref); if (s) { s.disabled = true; paintAll(); } return comp; },
    add(spec, index) {
      if (destroyed) return comp;
      const s = makeStep(spec || {});
      insertStep(s, index);
      if (s.render === 'eager' && current >= 0) renderStep(s);
      if (current < 0 && !s.disabled) activate(s, { source: 'api', silent: true });
      else paintAll();
      return comp;
    },
    remove(ref) {
      const s = find(ref);
      if (!s || destroyed) return comp;
      const idx = steps.indexOf(s);
      const wasCurrent = idx === current;
      s.handle?.destroy();
      s.li.remove();
      s.panel.classList.remove('lk-stepper__panel--enter', 'lk-stepper__panel--leave');
      if (s.undo) s.undo(); else s.panel.remove();
      steps.splice(idx, 1);
      completed.delete(s.id);
      for (const p of Array.from(leaving)) if (p.panel === s.panel) finishLeave(p);
      if (wasCurrent) {
        current = -1;
        const next = steps[Math.min(idx, steps.length - 1)];
        if (next) activate(steps.find((x, i) => !x.disabled && i >= Math.min(idx, steps.length - 1)) || steps.find((x) => !x.disabled) || next, { source: 'api', silent: true });
      } else if (idx < current) {
        current -= 1;
      }
      paintAll();
      return comp;
    },
    get current() { return current; },
    set current(ref) {
      const idx = resolveIndex(ref);
      if (destroyed || idx === -1 || idx === current || steps[idx].disabled) return;
      activate(steps[idx], { source: 'api', silent: true });
    },
    get currentStep() { return publicStep(steps[current]); },
    get completed() { return Array.from(completed); },
    set completed(ids) {
      completed.clear();
      Array.from(ids || []).forEach((r) => { const s = find(r); if (s) completed.add(s.id); });
      paintAll();
    },
    get isComplete() { return isComplete; },
    get busy() { return busy; },
    get text() { return tx.get(); },
    set text(v) { tx.set(v); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      leaving.forEach((p) => clearTimeout(p.timer));
      leaving.clear();
      list.removeEventListener('click', onListClick);
      list.removeEventListener('keydown', onListKey);
      if (footer) {
        backBtn.removeEventListener('click', onBack);
        nextBtn.removeEventListener('click', onNext);
        finishBtn.removeEventListener('click', onFinish);
      }
      tx.destroy();
      steps.forEach((s) => {
        s.handle?.destroy();
        s.panel.classList.remove('lk-stepper__panel', 'lk-stepper__panel--enter', 'lk-stepper__panel--leave');
        s.panel.style.removeProperty('--lk-stepper-dir');
        if (s.undo) s.undo();
      });
      steps.length = 0;
      [list, panelsEl, footer, statusEl, ...created].forEach((n) => n?.remove());
      restore.forEach((fn) => fn());
      root.removeAttribute('aria-busy');
    },
  };

  // --- Init ------------------------------------------------------------------------------------

  const markup = Array.from(root.querySelectorAll('[data-step]'));
  const specs = Array.isArray(options.steps) ? options.steps : [];
  if (markup.length) {
    markup.forEach((el, i) => {
      const d = el.dataset;
      const base = {
        id: d.id || el.id || undefined,
        title: d.title || d.step || `Step ${i + 1}`,
        description: d.description,
        icon: d.icon,
        optional: d.optional != null,
        disabled: d.disabled != null,
      };
      insertStep(makeStep({ ...base, ...(specs[i] || {}) }, el), steps.length);
    });
  } else {
    specs.forEach((spec) => insertStep(makeStep(spec), steps.length));
  }

  // Layout: list first, then panels (placed where the first panel was in enhance mode), footer, status
  root.prepend(list);
  list.after(panelsEl);
  if (footer) root.appendChild(footer);
  panelsEl.after(messageEl);
  root.appendChild(statusEl);
  created.push(messageEl);

  list.addEventListener('click', onListClick);
  list.addEventListener('keydown', onListKey);
  if (footer) {
    backBtn.addEventListener('click', onBack);
    nextBtn.addEventListener('click', onNext);
    finishBtn.addEventListener('click', onFinish);
  }

  if (steps.length) {
    let start = resolveIndex(options.current);
    if (start < 0 || steps[start].disabled) start = steps.findIndex((s) => !s.disabled);
    for (let i = 0; i < start; i += 1) if (!steps[i].disabled) completed.add(steps[i].id);
    steps.forEach((s) => { if (s.render === 'eager') renderStep(s); });
    if (start >= 0) activate(steps[start], { source: 'api', silent: true });
  }
  paintAll();

  return comp;
}
