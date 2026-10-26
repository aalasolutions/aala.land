import Controller, { inject as controller } from '@ember/controller';

export default class WovenIndexController extends Controller {
  // The page index mirrors the layout's navigation so the two cannot drift.
  @controller('woven') layout;

  code = {
    styles: `// app/styles/app.scss
@use "wovenui" as *;        // @wovenui/core: tokens, utilities, element baseline
@use "@wovenui/ember/styles/index" as *; // kit: .wu-* component classes`,
    hosts: `{{! app/templates/application.hbs, after the routed content }}
{{outlet}}

<Woven::ToastRegion />
<Woven::LayerHost />
<Woven::TooltipHost />
<Woven::DialogHost />`,
    theme: `:root {
  --wu-brand: #1ab5a5; /* every m-primary surface follows */
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
        'Tokens, colour scales, utility classes and the element baseline. Configured per app in app/styles/_wovenui.scss.',
    },
    {
      name: '@wovenui/kit',
      signature: '@wovenui/ember/styles/',
      description:
        'The SCSS component layer. Every component is a .wu-* block with m-* modifiers and is-* states; no JavaScript.',
    },
    {
      name: '@wovenui/ember',
      signature: '@wovenui/ember/components/woven/',
      description:
        'Glimmer components over the kit classes plus the hosts, services and modifiers behind them.',
    },
  ];
}
