import Controller, { inject as controller } from '@ember/controller';

export default class WovenIndexController extends Controller {
  // The page index mirrors the layout's navigation so the two cannot drift.
  @controller('woven') layout;

  code = {
    styles: `// app/styles/app.scss
@use "wovenui" as *;        // @wovenui/core: tokens, utilities, element baseline
@use "@wovenui/ember/styles/index" as *; // CSS kit bundle plus the Ember-only parts

// Inside @wovenui/ember/styles/index.scss: one bundle, unused components off
@use "@wovenui/components" with ($components: ("code-block": false, "data-table": false));`,
    hosts: `{{! app/templates/application.hbs, after the routed content }}
{{outlet}}

<Woven::ToastRegion />
<Woven::LayerHost />
<Woven::TooltipHost />
<Woven::DialogHost />`,
    theme: `:root {
  --wu-brand: #1ab5a5; /* every brand surface follows */
}

.checkout .wu-btn {
  --wu-btn--BackgroundColor: var(--wu-success); /* one instance, no SCSS */
}`,
    rtl: `<html dir="rtl">`,
  };

  packages = [
    {
      name: '@wovenui/core',
      signature: 'node_modules/@wovenui/core',
      description:
        'Tokens, color scales, utility classes and the element baseline. Configured per app in app/styles/_wovenui.scss.',
    },
    {
      name: '@wovenui/components',
      signature: 'node_modules/@wovenui/components',
      description:
        'The CSS kit: .wu-* blocks with bare compound modifiers (wu-btn brand sm) and state in ARIA attributes, emitted in @layer components. Loaded as one bundle; its optional script is not loaded.',
    },
    {
      name: '@wovenui/ember',
      signature: '@wovenui/ember/components/woven/',
      description:
        'Glimmer components that render the CSS kit markup, plus the hosts, services and modifiers behind them and the parts the kit lacks (layer, tooltip, data table).',
    },
  ];
}
