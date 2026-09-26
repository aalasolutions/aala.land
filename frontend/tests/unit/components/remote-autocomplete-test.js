import { module, test } from 'qunit';
import { toItems } from 'land/components/remote-autocomplete';

module('Unit | Component | remote-autocomplete | toItems', function () {
  const ITEM = { id: 'c-1', displayName: 'Test Buyer' };

  test('a bare array passes through', function (assert) {
    assert.deepEqual(toItems([ITEM]), [ITEM]);
  });

  test('a paginated payload is unwrapped', function (assert) {
    assert.deepEqual(toItems({ data: [ITEM], total: 1 }), [ITEM]);
  });

  test('anything else yields an empty list', function (assert) {
    assert.deepEqual(toItems(undefined), []);
    assert.deepEqual(toItems({ total: 0 }), []);
    assert.deepEqual(toItems({ data: { id: 'x' } }), []);
  });

  test('mapItem shapes every item', function (assert) {
    const mapItem = (item) => ({ ...item, label: item.displayName });

    assert.deepEqual(toItems({ data: [ITEM] }, mapItem), [
      { ...ITEM, label: 'Test Buyer' },
    ]);
  });
});
