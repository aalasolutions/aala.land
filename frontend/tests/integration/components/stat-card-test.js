import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | stat-card', function (hooks) {
  setupRenderingTest(hooks);

  test('renders a stat inside a card, attributes on the stat', async function (assert) {
    await render(hbs`
      <StatCard
        @cardClass="kpi-outcome"
        @label="Net"
        @value="120"
        @delta="This month"
        @variant="success"
        data-test-kpi="net"
      />
    `);

    assert.dom('[data-test-stat-card]').hasClass('wu-card').hasClass('kpi-outcome');
    assert.dom('[data-test-stat-card] [data-test-kpi="net"]').hasClass('wu-stat');
    assert.dom('[data-test-wu-stat-label]').hasText('Net');
    assert.dom('[data-test-wu-stat-value]').hasText('120');
    assert.dom('[data-test-wu-stat-delta]').hasClass('success');
    assert.dom('[data-test-wu-stat-content]').doesNotExist();
    assert.dom('[data-test-wu-stat-icon]').doesNotExist();
  });

  test('forwards only the blocks it is given', async function (assert) {
    await render(hbs`
      <StatCard @label="Revenue" @value="5">
        <:content><span data-test-spark>chart</span></:content>
      </StatCard>
      <StatCard @label="Customers" @value="3">
        <:icon><span data-test-icon>i</span></:icon>
      </StatCard>
    `);

    assert.dom('[data-test-wu-stat-content] [data-test-spark]').exists();
    assert.dom('[data-test-wu-stat-icon] [data-test-icon]').exists();
    assert.dom('[data-test-wu-stat-content]').exists({ count: 1 });
    assert.dom('[data-test-wu-stat-icon]').exists({ count: 1 });
  });
});
