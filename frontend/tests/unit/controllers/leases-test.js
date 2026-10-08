import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | leases/index', function (hooks) {
  setupTest(hooks);

  test('a picked tenant is sent by id', function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    controller.tenantSelection.attach({ id: 'c-1', displayName: 'Test User' });

    assert.deepEqual(controller.tenantFields, { contactId: 'c-1' });
  });

  test('a typed tenant is sent as an identity to create or match', function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    controller.tenantSelection.setField('firstName', ' Test ');
    controller.tenantSelection.setField('phone', '+15551234567');

    assert.deepEqual(controller.tenantFields, {
      tenant: { firstName: 'Test', phone: '+15551234567' },
    });
  });

  test('a new lease starts with one cheque', function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    controller.openCreate();

    assert.strictEqual(controller.formNumberOfCheques, '1');
  });

  test('saving needs a tenant and at least one cheque', async function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    const calls = [];
    controller.auth = { fetchJson: async (...args) => calls.push(args) };
    controller.openCreate();
    controller.formUnitId = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';
    const event = { preventDefault() {} };

    await controller.saveLease(event);
    assert.strictEqual(
      controller.errorMsg,
      'Select a contact, or enter a name, phone or email to create one.',
    );

    controller.tenantSelection.attach({ id: 'c-1' });
    controller.formNumberOfCheques = '';
    await controller.saveLease(event);
    assert.strictEqual(
      controller.errorMsg,
      'Enter the number of cheques, 1 or more.',
    );
    assert.strictEqual(calls.length, 0, 'nothing is sent');
  });

  test('a unit kind sets the lease type and locks it, a plot leaves it open', function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    controller.model = {
      units: [
        { id: 'u-office', subType: 'OFFICE_SPACE' },
        { id: 'u-plot', subType: 'LAND_PLOT' },
      ],
    };
    controller.openCreate();

    controller.selectUnit('u-office');
    assert.strictEqual(controller.formType, 'COMMERCIAL');
    assert.strictEqual(controller.unitLeaseType, 'COMMERCIAL');

    controller.selectUnit('u-plot');
    assert.strictEqual(controller.unitLeaseType, null, 'either type allowed');
  });
});
