import { render } from '@ember/test-helpers';
import {
  capabilities,
  setComponentManager,
  setComponentTemplate,
} from '@ember/component';
import { hbs } from 'ember-cli-htmlbars';

// Renders a route template as the router outlet does: `this` is the controller, `@model` the model.
export async function renderRouteTemplate(
  context,
  template,
  { controller, model },
) {
  controller.model = model;

  const RouteUnderTest = setComponentTemplate(template, class {});
  setComponentManager(
    () => ({
      capabilities: capabilities('3.13', {
        destructor: false,
        asyncLifecycleCallbacks: false,
      }),
      createComponent: () => controller,
      getContext: (component) => component,
    }),
    RouteUnderTest,
  );

  context.routeUnderTest = RouteUnderTest;
  context.routeModel = model;
  await render(hbs`<this.routeUnderTest @model={{this.routeModel}} />`);
}
