// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Icon factory + registry
//
// Glyphs are CSS masks read from --lk-icon-src. The default set (Look Icons)
// ships in look.css; the registry adds or overrides glyphs at runtime by
// injecting `.lk-icon.lk-icon--name { --lk-icon-src: … }` rules, so lkIcon()
// and plain `<span class="lk-icon lk-icon--name">` markup both pick them up.

const STYLE_ID = 'lk-icon-registry';

// .lk-icon modifiers that are not glyphs
const RESERVED = new Set([
  'xs', 'sm', 'lg', 'xl', '2xl',
  'primary', 'secondary', 'positive', 'negative', 'warning', 'info', 'muted',
  'spin',
]);

// Names in the default Look Icons set (keep in sync with src/scss/icons/_look-icons.scss)
export const LOOK_ICON_NAMES = [
  'chevron-left', 'chevron-right', 'chevron-up', 'chevron-down', 'arrow-left', 'arrow-right',
  'arrow-up', 'arrow-down', 'menu', 'external-link', 'close', 'check', 'plus', 'minus',
  'search', 'edit', 'edit-fill', 'delete', 'delete-fill', 'copy', 'copy-fill', 'save',
  'download', 'upload', 'refresh', 'undo', 'redo', 'star', 'star-fill', 'heart',
  'heart-fill', 'eye', 'eye-fill', 'eye-off', 'eye-off-fill', 'bell', 'bell-fill',
  'settings', 'settings-fill', 'filter', 'sort-asc', 'sort-desc', 'more-horizontal',
  'more-vertical', 'circle-info', 'circle-info-fill', 'alert-triangle',
  'alert-triangle-fill', 'circle-x', 'circle-x-fill', 'circle-check', 'circle-check-fill',
  'question', 'question-fill', 'user', 'user-fill', 'users', 'users-fill', 'home',
  'home-fill', 'calendar', 'calendar-fill', 'clock', 'clock-fill', 'mail', 'mail-fill',
  'lock', 'lock-fill', 'unlock', 'unlock-fill', 'image', 'image-fill', 'file', 'file-fill',
  'dashboard', 'dashboard-fill', 'folder', 'folder-fill', 'shopping-cart',
  'shopping-cart-fill', 'play', 'play-fill', 'pause', 'pause-fill', 'stop', 'stop-fill',
  'skip-forward', 'skip-forward-fill', 'skip-back', 'skip-back-fill', 'volume-off',
  'volume-off-fill', 'share', 'link', 'pin', 'pin-fill', 'chat', 'chat-fill', 'star-outline',
  'heart-outline',
];

const registry = new Map(); // name -> css <image> value

function encodeSvg(svg) {
  let s = String(svg).trim().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg\b/, "<svg xmlns='http://www.w3.org/2000/svg'");
  return s
    .replace(/%/g, '%25')
    .replace(/"/g, "'")
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/#/g, '%23')
    .replace(/\{/g, '%7B')
    .replace(/\}/g, '%7D');
}

// '<svg…>' | 'url(…)' | '/path/icon.svg' | 'data:…' → CSS <image> value
function toSource(input) {
  if (input == null) throw new Error('Look.icons: an SVG string or URL is required.');
  const s = String(input).trim();
  if (s.startsWith('<')) return `url("data:image/svg+xml,${encodeSvg(s)}")`;
  if (/^url\(/i.test(s)) return s;
  return `url("${s.replace(/"/g, '%22')}")`;
}

function assertName(name) {
  const n = String(name ?? '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(n)) throw new Error(`Look.icons: invalid icon name "${name}".`);
  if (RESERVED.has(n)) throw new Error(`Look.icons: "${n}" is a reserved .lk-icon modifier.`);
  return n;
}

function flush() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(STYLE_ID);
  if (!registry.size) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = Array.from(registry, ([name, src]) => `.lk-icon.lk-icon--${name}{--lk-icon-src:${src}}`).join('\n');
}

/**
 * Runtime icon registry (`Look.icons`).
 *
 *   Look.icons.register('rocket', '<svg viewBox="0 0 24 24">…</svg>');
 *   Look.icons.register('logo', '/img/logo-mask.svg');
 *   Look.icons.use(lucideSet, { prefix: '' });      // { name: svg, … } — overrides defaults
 *   Look.icons.unregister('rocket');  Look.icons.reset();
 */
export const lkIcons = {
  /** Add or override one glyph. `svg` may be markup, a URL, or a url(…) value. */
  register(name, svg) {
    registry.set(assertName(name), toSource(svg));
    flush();
    return lkIcons;
  },

  /** Register a whole set: { name: svg } (or a Map). `prefix` namespaces the names. */
  use(set, { prefix = '' } = {}) {
    const entries = set instanceof Map ? Array.from(set) : Object.entries(set || {});
    entries.forEach(([name, svg]) => registry.set(assertName(`${prefix}${name}`), toSource(svg)));
    flush();
    return lkIcons;
  },

  /** Remove a registered glyph (a default glyph with the same name shows again). */
  unregister(name) {
    registry.delete(String(name));
    flush();
    return lkIcons;
  },

  /** Remove every registered glyph. */
  reset() {
    registry.clear();
    flush();
    return lkIcons;
  },

  /** True when the name is registered or part of the default set. */
  has(name) {
    return registry.has(name) || LOOK_ICON_NAMES.includes(name);
  },

  /** Registered (runtime) names only, or every available name with `{ all: true }`. */
  names({ all = false } = {}) {
    const custom = Array.from(registry.keys());
    return all ? Array.from(new Set([...LOOK_ICON_NAMES, ...custom])) : custom;
  },

  /** Raw CSS source a registered name resolves to (null for defaults/unknown). */
  get(name) {
    return registry.get(name) ?? null;
  },
};

/**
 * Create an icon element.
 * @param {string} name — icon name (e.g. 'close', 'chevron-left', 'star-fill')
 * @param {Object} [opts]
 * @param {string} [opts.size]      — 'xs' | 'sm' | 'lg' | 'xl' | '2xl'
 * @param {string} [opts.color]     — 'primary' | 'secondary' | 'positive' | 'negative' | 'warning' | 'info' | 'muted'
 * @param {string} [opts.className] — additional CSS class(es)
 * @param {string} [opts.label]     — accessible label (sets aria-label + role="img")
 * @param {string} [opts.svg]       — one-off glyph (SVG markup or URL) without registering it
 * @returns {HTMLSpanElement}
 */
export function lkIcon(name, opts = {}) {
  const el = document.createElement('span');
  el.className = 'lk-icon' + (name ? ' lk-icon--' + name : '');

  if (opts.size) el.classList.add('lk-icon--' + opts.size);
  if (opts.color) el.classList.add('lk-icon--' + opts.color);
  if (opts.className) el.classList.add(...opts.className.split(' ').filter(Boolean));
  if (opts.svg) el.style.setProperty('--lk-icon-src', toSource(opts.svg));

  if (opts.label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', opts.label);
  } else {
    el.setAttribute('aria-hidden', 'true');
  }

  return el;
}
