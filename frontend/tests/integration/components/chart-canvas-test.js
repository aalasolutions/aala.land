import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  clearRender,
  find,
  findAll,
  render,
  settled,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { Chart } from 'chart.js';

// Animation and responsiveness are off so assertions test the component, not the viewport.
function lineConfig(values) {
  return {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb'],
      datasets: [{ data: values }],
    },
    options: { responsive: false, animation: false },
  };
}

module('Integration | Component | chart-canvas', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.config = lineConfig([10, 20]);
    this.rows = [
      { label: 'Jan', value: '10' },
      { label: 'Feb', value: '20' },
    ];
  });

  test('renders one table row per data point for assistive tech', async function (assert) {
    await render(
      hbs`<ChartCanvas @config={{this.config}} @rows={{this.rows}} />`,
    );

    assert.dom('[data-test-chart-canvas]').exists();
    assert.dom('[data-test-chart-canvas-el]').exists();

    const rows = findAll('[data-test-chart-canvas-table] tbody tr');
    assert.strictEqual(rows.length, 2, 'one row per point');
    assert.dom(rows[0].querySelector('th')).hasText('Jan');
    assert.dom(rows[0].querySelector('td')).hasText('10');
    assert.dom(rows[1].querySelector('th')).hasText('Feb');
    assert.dom(rows[1].querySelector('td')).hasText('20');
  });

  test('falls back to generic table headings, and takes the given ones', async function (assert) {
    await render(
      hbs`<ChartCanvas @config={{this.config}} @rows={{this.rows}} />`,
    );
    assert.dom('[data-test-chart-canvas-table] caption').hasText('Chart data');
    assert
      .dom('[data-test-chart-canvas-table] thead th:last-child')
      .hasText('Value');

    await render(hbs`<ChartCanvas
      @config={{this.config}}
      @rows={{this.rows}}
      @caption="Monthly totals"
      @valueLabel="Amount"
    />`);
    assert
      .dom('[data-test-chart-canvas-table] caption')
      .hasText('Monthly totals');
    assert
      .dom('[data-test-chart-canvas-table] thead th:last-child')
      .hasText('Amount');
  });

  test('renders the table with no rows rather than failing on missing data', async function (assert) {
    await render(hbs`<ChartCanvas @config={{this.config}} />`);

    assert.dom('[data-test-chart-canvas-table]').exists();
    assert.strictEqual(
      findAll('[data-test-chart-canvas-table] tbody tr').length,
      0,
    );
  });

  test('creates one chart for the canvas', async function (assert) {
    await render(hbs`<ChartCanvas @config={{this.config}} />`);

    const chart = Chart.getChart(find('[data-test-chart-canvas-el]'));
    assert.ok(chart, 'a chart owns the canvas');
    assert.deepEqual(chart.data.datasets[0].data, [10, 20]);
  });

  test('leaves the chart alone when a rebuilt config carries the same data', async function (assert) {
    await render(hbs`<ChartCanvas @config={{this.config}} />`);

    const canvas = find('[data-test-chart-canvas-el]');
    const chart = Chart.getChart(canvas);
    const data = chart.data;

    // A model refresh rebuilds @config even when nothing the chart draws moved.
    this.set('config', lineConfig([10, 20]));
    await settled();

    assert.strictEqual(Chart.getChart(canvas), chart, 'not torn down');
    assert.strictEqual(chart.data, data, 'not fed a new data object');
  });

  test('updates the existing chart when the data moves', async function (assert) {
    await render(hbs`<ChartCanvas @config={{this.config}} />`);

    const canvas = find('[data-test-chart-canvas-el]');
    const chart = Chart.getChart(canvas);

    this.set('config', lineConfig([30, 40]));
    await settled();

    assert.strictEqual(Chart.getChart(canvas), chart, 'same instance');
    assert.deepEqual(chart.data.datasets[0].data, [30, 40]);
  });

  test('destroys the chart when the component goes away', async function (assert) {
    await render(hbs`<ChartCanvas @config={{this.config}} />`);
    const canvas = find('[data-test-chart-canvas-el]');
    assert.ok(Chart.getChart(canvas), 'a chart exists first');

    await clearRender();

    assert.strictEqual(
      Chart.getChart(canvas),
      undefined,
      'no orphan chart survives the component',
    );
  });

  test('swaps the canvas tooltip for the external one without touching the caller config', async function (assert) {
    await render(hbs`<ChartCanvas @config={{this.config}} />`);

    const tooltip = Chart.getChart(find('[data-test-chart-canvas-el]')).options
      .plugins.tooltip;
    assert.false(tooltip.enabled, 'the canvas-painted tooltip is off');
    assert.strictEqual(typeof tooltip.external, 'function');
    assert.strictEqual(
      this.config.options.plugins,
      undefined,
      'the config handed in was not mutated',
    );
  });

  module('external tooltip', function () {
    const TIP = {
      opacity: 1,
      title: ['Jan'],
      body: [{ lines: ['10'] }],
      caretX: 20,
      caretY: 30,
    };

    // `this.config` resolves against the rendering test context, as in render().
    async function setup() {
      await render(hbs`<ChartCanvas @config={{this.config}} />`);
      const chart = Chart.getChart(find('[data-test-chart-canvas-el]'));
      return {
        chart,
        tip: find('[data-test-chart-canvas-tip]'),
        host: find('[data-test-chart-canvas]'),
        external: chart.options.plugins.tooltip.external,
      };
    }

    test('writes the title and body lines, and hides on the way out', async function (assert) {
      const { chart, tip, external } = await setup();

      assert.dom(tip).hasAttribute('hidden', '', 'hidden before any hover');

      external({ chart, tooltip: TIP });
      assert.dom(tip).doesNotHaveAttribute('hidden');
      assert.strictEqual(tip.textContent, 'Jan\n10');

      external({ chart, tooltip: { ...TIP, opacity: 0 } });
      assert.dom(tip).hasAttribute('hidden');
    });

    test('drops empty lines instead of rendering blanks', async function (assert) {
      const { chart, tip, external } = await setup();

      external({
        chart,
        tooltip: { ...TIP, title: [], body: [{ lines: ['10'] }, {}] },
      });
      assert.strictEqual(tip.textContent, '10');
    });

    test('clamps the tip to the canvas instead of letting it run off the edge', async function (assert) {
      const { chart, tip, host, external } = await setup();

      // Measured with the tip on screen and populated: its width is its content.
      external({ chart, tooltip: TIP });
      const canvasBox = chart.canvas.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      const offsetX = canvasBox.left - hostBox.left;
      const half = tip.offsetWidth / 2;
      const min = offsetX + half;
      const max = offsetX + canvasBox.width - half;

      external({ chart, tooltip: { ...TIP, caretX: -500 } });
      assert.strictEqual(
        parseFloat(tip.style.left),
        Math.min(min, max),
        'pinned to the left bound, not to the caret',
      );

      external({ chart, tooltip: { ...TIP, caretX: canvasBox.width + 500 } });
      assert.strictEqual(
        parseFloat(tip.style.left),
        max,
        'pinned to the right bound',
      );
    });

    test('positions the tip above the caret', async function (assert) {
      const { chart, tip, host, external } = await setup();

      external({ chart, tooltip: TIP });

      const canvasBox = chart.canvas.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      assert.strictEqual(
        parseFloat(tip.style.top),
        canvasBox.top - hostBox.top + TIP.caretY - 10,
        'a fixed gap above the point',
      );
    });
  });
});
