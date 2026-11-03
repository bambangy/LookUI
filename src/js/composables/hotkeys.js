// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// lkHotkeys — keyboard shortcuts and key sequences

import { guard } from '../helpers/guard.js';
import { lkI18n, bindText } from '../helpers/i18n.js';

lkI18n.define('hotkeys', {
  then: 'then',
  'key.ctrl': 'Ctrl',
  'key.shift': 'Shift',
  'key.alt': 'Alt',
  'key.meta': 'Win',
  'key.enter': 'Enter',
  'key.escape': 'Esc',
  'key.space': 'Space',
  'key.tab': 'Tab',
  'key.backspace': 'Backspace',
  'key.delete': 'Del',
  'key.up': '↑',
  'key.down': '↓',
  'key.left': '←',
  'key.right': '→',
  'key.home': 'Home',
  'key.end': 'End',
  'key.pageup': 'PgUp',
  'key.pagedown': 'PgDn',
  'key.plus': '+',
});

const SEQUENCE_TIMEOUT = 1000;

const ALIASES = {
  esc: 'escape', return: 'enter', del: 'delete', ' ': 'space', spacebar: 'space',
  up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
  pgup: 'pageup', pgdn: 'pagedown', plus: '+', ins: 'insert',
};
const MOD_ALIASES = {
  control: 'ctrl', ctl: 'ctrl', cmd: 'meta', command: 'meta', win: 'meta', windows: 'meta', super: 'meta', option: 'alt', opt: 'alt',
};
const NAMED_TEXT = {
  escape: 'escape', enter: 'enter', space: 'space', tab: 'tab', backspace: 'backspace', delete: 'delete',
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', home: 'home', end: 'end',
  pageup: 'pageup', pagedown: 'pagedown', '+': 'plus',
};

export function detectMac() {
  if (typeof navigator === 'undefined') return false;
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(p);
}

/** 'mod+shift+k' -> { ctrl, alt, shift, meta, key } */
function parseStep(raw, mac) {
  let s = String(raw).trim().toLowerCase();
  if (s === '+') s = 'plus';
  s = s.replace(/\+\+$/, '+plus');
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  const step = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  parts.forEach((p) => {
    const m = MOD_ALIASES[p] || p;
    if (m === 'mod') { if (mac) step.meta = true; else step.ctrl = true; }
    else if (m === 'ctrl' || m === 'alt' || m === 'shift' || m === 'meta') step[m] = true;
    else step.key = ALIASES[m] || m;
  });
  step.symbol = step.key.length === 1 && !/[a-z0-9]/.test(step.key);
  return step;
}

function parseKeys(keys, mac) {
  return String(keys).trim().split(/\s+/).filter(Boolean).map((s) => parseStep(s, mac));
}

/** Layout independent key name of a keyboard event. */
function eventKey(e) {
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const k = e.key;
  if (k == null || k === 'Unidentified') return '';
  const low = k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  return ALIASES[low] || low;
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'capslock', 'os']);

function stepMatches(step, e, key) {
  if (step.key !== key) return false;
  if (step.ctrl !== e.ctrlKey || step.alt !== e.altKey || step.meta !== e.metaKey) return false;
  if (!step.symbol && step.shift !== e.shiftKey) return false;
  return true;
}

function stepId(step) {
  return `${step.ctrl ? 'c' : ''}${step.alt ? 'a' : ''}${step.shift && !step.symbol ? 's' : ''}${step.meta ? 'm' : ''}+${step.key}`;
}

function isTyping(target) {
  if (!target || target.nodeType !== 1) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !/^(button|checkbox|radio|submit|reset|image|range|color|file)$/i.test(target.type);
  return target.isContentEditable === true;
}

function formatStep(step, mac, t) {
  const mods = [];
  if (mac) {
    if (step.ctrl) mods.push('⌃');
    if (step.alt) mods.push('⌥');
    if (step.shift) mods.push('⇧');
    if (step.meta) mods.push('⌘');
  } else {
    if (step.ctrl) mods.push(t('key.ctrl'));
    if (step.alt) mods.push(t('key.alt'));
    if (step.shift) mods.push(t('key.shift'));
    if (step.meta) mods.push(t('key.meta'));
  }
  const named = NAMED_TEXT[step.key];
  const key = named ? t(`key.${named}`) : step.key.length === 1 ? step.key.toUpperCase() : step.key.charAt(0).toUpperCase() + step.key.slice(1);
  return mac ? mods.join('') + key : [...mods, key].join('+');
}

