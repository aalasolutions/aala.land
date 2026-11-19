import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/list-page', function (hooks) {
  setupRenderingTest(hooks);

  const count = '[data-test-wu-list-page-count]';

  test('root, order of rows and header without meta', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="Contacts" @count={{38}} @noun="contact" @nounPlural="contacts" data-test-page>
        <:action><button type="button" data-test-action>New</button></:action>
        <:switcher><span data-test-switch>Tabs</span></:switcher>
        <:toolbar><span data-test-filter>Filter</span></:toolbar>
        <:body><div data-test-body>Body</div></:body>
        <:footer><div data-test-footer>Pager</div></:footer>
      </Woven::ListPage>
    `);

    const root = this.element.querySelector('[data-test-wu-list-page]');
    assert.dom(root).hasClass('flex').hasClass('col').hasClass('gap-4');
    assert.dom(root).hasAttribute('data-test-page');

    const children = Array.from(root.children);
    assert.ok(
      children[0].matches('[data-test-wu-page-header]'),
      'header first',
    );
    assert.ok(
      children[1].matches('[data-test-wu-list-page-switcher]'),
      'switcher second',
    );
    assert.ok(
      children[2].matches('[data-test-wu-list-page-toolbar]'),
      'toolbar third',
    );
    assert.ok(children[3].matches('[data-test-body]'), 'body fourth');
    assert.ok(children[4].matches('[data-test-footer]'), 'footer last');

    assert.dom('[data-test-wu-page-header-title]').hasText('Contacts');
    assert
      .dom('[data-test-wu-page-header-actions] [data-test-action]')
      .exists();
    assert.dom('[data-test-wu-page-header-meta]').doesNotExist();
  });

  test('the toolbar renders without a toolbar block, count first, options last', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="Vendors" @count={{3}} @noun="vendor" @nounPlural="vendors">
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    const toolbar = this.element.querySelector(
      '[data-test-wu-list-page-toolbar]',
    );
    assert.ok(toolbar, 'toolbar is always rendered');
    assert.ok(toolbar.firstElementChild.matches(count), 'count is first');
    assert.dom(count).hasAttribute('role', 'status');
    assert.dom('[data-test-wu-list-page-switcher]').doesNotExist();

    const end = toolbar.lastElementChild;
    assert.ok(
      end.lastElementChild.matches('[data-test-wu-list-page-options]'),
      'options host is the last control on the right',
    );
  });

  test('subtitle reaches the page header', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="Team" @subtitle="People in this company" @count={{2}} @noun="member" @nounPlural="members">
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    assert
      .dom('[data-test-wu-page-header-subtitle]')
      .hasText('People in this company');
    assert.dom('[data-test-wu-page-header-actions]').doesNotExist();
  });

  test('count text', async function (assert) {
    this.setProperties({
      count: 38,
      total: undefined,
      filtered: false,
      noun: 'contact',
      nounPlural: 'contacts',
    });
    await render(hbs`
      <Woven::ListPage
        @title="List"
        @count={{this.count}}
        @total={{this.total}}
        @filtered={{this.filtered}}
        @noun={{this.noun}}
        @nounPlural={{this.nounPlural}}
        @locale="en-US"
      >
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    assert.dom(count).hasText('38 contacts', 'unfiltered, no total');

    this.set('total', 38);
    assert.dom(count).hasText('38 contacts', 'total equals count, no filter');

    this.set('filtered', true);
    assert
      .dom(count)
      .hasText('38 of 38 contacts', 'total equals count under a filter');

    this.setProperties({
      count: 15,
      filtered: false,
      noun: 'property',
      nounPlural: 'properties',
    });
    assert.dom(count).hasText('15 of 38 properties', 'filtered');

    this.setProperties({ count: 1, total: undefined });
    assert.dom(count).hasText('1 property', 'one');

    this.set('total', 38);
    assert.dom(count).hasText('1 of 38 properties', 'one of many');

    this.setProperties({ count: 0, total: undefined });
    assert.dom(count).hasText('0 properties', 'zero');

    this.setProperties({ count: 1234, total: undefined });
    assert.dom(count).hasText('1,234 properties', 'grouping');
  });

  test('the options host receives a DataTable Options trigger', async function (assert) {
    this.columns = [
      { name: 'Name', valuePath: 'name' },
      { name: 'Email', valuePath: 'email' },
    ];
    this.rows = [{ id: '1', name: 'Ada', email: 'ada@example.com' }];

    await render(hbs`
      <Woven::ListPage @title="List" @count={{1}} @noun="row" @nounPlural="rows">
        <:body as |page|>
          <Woven::DataTable
            @columns={{this.columns}}
            @rows={{this.rows}}
            @showOptions={{true}}
            @optionsTarget={{page.optionsTarget}}
          />
        </:body>
      </Woven::ListPage>
    `);

    assert
      .dom('[data-test-wu-list-page-options] [data-test-data-table-options]')
      .exists();
    assert.dom('.data-table-shell__toolbar').doesNotExist();
    assert.dom('[data-test-data-table-options]').exists({ count: 1 });
  });

  test('@isEmpty swaps the body for the empty block', async function (assert) {
    this.set('isEmpty', true);
    await render(hbs`
      <Woven::ListPage @title="List" @count={{0}} @noun="row" @nounPlural="rows" @isEmpty={{this.isEmpty}}>
        <:body><div data-test-body>Body</div></:body>
        <:empty><div data-test-empty>Nothing</div></:empty>
      </Woven::ListPage>
    `);

    assert.dom('[data-test-empty]').exists();
    assert.dom('[data-test-body]').doesNotExist();

    this.set('isEmpty', false);
    assert.dom('[data-test-body]').exists();
    assert.dom('[data-test-empty]').doesNotExist();
  });

  test('@hideCount drops the count and keeps the toolbar', async function (assert) {
    this.set('hideCount', true);
    await render(hbs`
      <Woven::ListPage @title="List" @count={{4}} @noun="row" @nounPlural="rows" @hideCount={{this.hideCount}}>
        <:toolbar><span data-test-filter>Filter</span></:toolbar>
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    assert.dom(count).doesNotExist();
    assert.dom('[data-test-wu-list-page-toolbar] [data-test-filter]').exists();
    assert.dom('[data-test-wu-list-page-options]').exists();

    this.set('hideCount', false);
    assert.dom(count).hasText('4 rows');
  });

  test('the yielded Pager prints the range only', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="List" @count={{120}} @noun="row" @nounPlural="rows">
        <:body>Body</:body>
        <:footer as |page|>
          <page.Pager @page={{1}} @limit={{50}} @total={{120}} />
        </:footer>
      </Woven::ListPage>
    `);

    assert.dom('[data-test-wu-pagination-status]').hasText('1-50');
  });
});
