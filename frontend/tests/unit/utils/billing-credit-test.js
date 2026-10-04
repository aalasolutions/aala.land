import { module, test } from 'qunit';
import { creditDisplayAmount } from 'land/utils/billing-credit';

module('Unit | Utility | billing-credit', function () {
  test('applied wins, then issued, then zero', function (assert) {
    assert.strictEqual(
      creditDisplayAmount({ creditApplied: 2498, creditIssued: 2500 }),
      2498,
    );
    assert.strictEqual(
      creditDisplayAmount({ creditApplied: 0, creditIssued: 2500 }),
      2500,
    );
    assert.strictEqual(
      creditDisplayAmount({ creditApplied: 0, creditIssued: 0 }),
      0,
    );
    assert.strictEqual(creditDisplayAmount({}), 0);
    assert.strictEqual(creditDisplayAmount(null), 0);
  });
});
