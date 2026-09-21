import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { findAll, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { formatCalendarDate } from 'land/utils/local-date';

module('Integration | Component | revenue-chart', function (hooks) {
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
    // The API returns monthly totals as strings.
    this.points = [
      { month: '2026-01', total: '1200' },
      { month: '2026-02', total: '0' },
    ];
  });

  test('reads each month total in the active currency', async function (assert) {
    await render(hbs`<RevenueChart @points={{this.points}} />`);

    assert.dom('[data-test-revenue-chart]').exists();
    assert.deepEqual(rows(), [
      [
        formatCalendarDate('2026-01-01', locale(), { month: 'short' }),
        money(1200),
      ],
      [
        formatCalendarDate('2026-02-01', locale(), { month: 'short' }),
        money(0),
      ],
    ]);
  });

  test('falls back to the raw month when it cannot be parsed', async function (assert) {
    this.points = [{ month: 'not-a-month', total: '5' }];
    await render(hbs`<RevenueChart @points={{this.points}} />`);

    assert.deepEqual(rows(), [['not-a-month', money(5)]]);
  });

  test('names the chart for screen readers', async function (assert) {
    await render(hbs`<RevenueChart @points={{this.points}} />`);

    assert
      .dom('[data-test-chart-canvas-table] caption')
      .hasText('Completed revenue by month');
    assert
      .dom('[data-test-chart-canvas-table] thead th:last-child')
      .hasText('Revenue');
  });

  test('renders with no points at all', async function (assert) {
    await render(hbs`<RevenueChart />`);

    assert.dom('[data-test-revenue-chart]').exists();
    assert.strictEqual(rows().length, 0);
  });
});
