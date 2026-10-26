import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

module('Integration | Component | woven/data-table', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.columns = [{ name: 'Name', valuePath: 'name' }];
    this.rows = [
      { id: '1', name: 'Live', status: 'COMPLETED' },
      { id: '2', name: 'Dead', status: 'CANCELLED' },
    ];
  });

  const rowClasses = (element) =>
    Array.from(element.querySelectorAll('tbody tr')).map((tr) => tr.className);

  test('renders without a getRowClass at all', async function (assert) {
    await render(
      hbs`<Woven::DataTable @columns={{this.columns}} @rows={{this.rows}} />`,
    );

    assert.strictEqual(this.element.querySelectorAll('tbody tr').length, 2);
  });

  test('a function is asked per row', async function (assert) {
    this.getRowClass = (row) => (row.status === 'CANCELLED' ? 'is-muted' : '');

    await render(
      hbs`<Woven::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass={{this.getRowClass}} />`,
    );

    const classes = rowClasses(this.element);
    assert.notOk(classes[0].includes('is-muted'), 'live row is not muted');
    assert.ok(classes[1].includes('is-muted'), 'cancelled row is muted');
  });

  test('a string applies to every row', async function (assert) {
    await render(
      hbs`<Woven::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass="is-muted" />`,
    );

    for (const className of rowClasses(this.element)) {
      assert.ok(className.includes('is-muted'));
    }
  });

  // A non-callable must never reach the call site: one throw there takes the
  // whole table down, not just the row.
  test('anything else is ignored instead of breaking the render', async function (assert) {
    this.notCallable = 42;

    await render(
      hbs`<Woven::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass={{this.notCallable}} />`,
    );

    assert.strictEqual(
      this.element.querySelectorAll('tbody tr').length,
      2,
      'the table still renders',
    );
  });

  test('a function returning nothing does not print undefined', async function (assert) {
    this.getRowClass = () => undefined;

    await render(
      hbs`<Woven::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass={{this.getRowClass}} />`,
    );

    for (const className of rowClasses(this.element)) {
      assert.notOk(className.includes('undefined'));
    }
  });

  test('a saved layout keeps pinned columns at their edges and places new columns in line', async function (assert) {
    this.owner.register(
      'service:woven-storage',
      class extends Service {
        get() {
          return { order: ['id', 'email', 'name'], hidden: [], widths: {} };
        }
        set() {}
        remove() {}
      },
    );
    this.columns = [
      { name: 'Name', valuePath: 'name', isFixed: 'left' },
      { name: 'Email', valuePath: 'email' },
      { name: 'Added by', valuePath: 'createdBy' },
      { name: 'Actions', valuePath: 'id', isFixed: 'right' },
    ];

    await render(hbs`
      <Woven::DataTable
        @columns={{this.columns}}
        @rows={{this.rows}}
        @pinColumns={{true}}
        @tableId="layout-test"
      />
    `);

    const headers = Array.from(this.element.querySelectorAll('thead th')).map(
      (th) => th.textContent.trim(),
    );
    assert.deepEqual(headers, ['Name', 'Email', 'Added by', 'Actions']);
  });

  module('column options', function (hooks) {
    hooks.beforeEach(function () {
      this.columns = [
        { name: 'Name', valuePath: 'name' },
        { name: 'Status', valuePath: 'status' },
      ];
    });

    const headers = (element) =>
      Array.from(element.querySelectorAll('thead th')).map((th) =>
        th.textContent.trim(),
      );

    test('the Options trigger renders inside the table shell by default', async function (assert) {
      await render(hbs`
        <Woven::DataTable
          @columns={{this.columns}}
          @rows={{this.rows}}
          @showOptions={{true}}
        />
      `);

      assert
        .dom('.data-table-shell__toolbar [data-test-data-table-options]')
        .exists();
    });

    test('@optionsTarget renders the trigger into that element and still toggles columns', async function (assert) {
      await render(hbs`
        <div id="table-options-slot" data-test-slot></div>
        <Woven::DataTable
          @columns={{this.columns}}
          @rows={{this.rows}}
          @showOptions={{true}}
          @optionsTarget="table-options-slot"
        />
      `);

      assert.dom('[data-test-slot] [data-test-data-table-options]').exists();
      assert.dom('.data-table-shell__toolbar').doesNotExist();
      assert.dom('[data-test-data-table-options]').exists({ count: 1 });

      await click('[data-test-data-table-options]');
      // The popover panel lives on the body-level layer, outside the test root.
      await click(
        document.querySelector(
          '[data-test-data-table-column-toggle="status"] input',
        ),
      );

      assert.deepEqual(headers(this.element), ['Name']);
    });

    test('a missing @optionsTarget element falls back to the shell', async function (assert) {
      await render(hbs`
        <Woven::DataTable
          @columns={{this.columns}}
          @rows={{this.rows}}
          @showOptions={{true}}
          @optionsTarget="no-such-element"
        />
      `);

      assert
        .dom('.data-table-shell__toolbar [data-test-data-table-options]')
        .exists();
    });

    test('an @optionsTarget element registered after the table still receives the trigger', async function (assert) {
      this.set('host', null);
      this.setHost = (element) => this.set('host', element);
      await render(hbs`
        <Woven::DataTable
          @columns={{this.columns}}
          @rows={{this.rows}}
          @showOptions={{true}}
          @optionsTarget={{this.host}}
        />
        <div data-test-late-slot {{did-insert this.setHost}}></div>
      `);

      assert.dom('[data-test-late-slot] [data-test-data-table-options]').exists();
      assert.dom('.data-table-shell__toolbar').doesNotExist();
      assert.dom('[data-test-data-table-options]').exists({ count: 1 });
    });
  });
});
