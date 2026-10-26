import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/breadcrumb', function (hooks) {
  setupRenderingTest(hooks);

  test('marks the last item as the current page by default', async function (assert) {
    this.items = [
      { label: 'Properties', href: '/properties' },
      { label: 'Marina' },
    ];
    await render(hbs`<Woven::Breadcrumb @items={{this.items}} />`);

    assert.dom('[data-test-wu-breadcrumb-link]').exists({ count: 1 });
    assert.dom('[data-test-wu-breadcrumb-current]').hasText('Marina');
  });

  test('@parentsOnly links every item and marks none current', async function (assert) {
    this.owner.setupRouter();
    this.items = [
      { label: 'Components', route: 'woven.index' },
      { label: 'Page header', route: 'woven.page-header' },
    ];
    await render(
      hbs`<Woven::Breadcrumb @items={{this.items}} @parentsOnly={{true}} />`,
    );

    assert.dom('[data-test-wu-breadcrumb-current]').doesNotExist();
    assert.dom('[data-test-wu-breadcrumb-link]').exists({ count: 2 });
    assert
      .dom(
        '[data-test-wu-breadcrumb-item]:last-child [data-test-wu-breadcrumb-link]',
      )
      .hasAttribute('href', '/woven/page-header');
  });

  test('a null model links with no models', async function (assert) {
    this.owner.setupRouter();
    this.items = [{ label: 'Page header', route: 'woven.page-header', model: null }];
    await render(
      hbs`<Woven::Breadcrumb @items={{this.items}} @parentsOnly={{true}} />`,
    );

    assert
      .dom('[data-test-wu-breadcrumb-link]')
      .hasAttribute('href', '/woven/page-header');
  });
});
