import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { find, findAll, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { Chart } from 'chart.js';
import { formatCalendarDate } from 'land/utils/local-date';
import { token } from 'land/utils/chart-style';

// Assertions check the ChartCanvas table, the only reader-accessible output.
module('Integration | Component | stat-sparkline', function (hooks) {
  setupRenderingTest(hooks);

  const POINTS = [
    { month: '2026-01', value: 1200 },
    { month: '2026-02', value: '1500.4' },
  ];

  const locale = () => navigator.language || 'en';

  function money(value, currency) {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function monthLabel(month) {
    return formatCalendarDate(`${month}-01`, locale(), { month: 'short' });
  }

  function cells() {
    return findAll('[data-test-chart-canvas-table] tbody tr').map((row) => ({
      label: row.querySelector('th').textContent.trim(),
      value: row.querySelector('td').textContent.trim(),
    }));
  }

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
    };
    this.points = POINTS;
  });

  test('labels each point by month and formats it in the active currency', async function (assert) {
    await render(hbs`<StatSparkline @points={{this.points}} />`);

    assert.dom('[data-test-stat-sparkline]').exists();
    assert.deepEqual(cells(), [
      { label: monthLabel('2026-01'), value: money(1200, 'AED') },
      {
        label: monthLabel('2026-02'),
        value: money(1500.4, 'AED'),
      },
    ]);
  });

  test('the same numbers read in whichever currency the region uses', async function (assert) {
    await render(hbs`<StatSparkline @points={{this.points}} />`);
    this.owner.lookup('service:region').activeRegion = {
      code: 'ksa',
      currency: 'SAR',
    };
    await render(hbs`<StatSparkline @points={{this.points}} />`);

    assert.strictEqual(cells()[0].value, money(1200, 'SAR'));
  });

  test('a value that is not a number reads as zero, never NaN', async function (assert) {
    this.points = [{ month: '2026-01', value: 'not a number' }];
    await render(hbs`<StatSparkline @points={{this.points}} />`);

    assert.strictEqual(cells()[0].value, money(0, 'AED'));
  });

  test('without an active region the amounts stay readable', async function (assert) {
    this.owner.lookup('service:region').activeRegion = null;
    // No currency code means Intl rejects the format; the fallback is reported.
    const originalError = console.error;
    console.error = () => {};
    try {
      await render(hbs`<StatSparkline @points={{this.points}} />`);
    } finally {
      console.error = originalError;
    }

    assert.strictEqual(cells()[0].value, (1200).toLocaleString(locale()));
  });

  test('captions default to monthly totals and take an override', async function (assert) {
    await render(hbs`<StatSparkline @points={{this.points}} />`);
    assert
      .dom('[data-test-chart-canvas-table] caption')
      .hasText('Monthly totals');
    assert
      .dom('[data-test-chart-canvas-table] thead th:last-child')
      .hasText('Amount');

    await render(
      hbs`<StatSparkline @points={{this.points}} @caption="Net by month" />`,
    );
    assert
      .dom('[data-test-chart-canvas-table] caption')
      .hasText('Net by month');
  });

  test('renders with no points at all', async function (assert) {
    await render(hbs`<StatSparkline />`);

    assert.dom('[data-test-stat-sparkline]').exists();
    assert.strictEqual(cells().length, 0);
  });

  test('@variant picks the line colour, defaulting to primary', async function (assert) {
    await render(hbs`<StatSparkline @points={{this.points}} />`);
    let dataset = Chart.getChart(find('[data-test-chart-canvas-el]')).data
      .datasets[0];
    assert.strictEqual(dataset.borderColor, token('--primary'));

    await render(
      hbs`<StatSparkline @points={{this.points}} @variant="danger" />`,
    );
    dataset = Chart.getChart(find('[data-test-chart-canvas-el]')).data
      .datasets[0];
    assert.strictEqual(dataset.borderColor, token('--danger'));
  });
});
