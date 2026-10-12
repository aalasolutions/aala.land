import { module, test } from 'qunit';
import { primaryRole } from 'land/utils/contact-role';

module('Unit | Utility | contact-role', function () {
  test('an open lead outranks a lease and units', function (assert) {
    assert.strictEqual(
      primaryRole({ totals: { openLeads: 1, activeLeases: 1, units: 1 } }),
      'lead',
    );
  });

  test('no open lead gives way to an active lease', function (assert) {
    assert.strictEqual(
      primaryRole({ totals: { leads: 2, openLeads: 0, activeLeases: 1 } }),
      'tenant',
    );
  });

  test('no active lease gives way to owned units', function (assert) {
    assert.strictEqual(
      primaryRole({ totals: { leases: 3, activeLeases: 0, units: 150 } }),
      'owner',
    );
  });

  test('nothing applies gives null', function (assert) {
    assert.strictEqual(primaryRole({ totals: {} }), null);
    assert.strictEqual(primaryRole({}), null);
    assert.strictEqual(primaryRole(), null);
  });
});
