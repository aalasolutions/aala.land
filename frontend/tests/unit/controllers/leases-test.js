import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | leases/index', function (hooks) {
  setupTest(hooks);

  test('create, edit and renew open the shared drawer in their mode', function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    const lease = { id: 'l-1' };

    controller.openCreate();
    assert.strictEqual(controller.drawerMode, 'create');
    assert.strictEqual(controller.drawerLease, null);
    assert.true(controller.showModal);

    controller.openEdit(lease);
    assert.strictEqual(controller.drawerMode, 'edit');
    assert.strictEqual(controller.drawerLease, lease);

    controller.renewLease(lease);
    assert.strictEqual(controller.drawerMode, 'renew');
  });

  test('the record is cleared only once the drawer has slid out', function (assert) {
    const controller = this.owner.lookup('controller:leases/index');
    controller.openEdit({ id: 'l-1' });

    controller.closeModal();
    assert.false(controller.showModal);
    assert.deepEqual(
      controller.drawerLease,
      { id: 'l-1' },
      'kept for the title',
    );

    controller.resetDrawer();
    assert.strictEqual(controller.drawerLease, null);
  });
});
