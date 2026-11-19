import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/detail-page', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.crumbs = [{ label: 'Contacts', href: '/contacts' }];
  });

  test('root class, parent-only crumbs and the title', async function (assert) {
    await render(hbs`
      <Woven::DetailPage @crumbs={{this.crumbs}} @title="Ada Lovelace" data-test-page>
        <:body><div data-test-body>Body</div></:body>
      </Woven::DetailPage>
    `);

    assert
      .dom('[data-test-wu-detail-page]')
      .hasClass('flex')
      .hasClass('col')
      .hasClass('gap-6')
      .hasAttribute('data-test-page');
    assert.dom('[data-test-wu-breadcrumb-item]').exists({ count: 1 });
    assert.dom('[data-test-wu-breadcrumb-link]').hasText('Contacts');
    assert.dom('[data-test-wu-breadcrumb-current]').doesNotExist();
    assert.dom('h1').hasText('Ada Lovelace');
    assert.dom('[data-test-body]').exists();
    assert.dom('[data-test-wu-page-header-meta]').doesNotExist();
    assert.dom('[data-test-wu-page-header-actions]').doesNotExist();
  });

  test('@titleFallback names a record whose title is empty', async function (assert) {
    this.set('title', '');
    await render(hbs`
      <Woven::DetailPage @crumbs={{this.crumbs}} @title={{this.title}} @titleFallback="Unnamed contact">
        <:body>Body</:body>
      </Woven::DetailPage>
    `);

    assert.dom('h1').hasText('Unnamed contact');

    this.set('title', 'Ada');
    assert.dom('h1').hasText('Ada');
  });

  test('crumb-only header has no h1', async function (assert) {
    await render(hbs`
      <Woven::DetailPage @crumbs={{this.crumbs}}>
        <:body>Body</:body>
      </Woven::DetailPage>
    `);

    assert.dom('[data-test-wu-breadcrumb]').exists();
    assert.dom('h1').doesNotExist();
  });

  test('meta, actions and subtitle slots', async function (assert) {
    await render(hbs`
      <Woven::DetailPage @crumbs={{this.crumbs}} @title="Lease" @subtitle="Unit 4">
        <:meta><span data-test-meta>Active</span></:meta>
        <:actions><button type="button" data-test-edit>Edit</button></:actions>
        <:body>Body</:body>
      </Woven::DetailPage>
    `);

    assert.dom('[data-test-wu-page-header-meta] [data-test-meta]').exists();
    assert.dom('[data-test-wu-page-header-actions] [data-test-edit]').exists();
    assert.dom('[data-test-wu-page-header-subtitle]').hasText('Unit 4');
  });

  test('actions without meta', async function (assert) {
    await render(hbs`
      <Woven::DetailPage @crumbs={{this.crumbs}} @title="Lease">
        <:actions><button type="button" data-test-edit>Edit</button></:actions>
        <:body>Body</:body>
      </Woven::DetailPage>
    `);

    assert.dom('[data-test-wu-page-header-actions] [data-test-edit]').exists();
    assert.dom('[data-test-wu-page-header-meta]').doesNotExist();
  });
});
