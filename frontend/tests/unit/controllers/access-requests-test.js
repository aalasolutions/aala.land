import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { localDateString, todayInZone } from 'land/utils/local-date';
import {
  EXPIRY_DATE,
  EXPIRY_DEFAULT,
  EXPIRY_FOREVER,
  approvalBody,
} from 'land/controllers/access-requests';

module('Unit | Controller | access-requests', function (hooks) {
  setupTest(hooks);

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

  test('a date choice ends at the end of that day in the region', function (assert) {
    assert.deepEqual(
      approvalBody(EXPIRY_DATE, '2027-01-31', 'Pacific/Kiritimati'),
      { expiresAt: '2027-01-31T09:59:59.000Z' },
    );
    assert.deepEqual(
      approvalBody(EXPIRY_DATE, '2027-01-31', 'Pacific/Pago_Pago'),
      { expiresAt: '2027-02-01T10:59:59.000Z' },
    );
  });

  test('the earliest expiry date is the region day and follows a switch', function (assert) {
    const controller = this.owner.lookup('controller:access-requests');
    // Samples both sides of each read so a midnight rollover cannot flake it.
    const read = (zone) => {
      controller.region.activeRegion = zone
        ? { code: zone, timezone: zone }
        : null;
      const before = zone ? todayInZone(zone) : localDateString();
      const value = controller.minExpiryDate;
      const after = zone ? todayInZone(zone) : localDateString();
      assert.true([before, after].includes(value), `${value} for ${zone}`);
      return value;
    };

    const ahead = read('Pacific/Kiritimati');
    const behind = read('Pacific/Pago_Pago');
    assert.notStrictEqual(ahead, behind, 'UTC+14 and UTC-11 never share a day');
    read(null);
  });
});
