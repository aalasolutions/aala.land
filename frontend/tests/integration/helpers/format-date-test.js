import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { todayInZone } from 'land/utils/local-date';
import FormatDate from 'land/helpers/format-date';

module('Integration | Helper | format-date', function (hooks) {
  setupRenderingTest(hooks);

  test('a date-only string renders its own calendar date with no shift', async function (assert) {
    this.set('value', '2025-09-16');
    await render(hbs`<span data-test-out>{{format-date this.value}}</span>`);
    assert.dom('[data-test-out]').hasText('16 Sep 2025');
  });

  test('a date in the current year drops the year', async function (assert) {
    const year = todayInZone(null).slice(0, 4);
    this.set('value', `${year}-01-01`);
    await render(hbs`<span data-test-out>{{format-date this.value}}</span>`);
    assert.dom('[data-test-out]').hasText('1 Jan');
  });

  test('an instant renders the browser-local date', async function (assert) {
    const value = '2025-09-16T23:30:00Z';
    this.set('value', value);
    await render(hbs`<span data-test-out>{{format-date this.value}}</span>`);
    const date = new Date(value);
    const month = date.toLocaleString('en-US', { month: 'short' });
    assert
      .dom('[data-test-out]')
      .hasText(`${date.getDate()} ${month} ${date.getFullYear()}`);
  });

  test('empty and invalid values render nothing', async function (assert) {
    this.set('value', 'not-a-date');
    await render(
      hbs`<span data-test-out>{{format-date this.value}}{{format-date null}}</span>`,
    );
    assert.dom('[data-test-out]').hasText('');
  });

  test('zone="region" renders an instant on its day in the active region zone', async function (assert) {
    const region = this.owner.lookup('service:region');
    // 10:00 UTC is 24 Dec in Pago_Pago (UTC-11) and 26 Dec in Kiritimati (UTC+14).
    this.set('value', '2025-12-25T10:00:00Z');

    region.activeRegion = { code: 'far-west', timezone: 'Pacific/Pago_Pago' };
    await render(
      hbs`<span data-test-out>{{format-date this.value zone="region"}}</span>`,
    );
    assert.dom('[data-test-out]').hasText('24 Dec 2025');

    region.activeRegion = { code: 'far-east', timezone: 'Pacific/Kiritimati' };
    await render(
      hbs`<span data-test-out>{{format-date this.value zone="region"}}</span>`,
    );
    assert.dom('[data-test-out]').hasText('26 Dec 2025');
  });

  test('zone="region" drops the year for an instant in the current region year', async function (assert) {
    this.owner.lookup('service:region').activeRegion = {
      code: 'utc',
      timezone: 'UTC',
    };
    this.set('value', new Date().toISOString());
    await render(
      hbs`<span data-test-out>{{format-date this.value zone="region"}}</span>`,
    );
    assert.dom('[data-test-out]').hasText(/^\d{1,2} [A-Z][a-z]{2}$/);
  });

  test('zone="region" renders an empty string for no value', async function (assert) {
    this.set('value', null);
    await render(
      hbs`<span data-test-out>{{format-date this.value zone="region"}}</span>`,
    );
    assert.dom('[data-test-out]').hasText('');
  });

  test('an unknown zone value fails a development assertion', function (assert) {
    this.owner.register('helper:format-date-probe', FormatDate);
    const helper = this.owner.factoryFor('helper:format-date-probe').create();
    for (const zone of ['Region', true, null]) {
      assert.throws(
        () => helper.compute(['2025-09-16'], { zone }),
        /zone must be undefined or "region"/,
        `rejects ${JSON.stringify(zone)}`,
      );
    }
    assert.strictEqual(helper.compute(['2025-09-16'], {}), '16 Sep 2025');
    helper.destroy();
  });
});
