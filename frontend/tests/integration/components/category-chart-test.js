import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { findAll, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// Folds the per-type rows the API returns into one row per category.
module('Integration | Component | category-chart', function (hooks) {
  setupRenderingTest(hooks);

  const locale = () => navigator.language || 'en';

  function money(value) {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: 'AED',
      maximumFractionDigits: 0,
    }).format(value);
  }

  function rows() {
    return findAll('[data-test-chart-canvas-table] tbody tr').map((row) => [
      row.querySelector('th').textContent.trim(),
      row.querySelector('td').textContent.trim(),
    ]);
  }

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
    };
  });

  test('folds repeated categories together and humanizes the label', async function (assert) {
    this.totals = [
      { category: 'BANK_TRANSFER', type: 'INCOME', total: '100' },
      { category: 'BANK_TRANSFER', type: 'INCOME', total: '50' },
      { category: 'BANK_TRANSFER', type: 'EXPENSE', total: '25' },
    ];
    await render(hbs`<CategoryChart @totals={{this.totals}} />`);

    assert.deepEqual(rows(), [
      ['Bank Transfer income', money(150)],
      ['Bank Transfer expense', money(25)],
    ]);
  });

  test('orders categories by combined size, largest first', async function (assert) {
    this.totals = [
      { category: 'RENT', type: 'INCOME', total: '100' },
      { category: 'MAINTENANCE', type: 'EXPENSE', total: '900' },
      { category: 'FEES', type: 'INCOME', total: '400' },
    ];
    await render(hbs`<CategoryChart @totals={{this.totals}} />`);

    assert.deepEqual(
      rows().map(([label]) => label),
      ['Maintenance expense', 'Fees income', 'Rent income'],
    );
  });

  test('a row with no category is still counted, under Other', async function (assert) {
    this.totals = [{ type: 'INCOME', total: '75' }];
    await render(hbs`<CategoryChart @totals={{this.totals}} />`);

    assert.deepEqual(rows(), [['Other income', money(75)]]);
  });

  test('anything that is not an EXPENSE counts as income', async function (assert) {
    this.totals = [{ category: 'RENT', type: 'REFUND', total: '10' }];
    await render(hbs`<CategoryChart @totals={{this.totals}} />`);

    assert.deepEqual(rows(), [['Rent income', money(10)]]);
  });

  test('a zero side is left out of the table entirely', async function (assert) {
    this.totals = [{ category: 'RENT', type: 'EXPENSE', total: '0' }];
    await render(hbs`<CategoryChart @totals={{this.totals}} />`);

    assert.deepEqual(rows(), [], 'no empty income or expense row');
  });

  test('no data renders the empty state instead of a blank chart', async function (assert) {
    this.totals = [];
    await render(hbs`<CategoryChart @totals={{this.totals}} />`);

    assert.dom('[data-test-category-chart]').doesNotExist();
    assert
      .dom('[data-test-nu-empty-state-description]')
      .hasText('No transactions in this month');

    await render(hbs`<CategoryChart />`);
    assert
      .dom('[data-test-nu-empty-state-description]')
      .exists('and with none');
  });
});
