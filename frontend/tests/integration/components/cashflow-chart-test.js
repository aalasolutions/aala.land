import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { findAll, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { formatCalendarDate } from 'land/utils/local-date';

module('Integration | Component | cashflow-chart', function (hooks) {
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

  function month(value) {
    return formatCalendarDate(`${value}-01`, locale(), { month: 'short' });
  }

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
    };
    this.points = [
      { month: '2026-01', income: '1000', expense: '400' },
      { month: '2026-02', income: '900', expense: null },
    ];
  });

  test('gives every month an income and an expense row, in that order', async function (assert) {
    await render(hbs`<CashflowChart @points={{this.points}} />`);

    assert.dom('[data-test-cashflow-chart]').exists();
    assert.deepEqual(rows(), [
      [`${month('2026-01')} income`, money(1000)],
      [`${month('2026-01')} expense`, money(400)],
      [`${month('2026-02')} income`, money(900)],
      [`${month('2026-02')} expense`, money(0)],
    ]);
  });

  test('names both series for screen readers', async function (assert) {
    await render(hbs`<CashflowChart @points={{this.points}} />`);

    assert
      .dom('[data-test-chart-canvas-table] caption')
      .hasText('Income and expense by month');
    assert
      .dom('[data-test-chart-canvas-table] thead th:last-child')
      .hasText('Amount');
  });

  test('renders with no points at all', async function (assert) {
    await render(hbs`<CashflowChart />`);

    assert.dom('[data-test-cashflow-chart]').exists();
    assert.strictEqual(rows().length, 0);
  });
});
