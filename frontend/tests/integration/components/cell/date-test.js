import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | cell/date', function (hooks) {
  setupRenderingTest(hooks);

  test('a calendar date renders without a zone shift', async function (assert) {
    await render(
      hbs`<div data-test-out><Cell::Date @value="2025-09-16" /></div>`,
    );
    assert.dom('[data-test-out]').hasText('16 Sep 2025');
  });

  test('an instant renders its day in the active region zone', async function (assert) {
    // 10:00 UTC is 24 Dec in Pago_Pago (UTC-11).
    this.owner.lookup('service:region').activeRegion = {
      code: 'far-west',
      timezone: 'Pacific/Pago_Pago',
    };
    await render(
      hbs`<div data-test-out><Cell::Date @value="2025-12-25T10:00:00Z" /></div>`,
    );
    assert.dom('[data-test-out]').hasText('24 Dec 2025');
  });

  test('withTime from cellArgs adds the time, a direct arg overrides', async function (assert) {
    this.set('column', { cellArgs: { withTime: true } });
    await render(
      hbs`<div data-test-out><Cell::Date @value="2025-09-16T06:00:00Z" @column={{this.column}} /></div>`,
    );
    assert
      .dom('[data-test-out]')
      .hasText(/^\d{1,2} Sep 2025, \d{1,2}:\d{2} [AP]M$/);

    await render(
      hbs`<div data-test-out><Cell::Date @value="2025-09-16" @withTime={{false}} @column={{this.column}} /></div>`,
    );
    assert.dom('[data-test-out]').hasText('16 Sep 2025');
  });

  test('null, undefined and "" render "-"', async function (assert) {
    for (const value of [null, undefined, '']) {
      this.set('value', value);
      await render(
        hbs`<div data-test-out><Cell::Date @value={{this.value}} /></div>`,
      );
      assert
        .dom('[data-test-out]')
        .hasText('-', `empty ${JSON.stringify(value)}`);
    }
  });
});
