import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/js/index.js',

  output: {
    file:      'dist/look.js',
    format:    'umd',
    name:      'Look',
    exports:   'named',
    sourcemap: false,
  },

  plugins: [
    resolve(),
  ],
};