function formatKeys(keys, mac, t) {
  const steps = parseKeys(keys, mac);
  return steps.map((s) => formatStep(s, mac, t)).join(` ${t('then')} `);
}

/**
 * Keyboard shortcuts and key sequences.
 *
 *   const hk = Look.lkHotkeys({ 'mod+k': (e) => openPalette(), 'g i': () => goInbox(), '?': showHelp });
 *
 * @param {Object|Array} [map] — `{ 'mod+k': handler }` or `[{ keys, handler, description, scope?, when?, allowInInputs?, preventDefault? }]`.
 *   Keys: modifiers `ctrl shift alt meta mod` (mod = Cmd on macOS, Ctrl elsewhere) joined with `+`, then one key
 *   (`k`, `enter`, `escape`, `up`, `?`, `/`…). Space separates the steps of a sequence ('g i', 1 s between steps).
 *   Letters and digits match by physical key (layout and Shift independent); symbols match by the character typed.
 * @param {Object} [opts]
 * @param {Element|Document} [opts.scope=document] — where keydown is listened to
 * @param {boolean} [opts.ignoreInputs=true] — ignore shortcuts without ctrl/alt/meta while typing in inputs, textareas, selects, contentEditable
 * @param {boolean} [opts.allowInInputs=false] — never ignore (per shortcut: `allowInInputs` in the array form / add() meta)
 * @param {boolean} [opts.preventDefault=true] — preventDefault() on handled shortcuts
 * @param {boolean} [opts.allowRepeat=false] — also fire for auto-repeating keydowns
 * @param {boolean} [opts.enabled=true]
 * @param {boolean} [opts.capture=false] — listen in the capture phase
 * @param {boolean} [opts.mac] — force macOS (⌘) or not; default auto-detected
 * @param {Function} [opts.beforeTrigger] — guard ({ keys, event, component }); false ignores the shortcut and does NOT prevent the event
 * @param {Object} [opts.text] — per-instance key names ('key.ctrl', 'then'…)
 * @returns {{ add: Function, remove: Function, enable: Function, disable: Function, list: Function, format: Function, enabled: boolean, destroy: Function }}
 */
