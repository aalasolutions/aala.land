import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { find, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const shown = () =>
  find('[data-test-out]')
    .textContent.replace(/\u00a0/g, ' ')
    .trim();

module('Integration | Component | cell/money', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'makkah',
      country: 'SA',
      currency: 'SAR',
    };
  });

  test('reads the currency from the row field named by currencyPath', async function (assert) {
    this.setProperties({
      row: { rent: 500, currency: 'AED' },
      column: { cellArgs: { currencyPath: 'currency' } },
    });
    await render(
      hbs`<div data-test-out><Cell::Money @value={{this.row.rent}} @row={{this.row}} @column={{this.column}} /></div>`,
    );
    assert.strictEqual(shown(), 'AED 500.00');
    assert.dom('[data-test-out] [data-test-money]').exists();
  });

  test('without a currency path the active region currency applies', async function (assert) {
    await render(
      hbs`<div data-test-out><Cell::Money @value={{500}} @row={{hash}} @column={{hash}} /></div>`,
    );
    assert.strictEqual(shown(), 'SAR 500.00');
  });

  test('minor units from cellArgs, direct args override', async function (assert) {
    this.setProperties({
      row: { amount: 2500, currency: 'USD' },
      column: { cellArgs: { currencyPath: 'currency', minor: true } },
    });
    await render(
      hbs`<div data-test-out><Cell::Money @value={{this.row.amount}} @row={{this.row}} @column={{this.column}} /></div>`,
    );
    assert.strictEqual(shown(), '$25.00');

    await render(
      hbs`<div data-test-out><Cell::Money @value={{this.row.amount}} @currency="AED" @minor={{false}} @row={{this.row}} @column={{this.column}} /></div>`,
    );
    assert.strictEqual(shown(), 'AED 2.5K');
  });

  test('zero renders as money', async function (assert) {
    await render(
      hbs`<div data-test-out><Cell::Money @value={{0}} @currency="AED" /></div>`,
    );
    assert.strictEqual(shown(), 'AED 0.00');
  });

  test('null, undefined and "" render "-"', async function (assert) {
    for (const value of [null, undefined, '']) {
      this.set('value', value);
      await render(
        hbs`<div data-test-out><Cell::Money @value={{this.value}} /></div>`,
      );
      assert.strictEqual(shown(), '-', `empty ${JSON.stringify(value)}`);
      assert.dom('[data-test-money]').doesNotExist();
    }
  });
});
