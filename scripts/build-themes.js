// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Compiles every ready-made theme in src/scss/themes/_<name>.scss into its own standalone
// stylesheet, dist/lookui-theme-<name>.css — loaded by consumers with one extra <link> right
// after look.css, no class/attribute/JS required. Run as part of `npm run build:css`.
// Add a new theme: drop a new src/scss/themes/_<name>.scss file; no other wiring needed.
import { writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const themesDir = resolve(root, 'src/scss/themes');
const distDir = resolve(root, 'dist');

mkdirSync(distDir, { recursive: true });

const files = readdirSync(themesDir).filter((f) => /^_.+\.scss$/.test(f));

for (const file of files) {
  const name = file.replace(/^_/, '').replace(/\.scss$/, '');
  const srcPath = resolve(themesDir, file);
  const compiled = sass.compile(srcPath, { style: 'expanded' });
  const result = await postcss([autoprefixer]).process(compiled.css, { from: srcPath, to: `lookui-theme-${name}.css` });
  const banner = `/*!\n * LookUI — "${name}" ready-made theme\n`
    + ' * Load this file right after look.css — no class, attribute or JS required:\n'
    + ' *   <link rel="stylesheet" href="look.css">\n'
    + ` *   <link rel="stylesheet" href="lookui-theme-${name}.css">\n`
    + ' * Guide: https://bambangy.github.io/LookUI/docs/themes.html\n'
    + ' */\n';
  const outPath = resolve(distDir, `lookui-theme-${name}.css`);
  writeFileSync(outPath, banner + result.css);
  console.log(`dist/lookui-theme-${name}.css written`);

  const minified = await postcss([cssnano({ preset: ['default', { svgo: false }] })])
    .process(result.css, { from: outPath, to: `lookui-theme-${name}.min.css` });
  const minOutPath = resolve(distDir, `lookui-theme-${name}.min.css`);
  writeFileSync(minOutPath, banner + minified.css);
  console.log(`dist/lookui-theme-${name}.min.css written`);
}
