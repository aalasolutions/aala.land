import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Service | access-requests', function (hooks) {
  setupTest(hooks);

  test('loads the pending count from the list total', async function (assert) {
    const service = this.owner.lookup('service:access-requests');
    const paths = [];
    this.owner.lookup('service:auth').fetchJson = async (path) => {
      paths.push(path);
      return { success: true, data: { data: [], total: 2 } };
    };

    await service.loadPendingCount();

    assert.strictEqual(service.pendingCount, 2);
    assert.true(paths[0].startsWith('/contact-access-requests?status=PENDING'));
  });

  test('keeps the last count when the request fails', async function (assert) {
    const service = this.owner.lookup('service:access-requests');
    service.pendingCount = 3;
    this.owner.lookup('service:auth').fetchJson = async () => {
      throw new Error('offline');
    };

    await service.loadPendingCount();

    assert.strictEqual(service.pendingCount, 3);
  });
});
