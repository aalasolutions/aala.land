import { module, test } from 'qunit';
import { localeForRegion } from 'land/utils/locale';

module('Unit | Utility | locale', function () {
  test('derives the locale from the region country', function (assert) {
    assert.strictEqual(localeForRegion({ country: 'SA' }), 'en-SA');
    assert.strictEqual(localeForRegion({ country: 'ae' }), 'en-AE');
  });

  test('falls back to the browser without a region', function (assert) {
    const expected = navigator.language || 'en';
    assert.strictEqual(localeForRegion(null), expected);
    assert.strictEqual(localeForRegion({}), expected);
  });
});
