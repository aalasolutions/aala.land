import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const LEASE = {
  id: 'lease-1',
  unitId: 'unit-1',
  contactId: 'contact-1',
  contact: { id: 'contact-1', displayName: 'Test Tenant' },
  status: 'ACTIVE',
};

const UNIT = {
  id: 'unit-1',
  unitNumber: '101',
  asset: { name: 'Bay Tower', localityId: 'area-1' },
};

function notFound() {
  const err = new Error('Not found');
  err.status = 404;
  return err;
}

module('Unit | Route | leases/detail', function (hooks) {
  setupTest(hooks);

  function routeWith(owner, responses) {
    const paths = [];
    const route = owner.lookup('route:leases/detail');
    route.auth = {
      async fetchJson(path) {
        paths.push(path);
        const response = responses[path];
        if (response instanceof Error) throw response;
        return response;
      },
    };
    return { route, paths };
  }

  test('it loads the lease, then its unit for the link', async function (assert) {
    const { route, paths } = routeWith(this.owner, {
      '/leases/lease-1': { success: true, data: LEASE },
      '/properties/units/unit-1': { success: true, data: UNIT },
    });

    const model = await route.model({ lease_id: 'lease-1' });

    assert.deepEqual(paths, ['/leases/lease-1', '/properties/units/unit-1']);
    assert.deepEqual(model.lease, LEASE);
    assert.deepEqual(model.unit, {
      id: 'unit-1',
      areaId: 'area-1',
      label: 'Bay Tower - 101',
    });
  });

  test('a lease that fails to load resolves to null and skips the unit', async function (assert) {
    const { route, paths } = routeWith(this.owner, {
      '/leases/lease-1': notFound(),
    });

    const model = await route.model({ lease_id: 'lease-1' });

    assert.deepEqual(paths, ['/leases/lease-1']);
    assert.strictEqual(model.lease, null);
    assert.strictEqual(model.unit, null);
  });

  test('a unit that fails to load keeps the lease', async function (assert) {
    const { route } = routeWith(this.owner, {
      '/leases/lease-1': { success: true, data: LEASE },
      '/properties/units/unit-1': notFound(),
    });

    const model = await route.model({ lease_id: 'lease-1' });

    assert.deepEqual(model.lease, LEASE);
    assert.strictEqual(model.unit, null);
  });
});
