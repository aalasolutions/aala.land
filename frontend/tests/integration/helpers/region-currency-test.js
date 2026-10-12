import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Helper | region-currency', function (hooks) {
  setupRenderingTest(hooks);

  test("gives a region's currency, nothing when the code is unknown", async function (assert) {
    this.owner.lookup('service:region').regions = [
      { code: 'pk-pb', name: 'Punjab', currency: 'PKR' },
    ];

    await render(
      hbs`[{{region-currency "pk-pb"}}][{{region-currency "elsewhere"}}]`,
    );

    assert.dom(this.element).hasText('[PKR][]');
  });

  test('a price in another region keeps that region currency', async function (assert) {
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'sa-mk', name: 'Makkah', currency: 'SAR' },
      { code: 'pk-pb', name: 'Punjab', currency: 'PKR' },
    ];
    region.activeRegion = { code: 'sa-mk', currency: 'SAR' };

    await render(
      hbs`<Money @amount={{500}} @currency={{region-currency "pk-pb"}} />`,
    );

    assert.dom('[data-test-money]').includesText('PKR');
  });
});
