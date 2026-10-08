// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Regenerates docs/lookui-theme.css (the downloadable theme template) from the
// token files in src/scss/tokens. Run after changing a default token: npm run docs:theme
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ['Colors', 'src/scss/tokens/_color.scss'],
  ['Typography', 'src/scss/tokens/_typography.scss'],
  ['Layout, shape, motion & layers', 'src/scss/tokens/_layout.scss'],
];

const out = [];
out.push(`/*
 * LookUI theme template — every global design token with its default value.
 *
 * 1. Copy this file into your project (e.g. css/lookui-theme.css).
 * 2. Uncomment and change only the keys you need; leave the rest commented so
 *    they keep following LookUI's defaults when you upgrade.
 * 3. Load it AFTER look.css:
 *      <link rel="stylesheet" href="…/look.css">
 *      <link rel="stylesheet" href="css/lookui-theme.css">
 *
 * Guide: https://bambangy.github.io/LookUI/docs/customize.html
 */

:root {`);

for (const [title, file] of files) {
  const src = readFileSync(`${root}/${file}`, 'utf8').replace(/\r\n/g, '\n');
  const body = src.slice(src.indexOf(':root {') + 7);
  const lines = body.split('\n');
  out.push('', `  /* ===== ${title} ${'='.repeat(Math.max(4, 66 - title.length))} */`);
  let pending = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '}') break;
    if (pending) {
      pending.value += ' ' + line.replace(/\s*\/\/.*$/, '');
      if (line.includes(';')) { emit(pending); pending = null; }
      continue;
    }
    const section = line.match(/^\/\/\s*-{2,}\s*(.+?)\s*-{2,}\s*$/);
    if (section) { out.push('', `  /* --- ${section[1]} --- */`); continue; }
    const m = line.match(/^(--lk-[a-z0-9-]+):\s*(.*)$/);
    if (!m) continue;
    let comment = (m[2].match(/\/\/\s*(.*)$/) || [])[1] || '';
    // Design notes comparing with other libraries are for maintainers, not themers
    if (/Bootstrap|Quasar|pure #/.test(comment)) comment = comment.split(/,| \(| —/)[0].trim();
    const value = m[2].replace(/\s*\/\/.*$/, '');
    const item = { name: m[1], value, comment };
    if (value.includes(';')) emit(item); else pending = item;
  }
}

function emit({ name, value, comment }) {
  const v = value.replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();
  const decl = `/* ${name}: ${v}; */`;
  out.push(`  ${decl}${comment ? ' '.repeat(Math.max(1, 52 - decl.length)) + `/* ${comment.replace(/\*\//g, '')} */` : ''}`);
}

out.push(`}

/* ===== Component variables (optional) ==================================
 * Set on :root for all instances, or on a selector for some of them.
 *
 * .lk-carousel { --lk-carousel-duration: 600ms; --lk-carousel-easing: ease-in-out; --lk-carousel-arrow-size: 2.5rem; }
 * .lk-chip     { --lk-chip-height: 1.75rem; }
 * .lk-tabs     { --lk-tabs-active: var(--lk-accent); --lk-tabs-pad-x: 1rem; --lk-tabs-pad-y: 0.5rem; }
 * .lk-date     { --lk-date-holiday: #c62828; }
 * .lk-slider   { --lk-slider-color: var(--lk-positive); }
 * .lk-timeline { --lk-timeline-dot: var(--lk-accent); }
 * .lk-modal    { --lk-modal-enter-duration: 320ms; --lk-modal-exit-duration: 200ms; }
 */

/* ===== Dark theme (optional) ===========================================
 * LookUI has no built-in dark mode: a dark theme is a set of overrides.
 *
 * [data-theme="dark"] {
 *   --lk-bg:            #121218;
 *   --lk-bg-subtle:     #1b1b24;
 *   --lk-surface:       #22222d;
 *   --lk-text:          #ececf1;
 *   --lk-text-muted:    #a0a0ad;
 *   --lk-border:        #34343f;
 *   --lk-border-strong: #4a4a57;
 *   --lk-secondary-dark: #cfd8dc;
 *   --lk-shadow-color:  0 0 0;
 * }
 */
`);

writeFileSync(`${root}/docs/lookui-theme.css`, out.join('\n'));
console.log('docs/lookui-theme.css written');
