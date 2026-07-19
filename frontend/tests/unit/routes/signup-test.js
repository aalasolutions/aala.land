import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Route | signup', function (hooks) {
  setupTest(hooks);

  test('model derives marketerCode from the ref param', async function (assert) {
    const route = this.owner.lookup('route:signup');
    const model = await route.model({ ref: '  MKT-TEST  ' });
    assert.strictEqual(model.marketerCode, 'MKT-TEST', 'trimmed value');
  });

  test('model caps marketerCode at the DTO limit (64)', async function (assert) {
    const route = this.owner.lookup('route:signup');
    const model = await route.model({ ref: 'x'.repeat(80) });
    assert.strictEqual(model.marketerCode.length, 64);
  });

  test('model returns null marketerCode without a ref', async function (assert) {
    const route = this.owner.lookup('route:signup');
    const model = await route.model({});
    assert.strictEqual(model.marketerCode, null);

    const blank = await route.model({ ref: '   ' });
    assert.strictEqual(blank.marketerCode, null, 'whitespace-only is null');
  });
});
