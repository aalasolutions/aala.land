import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { find, render } from '@ember/test-helpers';

// Intl separates code and digits with a no-break space; compare on the visible text.
const shown = (selector) =>
  find(selector)
    .textContent.replace(/\u00a0/g, ' ')
    .trim();
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | money', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'makkah',
      country: 'SA',
      currency: 'SAR',
    };
  });

  test('labels with the active region currency and compacts by default', async function (assert) {
    await render(hbs`<Money @amount={{20000000}} />`);
    assert.strictEqual(shown('[data-test-money]'), 'SAR 20M');
    assert.dom('[data-test-money]').hasAttribute('dir', 'ltr');
  });

  test('the row currency wins over the region', async function (assert) {
    await render(hbs`<Money @amount={{5000}} @currency="AED" />`);
    assert.strictEqual(shown('[data-test-money]'), 'AED 5,000.00');
  });

  test('compact can be switched off', async function (assert) {
    await render(hbs`<Money @amount={{20000000}} @compact={{false}} />`);
    assert.strictEqual(shown('[data-test-money]'), 'SAR 20,000,000.00');
  });

  test('minor units', async function (assert) {
    await render(
      hbs`<Money @amount={{2500}} @currency="USD" @minor={{true}} />`,
    );
    assert.strictEqual(shown('[data-test-money]'), '$25.00');
  });

  test('renders nothing for an empty amount', async function (assert) {
    await render(hbs`<Money @amount={{null}} />`);
    assert.strictEqual(shown('[data-test-money]'), '');
  });

  test('format-money helper uses the same formatter', async function (assert) {
    await render(hbs`<span data-test-out>{{format-money 1500000}}</span>`);
    assert.strictEqual(shown('[data-test-out]'), 'SAR 1.5M');
  });
});
