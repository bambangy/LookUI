// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Builds dist/look.min.css from dist/look.css.
// SVGO is off: it re-encodes the Look Icons data URIs and makes them larger
// than the hand-encoded originals. cssnano keeps /*! */ comments, so the banner survives.

import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';
import cssnano from 'cssnano';

const css = readFileSync('dist/look.css', 'utf8');
const result = await postcss([cssnano({ preset: ['default', { svgo: false }] })])
  .process(css, { from: 'dist/look.css', to: 'dist/look.min.css' });

writeFileSync('dist/look.min.css', result.css);
