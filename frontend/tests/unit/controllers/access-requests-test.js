import { module, test } from 'qunit';
import {
  EXPIRY_DATE,
  EXPIRY_DEFAULT,
  EXPIRY_FOREVER,
  approvalBody,
} from 'land/controllers/access-requests';

module('Unit | Controller | access-requests', function () {
  test('approvalBody maps each expiry choice to the approve DTO', function (assert) {
    assert.deepEqual(approvalBody(EXPIRY_DEFAULT, ''), {});
    assert.deepEqual(approvalBody(EXPIRY_FOREVER, '2027-01-31'), {
      forever: true,
    });
    assert.ok(approvalBody(EXPIRY_DATE, '2027-01-31').expiresAt);
    assert.strictEqual(
      approvalBody(EXPIRY_DATE, ''),
      null,
      'a date choice needs a date',
    );
  });
});
