import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

let counter = 0;

function lookupTemplate(owner, fullName) {
  const template = owner.lookup(fullName);
  return typeof template === 'function' ? template(owner) : template;
}

// Renders a route template as the router outlet does: `this` is the controller, `@model` the model.
// Uses the same outlet-state entry point as render() in @ember/test-helpers.
export async function renderRouteTemplate(
  context,
  template,
  { name, controller, model },
) {
  await render(hbs``);
  const { owner } = context;
  const fullName = `template:-route-under-test-${++counter}`;
  owner.register(fullName, template);
  controller.model = model;

  owner.lookup('-top-level-view:main').setOutletState({
    render: {
      owner,
      into: undefined,
      outlet: 'main',
      name: 'application',
      controller: undefined,
      ViewClass: undefined,
      template: lookupTemplate(owner, 'template:-outlet'),
    },
    outlets: {
      main: {
        render: {
          owner,
          into: undefined,
          outlet: 'main',
          name,
          controller,
          model,
          ViewClass: undefined,
          template: lookupTemplate(owner, fullName),
          outlets: {},
        },
        outlets: {},
      },
    },
  });
  await settled();
}
