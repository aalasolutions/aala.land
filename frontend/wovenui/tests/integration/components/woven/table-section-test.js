import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/table-section', function (hooks) {
  setupRenderingTest(hooks);

  const head = '[data-test-wu-table-section-head]';

  hooks.beforeEach(function () {
    this.columns = [
      { name: 'Name', valuePath: 'name' },
      { name: 'Email', valuePath: 'email' },
    ];
    this.rows = [{ id: '1', name: 'Ada', email: 'ada@example.com' }];
  });

  test('heading row: title with icon on the left, actions then options on the right', async function (assert) {
    await render(hbs`
      <Woven::TableSection @title="History" @icon="clock" data-test-section>
        <:actions><button type="button" data-test-action>Add</button></:actions>
        <:body><div data-test-body>Body</div></:body>
      </Woven::TableSection>
    `);

    const root = this.element.querySelector('[data-test-wu-table-section]');
    assert.strictEqual(root.tagName, 'SECTION');
    assert.dom(root).hasClass('flex').hasClass('col').hasClass('gap-3');
    assert.dom(root).hasAttribute('data-test-section');
    assert.ok(root.firstElementChild.matches(head), 'heading row first');
    assert.ok(
      root.lastElementChild.matches('[data-test-body]'),
      'body directly under the heading row',
    );

    assert.dom(head).hasClass('wu-table-section-head').isVisible();
    assert.dom('[data-test-wu-table-section-title]').hasTagName('h2');
    assert.dom('[data-test-wu-table-section-title]').hasText('History');
    assert.dom('[data-test-wu-table-section-title] .ph-clock').exists();

    const end = this.element.querySelector('[data-test-wu-table-section-end]');
    assert.ok(end.firstElementChild.matches('[data-test-action]'));
    assert.ok(
      end.lastElementChild.matches('[data-test-wu-table-section-options]'),
      'options host is the last control on the right',
    );
  });

  test('meta renders beside the title, before the right group', async function (assert) {
    await render(hbs`
      <Woven::TableSection @title="Prices">
        <:meta><span data-test-meta>Healthy</span></:meta>
        <:actions><button type="button" data-test-action>Add</button></:actions>
        <:body><div data-test-body>Body</div></:body>
      </Woven::TableSection>
    `);

    const start = this.element.querySelector(
      '[data-test-wu-table-section-start]',
    );
    assert.dom(start).hasClass('flex').hasClass('x-center').hasClass('gap-2');
    assert.ok(
      start.firstElementChild.matches('[data-test-wu-table-section-title]'),
    );
    assert.ok(
      start.lastElementChild.matches('[data-test-meta]'),
      'meta follows the title',
    );
    assert.ok(
      start.nextElementSibling.matches('[data-test-wu-table-section-end]'),
      'left group comes before the right group',
    );
    assert
      .dom('[data-test-wu-table-section-end] [data-test-meta]')
      .doesNotExist();
  });

  test('the options host receives a DataTable Options trigger', async function (assert) {
    await render(hbs`
      <Woven::TableSection>
        <:body as |section|>
          <Woven::DataTable
            @columns={{this.columns}}
            @rows={{this.rows}}
            @showOptions={{true}}
            @optionsTarget={{section.optionsTarget}}
          />
        </:body>
      </Woven::TableSection>
    `);

    assert
      .dom(
        '[data-test-wu-table-section-options] [data-test-data-table-options]',
      )
      .exists();
    assert.dom('.data-table-shell__toolbar').doesNotExist();
    assert.dom('[data-test-data-table-options]').exists({ count: 1 });
    assert.dom(head).isVisible('options alone keep the heading row');
    assert.dom('[data-test-wu-table-section-title]').doesNotExist();
  });

  test('no heading row when there is no title, no actions and no options', async function (assert) {
    await render(hbs`
      <Woven::TableSection>
        <:body><div data-test-body>Body</div></:body>
      </Woven::TableSection>
    `);

    assert.dom(head).isNotVisible();
    assert.dom('[data-test-body]').exists();
  });
});
