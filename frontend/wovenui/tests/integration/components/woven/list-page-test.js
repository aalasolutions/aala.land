import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/list-page', function (hooks) {
  setupRenderingTest(hooks);

  test('root, order of rows and header without meta', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="Contacts" data-test-page>
        <:action><button type="button" data-test-action>New</button></:action>
        <:summary><div data-test-stats>Stats</div></:summary>
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
      children[1].matches('[data-test-wu-list-page-summary]'),
      'summary second',
    );
    assert.dom('[data-test-wu-list-page-summary] [data-test-stats]').exists();
    assert.ok(
      children[2].matches('[data-test-wu-list-page-switcher]'),
      'switcher third',
    );
    assert.ok(
      children[3].matches('[data-test-wu-list-page-toolbar]'),
      'toolbar fourth',
    );
    assert.ok(children[4].matches('[data-test-body]'), 'body fifth');
    assert.ok(children[5].matches('[data-test-footer]'), 'footer last');

    assert.dom('[data-test-wu-page-header-title]').hasText('Contacts');
    assert
      .dom('[data-test-wu-page-header-actions] [data-test-action]')
      .exists();
    assert.dom('[data-test-wu-page-header-meta]').doesNotExist();
  });

  test('the toolbar renders without a toolbar block, options last on the right', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="Vendors">
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    const toolbar = this.element.querySelector(
      '[data-test-wu-list-page-toolbar]',
    );
    assert.ok(toolbar, 'toolbar is always rendered');
    assert.dom('[data-test-wu-list-page-switcher]').doesNotExist();
    assert.dom('[data-test-wu-list-page-summary]').doesNotExist();

    const end = toolbar.lastElementChild;
    assert.ok(
      end.matches('[data-test-wu-list-page-toolbar-end]'),
      'end group is the last toolbar child',
    );
    assert.ok(
      end.lastElementChild.matches('[data-test-wu-list-page-options]'),
      'options host is the last control on the right',
    );
  });

  test('subtitle reaches the page header', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="Team" @subtitle="People in this company">
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    assert
      .dom('[data-test-wu-page-header-subtitle]')
      .hasText('People in this company');
    assert.dom('[data-test-wu-page-header-actions]').doesNotExist();
  });

  test('the options host receives a DataTable Options trigger', async function (assert) {
    this.columns = [
      { name: 'Name', valuePath: 'name' },
      { name: 'Email', valuePath: 'email' },
    ];
    this.rows = [{ id: '1', name: 'Ada', email: 'ada@example.com' }];

    await render(hbs`
      <Woven::ListPage @title="List">
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
      <Woven::ListPage @title="List" @isEmpty={{this.isEmpty}}>
        <:summary><div data-test-stats>Stats</div></:summary>
        <:body><div data-test-body>Body</div></:body>
        <:empty><div data-test-empty>Nothing</div></:empty>
      </Woven::ListPage>
    `);

    assert.dom('[data-test-empty]').exists();
    assert.dom('[data-test-body]').doesNotExist();
    assert.dom('[data-test-stats]').exists('summary stays while empty');

    this.set('isEmpty', false);
    assert.dom('[data-test-body]').exists();
    assert.dom('[data-test-empty]').doesNotExist();
  });

  test('@hideSwitcher drops the switcher row even with a switcher block', async function (assert) {
    this.set('hideSwitcher', true);
    await render(hbs`
      <Woven::ListPage @title="List" @hideSwitcher={{this.hideSwitcher}}>
        <:switcher><span data-test-switch>Tabs</span></:switcher>
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    assert.dom('[data-test-wu-list-page-switcher]').doesNotExist();
    assert.dom('[data-test-switch]').doesNotExist();

    this.set('hideSwitcher', false);
    assert.dom('[data-test-wu-list-page-switcher] [data-test-switch]').exists();
  });

  test('toolbar dropdowns keep their own width and a segmented control scrolls inside itself', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="List">
        <:toolbar>
          <Woven::Dropdown @align="start" @options={{array "Alpha" "Beta"}} @placeholder="All" />
        </:toolbar>
        <:toolbarEnd>
          <Woven::Segmented
            @options={{array (hash value="a" label="First") (hash value="b" label="Second")}}
            @value="a"
          />
        </:toolbarEnd>
        <:body>Body</:body>
      </Woven::ListPage>
    `);

    const toolbar = this.element.querySelector(
      '[data-test-wu-list-page-toolbar]',
    );
    assert.dom(toolbar).hasClass('wu-list-page-toolbar');
    assert
      .dom('[data-test-wu-list-page-toolbar-end]')
      .hasClass('wu-list-page-toolbar-end');

    const wrap = toolbar.querySelector('.wu-dropdown-wrap');
    assert.ok(
      wrap.getBoundingClientRect().width <
        toolbar.getBoundingClientRect().width,
      'the dropdown does not fill the row',
    );

    const segmented = toolbar.querySelector('.wu-segmented');
    assert.strictEqual(getComputedStyle(segmented).overflowX, 'auto');
    assert.strictEqual(getComputedStyle(segmented).maxWidth, '100%');
  });

  test('the yielded Pager prints the range only', async function (assert) {
    await render(hbs`
      <Woven::ListPage @title="List">
        <:body>Body</:body>
        <:footer as |page|>
          <page.Pager @page={{1}} @limit={{50}} @total={{120}} />
        </:footer>
      </Woven::ListPage>
    `);

    assert.dom('[data-test-wu-pagination-status]').hasText('1-50');
  });
});
