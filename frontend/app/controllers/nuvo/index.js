import Controller, { inject as controller } from '@ember/controller';

export default class NuvoIndexController extends Controller {
  // The page index mirrors the layout's navigation so the two cannot drift.
  @controller('nuvo') layout;

  code = {
    styles: `// app/styles/app.scss
@use "nuvoui" as *;        // @nuvoui/core: tokens, utilities, element baseline
@use "./uikit/index" as *; // kit: .nu-* component classes`,
    hosts: `{{! app/templates/application.hbs, after the routed content }}
{{outlet}}

<Nuvo::ToastRegion />
<Nuvo::LayerHost />
<Nuvo::TooltipHost />
<Nuvo::DialogHost />`,
    theme: `:root {
  --primary: #1ab5a5; /* every m-primary surface follows */
}

.checkout .nu-btn {
  --nu-btn--BackgroundColor: var(--success); /* one instance, no SCSS */
}`,
    rtl: `<html dir="rtl">`,
  };

  packages = [
    {
      name: '@nuvoui/core',
      signature: 'node_modules/@nuvoui/core',
      description:
        'Tokens, colour scales, utility classes and the element baseline. Configured per app in app/styles/_nuvoui.scss.',
    },
    {
      name: '@nuvoui/kit',
      signature: 'app/styles/uikit/',
      description:
        'The SCSS component layer. Every component is a .nu-* block with m-* modifiers and is-* states; no JavaScript.',
    },
    {
      name: '@nuvoui/ember',
      signature: 'app/components/nuvo/',
      description:
        'Glimmer components over the kit classes plus the hosts, services and modifiers behind them.',
    },
  ];
}
