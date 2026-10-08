// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Loads the built package through every published entry point and checks the
// public API and copyright banners are intact. Run after `npm run build`.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const API = ['lkButton', 'lkDialog', 'lkTable', 'lkToolbar', 'lkDataSource', 'lkIcon', 'lkPhone', 'lkTextPop', 'lkValidation', 'lkTabs', 'lkCarousel'];

function checkApi(label, L) {
  assert.equal(L.version, pkg.version, `${label}: version should match package.json`);
  assert.equal(L.author, pkg.author.name, `${label}: author`);
  assert.equal(L.license, pkg.license, `${label}: license`);
  for (const name of API) assert.equal(typeof L[name], 'function', `${label}: ${name} missing`);
  console.log(`ok  ${label}`);
}

// ESM via package "exports" -> import
checkApi('import', await import(pkg.name));

// CommonJS via package "exports" -> require
checkApi('require', require(pkg.name));

// UMD as a plain <script>: no module system, attaches window.Look
for (const file of ['dist/look.js', 'dist/look.min.js']) {
  const sandbox = {};
  sandbox.self = sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
  checkApi(`script ${file}`, sandbox.Look);
}

// Copyright banners must survive every build, minified ones included
for (const file of ['look.js', 'look.min.js', 'look.esm.js', 'look.cjs', 'look.css', 'look.min.css']) {
  const head = readFileSync(`dist/${file}`, 'utf8').slice(0, 400);
  assert.match(head, /\/\*!\s*\n\s*\* LookUI/, `dist/${file}: banner missing`);
  assert.match(head, /Bambang Yudhotomo/, `dist/${file}: copyright missing`);
}
console.log('ok  banners');
