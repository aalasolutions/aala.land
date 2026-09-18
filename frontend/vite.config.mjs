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
        // @nuvoui/core's exports map hides the src/ partials the uikit imports
        find: /^@nuvoui\/core\/src\//,
        replacement: fileURLToPath(
          new URL('./node_modules/@nuvoui/core/src/', import.meta.url),
        ),
      },
    ],
  },
});