export function lkHotkeys(map, opts = {}) {
  const options = { ignoreInputs: true, preventDefault: true, enabled: true, capture: false, ...opts };
  const mac = options.mac !== undefined ? !!options.mac : detectMac();
  const scopeEl = options.scope || document;
  const tx = bindText('hotkeys', options.text, null);
  const comp = {};
  const bindings = [];
  let enabled = !!options.enabled;
  let destroyed = false;
  let buffer = [];
  let timer = 0;

  const resetSeq = () => { buffer = []; clearTimeout(timer); timer = 0; };

  function add(keys, handler, meta = {}) {
    if (typeof handler !== 'function') throw new Error('Look.lkHotkeys: handler must be a function');
    const b = {
      keys: String(keys).trim(),
      steps: parseKeys(keys, mac),
      handler,
      description: meta.description || '',
      scope: meta.scope || null,
      when: typeof meta.when === 'function' ? meta.when : null,
      allowInInputs: meta.allowInInputs,
      preventDefault: meta.preventDefault,
    };
    b.ids = b.steps.map(stepId);
    bindings.push(b);
    return () => { const i = bindings.indexOf(b); if (i >= 0) bindings.splice(i, 1); };
  }

  function norm(keys) { return parseKeys(keys, mac).map(stepId).join(' '); }

  function remove(keys, handler) {
    const id = norm(keys);
    for (let i = bindings.length - 1; i >= 0; i--) {
      if (bindings[i].ids.join(' ') === id && (!handler || bindings[i].handler === handler)) bindings.splice(i, 1);
    }
    return comp;
  }

  function allowed(b, e) {
    if (b.when && !b.when(e)) return false;
    if (b.scope) {
      const s = typeof b.scope === 'string' ? document.querySelector(b.scope) : b.scope;
      if (!s || !s.contains(e.target)) return false;
    }
    if (isTyping(e.target)) {
      const first = b.steps[0];
      const allow = b.allowInInputs !== undefined ? b.allowInInputs : options.allowInInputs;
      if (!allow && options.ignoreInputs && !(first.ctrl || first.alt || first.meta)) return false;
    }
    return true;
  }

  function fire(b, e) {
    const ctx = { keys: b.keys, event: e, component: comp };
    const pd = b.preventDefault !== undefined ? b.preventDefault : options.preventDefault;
    return guard(scopeEl, options, 'trigger', undefined, ctx, () => {
      if (pd && !e.defaultPrevented) e.preventDefault();
      b.handler(e, { keys: b.keys, component: comp });
    });
  }

  function onKeyDown(e) {
    if (!enabled || destroyed || e.isComposing) return;
    const key = eventKey(e);
    if (!key || MODIFIER_KEYS.has(key)) return;
    if (e.repeat && !options.allowRepeat) return;

    const tryBuffer = (buf) => {
      const prefixMatches = bindings.filter((b) => b.steps.length >= buf.length && buf.every((s, i) => stepMatches(b.steps[i], s.e, s.key)));
      return prefixMatches;
    };
    const cur = { e, key };
    const attempt = (prev) => {
      const buf = [...prev, cur];
      const m = tryBuffer(buf).filter((b) => allowed(b, e));
      if (!m.length) return null;
      const exact = m.filter((b) => b.steps.length === buf.length);
      return { buf, exact, longer: m.some((b) => b.steps.length > buf.length) };
    };

    // stored steps keep their own event so modifiers are compared per step
    let res = attempt(buffer);
    if (!res && buffer.length) { resetSeq(); res = attempt([]); }
    if (!res) { resetSeq(); return; }

    if (res.exact.length) {
      resetSeq();
      // later registrations win over earlier ones for the same keys
      fire(res.exact[res.exact.length - 1], e);
      return;
    }
    if (res.longer) {
      buffer = res.buf;
      clearTimeout(timer);
      timer = setTimeout(resetSeq, SEQUENCE_TIMEOUT);
    }
  }

  scopeEl.addEventListener('keydown', onKeyDown, !!options.capture);

  const entries = Array.isArray(map) ? map : Object.entries(map || {}).map(([keys, handler]) => ({ keys, handler }));
  entries.forEach((en) => {
    if (en.keys && en.handler) add(en.keys, en.handler, en);
  });

  Object.defineProperties(comp, {
    enabled: { get: () => enabled, set: (v) => { enabled = !!v; if (!enabled) resetSeq(); }, enumerable: true },
    text: { get: () => tx.get(), set: (v) => tx.set(v), enumerable: true },
    mac: { value: mac, enumerable: true },
  });
  comp.add = add;
  comp.remove = remove;
  comp.enable = () => { enabled = true; return comp; };
  comp.disable = () => { enabled = false; resetSeq(); return comp; };
  /** @returns {Array<{keys: string, label: string, description: string}>} */
  comp.list = () => bindings.map((b) => ({ keys: b.keys, label: formatKeys(b.keys, mac, tx.t), description: b.description }));
  comp.format = (keys) => formatKeys(keys, mac, tx.t);
  comp.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    resetSeq();
    scopeEl.removeEventListener('keydown', onKeyDown, !!options.capture);
    bindings.length = 0;
    tx.destroy();
  };
  return comp;
}

/**
 * Pretty, platform-aware label of a shortcut: '⌘K' on macOS, 'Ctrl+K' elsewhere; key names are localized.
 * @param {string} keys — e.g. 'mod+shift+p', 'g i'
 * @param {{ mac?: boolean }} [o]
 * @returns {string}
 */
lkHotkeys.format = (keys, o = {}) => formatKeys(keys, o.mac !== undefined ? !!o.mac : detectMac(), (k) => lkI18n.t(`hotkeys.${k}`));
