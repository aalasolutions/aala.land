import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Route | history', function (hooks) {
  setupTest(hooks);

  function routeWith(owner, fetchJson) {
    const route = owner.lookup('route:history');
    route.auth = { fetchJson };
    return route;
  }

  test('maps filters to the record-history query and unwraps the page', async function (assert) {
    const paths = [];
    const route = routeWith(this.owner, async (path) => {
      paths.push(path);
      return {
        success: true,
        data: { data: [{ id: 'h1' }], total: 1, page: 2, limit: 10 },
      };
    });

    const model = await route.model({
      page: 2,
      limit: 10,
      filterAction: 'CANCEL',
      filterEntityType: 'Cheque',
    });

    assert.deepEqual(paths, [
      '/record-history?page=2&limit=10&action=CANCEL&entityType=Cheque',
    ]);
    assert.deepEqual(model.entries, [{ id: 'h1' }]);
    assert.strictEqual(model.total, 1);
    assert.strictEqual(model.page, 2);
  });

  test('omits empty filters', async function (assert) {
    const paths = [];
    const route = routeWith(this.owner, async (path) => {
      paths.push(path);
      return { data: { data: [], total: 0 } };
    });

    await route.model({ page: 1, limit: 10 });

    assert.deepEqual(paths, ['/record-history?page=1&limit=10']);
  });

  test('flags a 403 as forbidden', async function (assert) {
    const route = routeWith(this.owner, async () => {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    });

    const model = await route.model({});

    assert.true(model.forbidden);
    assert.strictEqual(model.error, '');
    assert.deepEqual(model.entries, []);
  });

  test('flags other failures as an error, not an empty list', async function (assert) {
    const route = routeWith(this.owner, async () => {
      const err = new Error('Server exploded');
      err.status = 500;
      throw err;
    });

    const model = await route.model({});

    assert.false(model.forbidden);
    assert.strictEqual(model.error, 'Server exploded');
  });
});

module('Unit | Controller | history', function (hooks) {
  setupTest(hooks);

  test('rows carry display labels', function (assert) {
    const controller = this.owner.lookup('controller:history');
    controller.model = {
      entries: [
        { id: 'h1', action: 'CANCEL', entityType: 'WorkOrder' },
        { id: 'h2', action: 'SOMETHING_NEW', entityType: 'Other' },
      ],
    };

    const [first, second] = controller.rows;
    assert.strictEqual(first.actionLabel, 'Cancelled');
    assert.strictEqual(first.actionVariant, 'danger');
    assert.strictEqual(first.entityTypeLabel, 'Work Order');
    assert.strictEqual(second.actionLabel, 'SOMETHING_NEW');
    assert.strictEqual(second.actionVariant, 'secondary');
  });

  test('goToPage sets the page', function (assert) {
    const controller = this.owner.lookup('controller:history');
    controller.goToPage(3);
    assert.strictEqual(controller.page, 3);
  });

  test('changing a filter resets to page 1', function (assert) {
    const controller = this.owner.lookup('controller:history');
    controller.page = 4;
    controller.setFilterEntityType('Cheque');
    assert.strictEqual(controller.filterEntityType, 'Cheque');
    assert.strictEqual(controller.page, 1);
  });
});
