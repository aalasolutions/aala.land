import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const ORDER = {
  id: 'wo-1',
  title: 'Fix AC',
  unitId: 'unit-1',
  vendorId: 'vendor-1',
  assignedTo: 'user-9',
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

module('Unit | Route | maintenance/detail', function (hooks) {
  setupTest(hooks);

  function routeWith(owner, responses, role = 'company_admin') {
    const paths = [];
    const route = owner.lookup('route:maintenance/detail');
    route.auth = {
      currentUser: { id: 'user-1', role },
      async fetchJson(path) {
        paths.push(path);
        const response = responses[path];
        if (response instanceof Error) throw response;
        return response;
      },
    };
    return { route, paths };
  }

  const FULL = {
    '/maintenance/wo-1': { success: true, data: ORDER },
    '/properties/units/unit-1': { success: true, data: UNIT },
    '/vendors/vendor-1': {
      success: true,
      data: { id: 'vendor-1', name: 'Cool Air' },
    },
    '/users/user-9': {
      success: true,
      data: { id: 'user-9', name: 'Test User' },
    },
  };

  test('it loads the work order, then its unit, vendor and assignee', async function (assert) {
    const { route, paths } = routeWith(this.owner, FULL);

    const model = await route.model({ work_order_id: 'wo-1' });

    assert.strictEqual(paths[0], '/maintenance/wo-1');
    assert.deepEqual(paths.slice(1).sort(), [
      '/properties/units/unit-1',
      '/users/user-9',
      '/vendors/vendor-1',
    ]);
    assert.deepEqual(model.workOrder, ORDER);
    assert.deepEqual(model.unit, {
      id: 'unit-1',
      areaId: 'area-1',
      label: 'Bay Tower - 101',
    });
    assert.strictEqual(model.vendor.name, 'Cool Air');
    assert.strictEqual(model.assignee.name, 'Test User');
  });

  test('a role without user access never reads the assignee', async function (assert) {
    const { route, paths } = routeWith(this.owner, FULL, 'manager');

    const model = await route.model({ work_order_id: 'wo-1' });

    assert.false(paths.includes('/users/user-9'));
    assert.strictEqual(model.assignee, null);
    assert.strictEqual(model.vendor.name, 'Cool Air');
  });

  test('ids the work order does not carry are not fetched', async function (assert) {
    const bare = {
      id: 'wo-1',
      title: 'Fix AC',
      unitId: null,
      vendorId: null,
      assignedTo: null,
    };
    const { route, paths } = routeWith(this.owner, {
      '/maintenance/wo-1': { success: true, data: bare },
    });

    const model = await route.model({ work_order_id: 'wo-1' });

    assert.deepEqual(paths, ['/maintenance/wo-1']);
    assert.strictEqual(model.unit, null);
    assert.strictEqual(model.vendor, null);
    assert.strictEqual(model.assignee, null);
  });

  test('failed side reads leave the work order in place', async function (assert) {
    const { route } = routeWith(this.owner, {
      '/maintenance/wo-1': { success: true, data: ORDER },
      '/properties/units/unit-1': notFound(),
      '/vendors/vendor-1': notFound(),
      '/users/user-9': notFound(),
    });

    const model = await route.model({ work_order_id: 'wo-1' });

    assert.deepEqual(model.workOrder, ORDER);
    assert.strictEqual(model.unit, null);
    assert.strictEqual(model.vendor, null);
    assert.strictEqual(model.assignee, null);
  });

  test('a work order that fails to load resolves to null', async function (assert) {
    const { route, paths } = routeWith(this.owner, {
      '/maintenance/wo-1': notFound(),
    });

    const model = await route.model({ work_order_id: 'wo-1' });

    assert.deepEqual(paths, ['/maintenance/wo-1']);
    assert.strictEqual(model.workOrder, null);
  });
});
