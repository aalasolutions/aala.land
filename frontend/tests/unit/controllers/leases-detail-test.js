import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const LEASE = {
  id: 'lease-1',
  startDate: '2026-01-01',
  contact: { id: 'contact-1', displayName: 'Test Tenant' },
  deletedAt: null,
};

module('Unit | Controller | leases/detail', function (hooks) {
  setupTest(hooks);

  function controllerWith(owner, lease) {
    const controller = owner.lookup('controller:leases/detail');
    controller.model = { lease, unit: null };
    return controller;
  }

  test('the tenant name reads displayName', function (assert) {
    const controller = controllerWith(this.owner, LEASE);
    assert.strictEqual(controller.tenantName, 'Test Tenant');
  });

  test('a limited contact shows first name and last initial', function (assert) {
    const controller = controllerWith(this.owner, {
      ...LEASE,
      contact: {
        id: 'contact-1',
        accessLevel: 'LIMITED',
        firstName: 'Test',
        lastInitial: 'U.',
      },
    });
    assert.strictEqual(controller.tenantName, 'Test U.');
  });

  test('a lease without a tenant says so', function (assert) {
    const controller = controllerWith(this.owner, { ...LEASE, contact: null });
    assert.strictEqual(controller.tenantName, 'Unknown tenant');
  });

  test('an archived lease hides upload', function (assert) {
    assert.true(controllerWith(this.owner, LEASE).canUpload);
    const archived = controllerWith(this.owner, {
      ...LEASE,
      deletedAt: '2026-09-01T00:00:00.000Z',
    });
    assert.false(archived.canUpload);
  });

  test('the panel is scoped to the lease and presets the link', function (assert) {
    const controller = controllerWith(this.owner, LEASE);
    assert.deepEqual(controller.documentFilters, { leaseId: 'lease-1' });
    assert.deepEqual(controller.presetLink, {
      type: 'lease',
      id: 'lease-1',
      label: 'Test Tenant 2026-01-01',
    });
  });

  test('no lease means no preset link', function (assert) {
    const controller = controllerWith(this.owner, null);
    assert.strictEqual(controller.presetLink, null);
  });
});
