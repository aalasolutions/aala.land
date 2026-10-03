import { module, test } from 'qunit';
import { formatMoney, minorUnitDigits, moneyFormatter } from 'land/utils/money';

// Intl separates code and digits with a no-break space; compare on the visible text.
const plain = (text) => text.replace(/\u00a0/g, ' ');

module('Unit | Utility | money', function () {
  test('full form by default', function (assert) {
    assert.strictEqual(
      plain(formatMoney(5000, 'en-SA', { currency: 'SAR' })),
      'SAR 5,000.00',
    );
    assert.strictEqual(
      plain(formatMoney('145050.5', 'en', { currency: 'AED' })),
      'AED 145,050.50',
    );
  });

  test('compact shortens from one million upward and leaves smaller amounts alone', function (assert) {
    const opts = { currency: 'SAR', compact: true };
    assert.strictEqual(plain(formatMoney(20000000, 'en', opts)), 'SAR 20M');
    assert.strictEqual(plain(formatMoney(1500000000, 'en', opts)), 'SAR 1.5B');
    assert.strictEqual(plain(formatMoney(-2500000, 'en', opts)), '-SAR 2.5M');
    assert.strictEqual(
      plain(formatMoney(999999.99, 'en', opts)),
      'SAR 999,999.99',
    );
    assert.strictEqual(plain(formatMoney(5000, 'en', opts)), 'SAR 5,000.00');
  });

  test('minor units divide by the currency fraction digits', function (assert) {
    assert.strictEqual(
      plain(formatMoney(2500, 'en-US', { currency: 'USD', minor: true })),
      '$25.00',
    );
    assert.strictEqual(
      plain(formatMoney(2500, 'en', { currency: 'JPY', minor: true })),
      '¥2,500',
    );
    assert.strictEqual(minorUnitDigits('USD'), 2);
    assert.strictEqual(minorUnitDigits('JPY'), 0);
    assert.strictEqual(minorUnitDigits('NOT_A_CURRENCY'), 2);
  });

  test('empty and non-numeric input render nothing', function (assert) {
    assert.strictEqual(plain(formatMoney(null, 'en', { currency: 'SAR' })), '');
    assert.strictEqual(
      plain(formatMoney(undefined, 'en', { currency: 'SAR' })),
      '',
    );
    assert.strictEqual(plain(formatMoney('', 'en', { currency: 'SAR' })), '');
    assert.strictEqual(
      plain(formatMoney('abc', 'en', { currency: 'SAR' })),
      '',
    );
  });

  test('without a currency the digits stand alone', function (assert) {
    assert.strictEqual(plain(formatMoney(1234.5, 'en', {})), '1,234.5');
    assert.strictEqual(
      plain(formatMoney(1234.5, 'en', { minor: true })),
      '12.345',
    );
  });

  test('moneyFormatter is reusable and respects fractionDigits', function (assert) {
    const format = moneyFormatter('en-US', {
      currency: 'USD',
      fractionDigits: 0,
    });
    assert.strictEqual(plain(format(1234.56)), '$1,235');
    assert.strictEqual(plain(format('not a number')), '$0');
    assert.strictEqual(
      plain(
        moneyFormatter('en-US', {
          currency: 'USD',
          minor: true,
          fractionDigits: 0,
        })(2550),
      ),
      '$26',
      'minor digits come from the currency, not from fractionDigits',
    );
  });
});
