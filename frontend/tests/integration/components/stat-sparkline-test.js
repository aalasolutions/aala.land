import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { find, findAll, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { Chart } from 'chart.js';
import {
  formatCalendarDate,
  formatCalendarRange,
  todayInZone,
} from 'land/utils/local-date';
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

  // The component no longer knows the period, so the fallback cannot name one.
  test('captions default to a period-free label and take an override', async function (assert) {
    await render(hbs`<StatSparkline @points={{this.points}} />`);
    assert.dom('[data-test-chart-canvas-table] caption').hasText('Totals');
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

  test('a point with bounds reads as the span it covers, not as a month', async function (assert) {
    this.points = [
      { from: '2026-09-08', to: '2026-09-14', value: 200 },
      { from: '2026-09-15', to: '2026-09-21', value: 300 },
    ];
    await render(hbs`<StatSparkline @points={{this.points}} />`);

    const span = (from, to) => formatCalendarRange(from, to, locale());
    assert.deepEqual(cells(), [
      { label: span('2026-09-08', '2026-09-14'), value: money(200, 'AED') },
      { label: span('2026-09-15', '2026-09-21'), value: money(300, 'AED') },
    ]);
  });

  test('a span outside the current year names its year, a current-year span does not', async function (assert) {
    const year = Number(todayInZone(null).slice(0, 4));
    this.points = [
      { from: `${year - 1}-03-31`, to: `${year - 1}-06-28`, value: 1 },
      { from: `${year}-01-05`, to: `${year}-01-11`, value: 2 },
    ];
    await render(hbs`<StatSparkline @points={{this.points}} />`);

    const labels = cells().map((cell) => cell.label);
    assert.true(labels[0].includes(String(year - 1)), labels[0]);
    assert.false(labels[1].includes(String(year)), labels[1]);
    assert.true(labels[1].startsWith('5–11 Jan'), labels[1]);
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
    assert.strictEqual(dataset.borderColor, token('--wu-brand'));

    await render(
      hbs`<StatSparkline @points={{this.points}} @variant="danger" />`,
    );
    dataset = Chart.getChart(find('[data-test-chart-canvas-el]')).data
      .datasets[0];
    assert.strictEqual(dataset.borderColor, token('--wu-danger'));

    await render(
      hbs`<StatSparkline @points={{this.points}} @variant="secondary" />`,
    );
    dataset = Chart.getChart(find('[data-test-chart-canvas-el]')).data
      .datasets[0];
    assert.strictEqual(dataset.borderColor, token('--wu-info'));
  });
});
