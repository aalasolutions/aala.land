import { babel } from '@rollup/plugin-babel';
import { Addon } from '@embroider/addon-dev/rollup';

const addon = new Addon({ srcDir: 'src', destDir: 'dist' });

export default {
  output: addon.output(),

  plugins: [
    addon.publicEntrypoints(['**/*.js']),

    // Re-exported into the consuming app's namespace, so <Nuvo::Button />,
    // {{anchor}} and @service notifications resolve with no import.
    addon.appReexports(
      [
        'components/**/*.js',
        'services/**/*.js',
        'modifiers/**/*.js',
        'helpers/**/*.js',
      ],
      {
        // Leading dash marks a kit-private module: importable by path, never resolvable
        // as a component.
        exclude: ['components/**/-*.js'],
      },
    ),

    addon.hbs(),
    addon.dependencies(),

    babel({ extensions: ['.js'], babelHelpers: 'inline' }),

    addon.keepAssets(['**/*.css', '**/*.scss']),
    addon.clean(),
  ],
};
