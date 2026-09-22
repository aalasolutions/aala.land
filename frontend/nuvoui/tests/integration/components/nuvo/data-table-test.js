import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/data-table', function (hooks) {
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
      hbs`<Nuvo::DataTable @columns={{this.columns}} @rows={{this.rows}} />`,
    );

    assert.strictEqual(this.element.querySelectorAll('tbody tr').length, 2);
  });

  test('a function is asked per row', async function (assert) {
    this.getRowClass = (row) => (row.status === 'CANCELLED' ? 'is-muted' : '');

    await render(
      hbs`<Nuvo::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass={{this.getRowClass}} />`,
    );

    const classes = rowClasses(this.element);
    assert.notOk(classes[0].includes('is-muted'), 'live row is not muted');
    assert.ok(classes[1].includes('is-muted'), 'cancelled row is muted');
  });

  test('a string applies to every row', async function (assert) {
    await render(
      hbs`<Nuvo::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass="is-muted" />`,
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
      hbs`<Nuvo::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass={{this.notCallable}} />`,
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
      hbs`<Nuvo::DataTable @columns={{this.columns}} @rows={{this.rows}} @getRowClass={{this.getRowClass}} />`,
    );

    for (const className of rowClasses(this.element)) {
      assert.notOk(className.includes('undefined'));
    }
  });
});
