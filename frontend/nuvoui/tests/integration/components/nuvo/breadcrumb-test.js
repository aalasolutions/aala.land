import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/breadcrumb', function (hooks) {
  setupRenderingTest(hooks);

  test('marks the last item as the current page by default', async function (assert) {
    this.items = [
      { label: 'Properties', href: '/properties' },
      { label: 'Marina' },
    ];
    await render(hbs`<Nuvo::Breadcrumb @items={{this.items}} />`);

    assert.dom('[data-test-nu-breadcrumb-link]').exists({ count: 1 });
    assert.dom('[data-test-nu-breadcrumb-current]').hasText('Marina');
  });

  test('@parentsOnly links every item and marks none current', async function (assert) {
    this.owner.setupRouter();
    this.items = [
      { label: 'Components', route: 'nuvo.index' },
      { label: 'Page header', route: 'nuvo.page-header' },
    ];
    await render(
      hbs`<Nuvo::Breadcrumb @items={{this.items}} @parentsOnly={{true}} />`,
    );

    assert.dom('[data-test-nu-breadcrumb-current]').doesNotExist();
    assert.dom('[data-test-nu-breadcrumb-link]').exists({ count: 2 });
    assert
      .dom(
        '[data-test-nu-breadcrumb-item]:last-child [data-test-nu-breadcrumb-link]',
      )
      .hasAttribute('href', '/nuvo/page-header');
  });

  test('a null model links with no models', async function (assert) {
    this.owner.setupRouter();
    this.items = [{ label: 'Page header', route: 'nuvo.page-header', model: null }];
    await render(
      hbs`<Nuvo::Breadcrumb @items={{this.items}} @parentsOnly={{true}} />`,
    );

    assert
      .dom('[data-test-nu-breadcrumb-link]')
      .hasAttribute('href', '/nuvo/page-header');
  });
});
