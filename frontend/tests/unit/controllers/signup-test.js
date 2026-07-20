import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | signup', function (hooks) {
  setupTest(hooks);

  test('registers the ref query param', function (assert) {
    const controller = this.owner.lookup('controller:signup');
    assert.deepEqual(controller.queryParams, ['ref']);
    assert.strictEqual(controller.ref, null);
  });
});
