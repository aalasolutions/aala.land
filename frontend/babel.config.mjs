import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  babelCompatSupport,
  templateCompatSupport,
} from '@embroider/compat/babel';
import { stripPropertiesPlugin } from 'strip-test-selectors';

const STRIP_TEST_SELECTORS = process.env.STRIP_TEST_SELECTORS === 'true';

export default {
  plugins: [
    [
      'babel-plugin-ember-template-compilation',
      {
        enableLegacyModules: [
          'ember-cli-htmlbars',
          'ember-cli-htmlbars-inline-precompile',
          'htmlbars-inline-precompile',
        ],
        transforms: [
          ...templateCompatSupport(),
          ...(STRIP_TEST_SELECTORS ? ['strip-test-selectors'] : []),
        ],
      },
    ],
    [
      'module:decorator-transforms',
      {
        runtime: {
          import: fileURLToPath(
            import.meta.resolve('decorator-transforms/runtime-esm'),
          ),
        },
      },
    ],
    [
      '@babel/plugin-transform-runtime',
      {
        absoluteRuntime: dirname(fileURLToPath(import.meta.url)),
        useESModules: true,
        regenerator: false,
      },
    ],
    ...babelCompatSupport(),
    ...(STRIP_TEST_SELECTORS ? [stripPropertiesPlugin()] : []),
  ],

  generatorOpts: {
    compact: false,
  },
};
