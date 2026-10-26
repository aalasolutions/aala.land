import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

export default defineConfig({
  plugins: [
    classicEmberSupport(),
    ember(),
    babel({
      babelHelpers: 'runtime',
      extensions,
    }),
  ],
  resolve: {
    alias: [
      {
        // @wovenui/core's exports map hides the src/ partials the uikit imports
        find: /^@wovenui\/core\/src\//,
        replacement: fileURLToPath(
          new URL('./node_modules/@wovenui/core/src/', import.meta.url),
        ),
      },
      {
        // Sass does not read the package exports map; point it at the kit stylesheets.
        find: /^@wovenui\/ember\/styles\//,
        replacement: fileURLToPath(
          new URL('./wovenui/styles/', import.meta.url),
        ),
      },
    ],
  },
});
