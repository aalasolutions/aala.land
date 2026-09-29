import { module, test } from 'qunit';
import {
  accessExpiryLabel,
  accessSourceLabel,
} from 'land/utils/access-requests';

module('Unit | Utility | access-requests', function () {
  test('a missing expiry reads Never only on an approved grant', function (assert) {
    assert.strictEqual(
      accessExpiryLabel({ status: 'APPROVED', expiresAt: null }),
      'Never',
    );
    assert.strictEqual(
      accessExpiryLabel({ status: 'PENDING', expiresAt: null }),
      '',
    );
    assert.strictEqual(
      accessExpiryLabel({ status: 'REJECTED', expiresAt: null }),
      '',
    );
    assert.strictEqual(
      accessExpiryLabel({
        status: 'APPROVED',
        expiresAt: '2026-12-31T00:00:00.000Z',
      }),
      '',
      'a dated grant shows its date instead',
    );
  });

  test('source types read as words', function (assert) {
    assert.strictEqual(accessSourceLabel('lead'), 'Lead');
    assert.strictEqual(accessSourceLabel('unit'), 'Unit');
    assert.strictEqual(accessSourceLabel('contact'), 'Contact page');
    assert.strictEqual(accessSourceLabel(null), '');
  });
});
