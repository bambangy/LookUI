import { readFileSync } from 'node:fs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const banner = `/*!
 * LookUI v${pkg.version}
 * (c) 2026 ${pkg.author.name} | ${pkg.homepage}
 * Released under the ${pkg.license} License. This notice must be retained in all copies.
 */`;

// LOOK_DIST=<dir> builds somewhere else (parallel work / tests); default is dist/
const DIST = process.env.LOOK_DIST || 'dist';

const umd = { format: 'umd', name: 'Look', exports: 'named', sourcemap: false, banner };

export default {
  input: 'src/js/index.js',

  output: [
    { ...umd, file: DIST + '/look.js' },
    // terser keeps /*! */ comments, so the banner survives minification
    { ...umd, file: DIST + '/look.min.js', plugins: [terser()] },
    { file: DIST + '/look.esm.js', format: 'es', sourcemap: false, banner },
    // .cjs so Node's require() works despite "type": "module" in package.json
    { file: DIST + '/look.cjs', format: 'cjs', exports: 'named', sourcemap: false, banner },
  ],

  plugins: [
    resolve(),
  ],
};
