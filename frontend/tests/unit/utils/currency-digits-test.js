import { module, test } from 'qunit';
import {
  currencyFractionDigits,
  toMinorUnits,
} from 'land/utils/currency-digits';

module('Unit | Utility | currency-digits', function () {
  test('reads the minor-unit digits of a currency', function (assert) {
    assert.strictEqual(currencyFractionDigits('usd'), 2);
    assert.strictEqual(currencyFractionDigits('JPY'), 0);
    assert.strictEqual(currencyFractionDigits('bhd'), 3);
  });

  test('falls back to 2 for an invalid currency', function (assert) {
    assert.strictEqual(currencyFractionDigits('not-a-code'), 2);
    assert.strictEqual(currencyFractionDigits(undefined), 2);
  });

  test('converts a major-unit input to minor units', function (assert) {
    assert.strictEqual(toMinorUnits('19.99', 'usd'), 1999);
    assert.strictEqual(toMinorUnits('25', 'usd'), 2500);
    assert.strictEqual(toMinorUnits('3500', 'jpy'), 3500);
    assert.strictEqual(toMinorUnits('1.234', 'bhd'), 1234);
  });

  test('refuses an empty, non-numeric or over-precise input', function (assert) {
    assert.strictEqual(toMinorUnits('', 'usd'), null);
    assert.strictEqual(toMinorUnits(null, 'usd'), null);
    assert.strictEqual(toMinorUnits('abc', 'usd'), null);
    assert.strictEqual(toMinorUnits('Infinity', 'usd'), null);
    assert.strictEqual(toMinorUnits('19.999', 'usd'), null);
    assert.strictEqual(toMinorUnits('1500.5', 'jpy'), null);
  });
});
