import { module, test } from 'qunit';
import { plural } from 'land/utils/plural';

module('Unit | Utility | plural', function () {
  test('one takes the singular, every other count the plural', function (assert) {
    assert.strictEqual(plural(1, 'day'), '1 day');
    assert.strictEqual(plural(0, 'day'), '0 days');
    assert.strictEqual(plural(2, 'day'), '2 days');
  });

  test('an irregular plural is passed explicitly', function (assert) {
    assert.strictEqual(plural(1, 'property', 'properties'), '1 property');
    assert.strictEqual(plural(3, 'property', 'properties'), '3 properties');
  });
});
