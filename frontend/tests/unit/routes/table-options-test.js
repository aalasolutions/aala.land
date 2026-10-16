import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { stubAuth } from 'land/tests/helpers/stub-auth';

module('Unit | Route | table-options', function (hooks) {
  setupTest(hooks);

  test('created-at bounds are midnights of the active region day', async function (assert) {
    const calls = stubAuth(this.owner, {
      respond: () => ({ data: { data: [], total: 0, page: 1, limit: 50 } }),
    });
    const region = this.owner.lookup('service:region');
    const route = this.owner.lookup('route:table-options');
    const bounds = async () => {
      calls.length = 0;
      await route.model({ dateFrom: '2026-09-16', dateTo: '2026-09-16' });
      const path = calls.find((c) => c.path.startsWith('/contacts?')).path;
      const query = new URLSearchParams(path.split('?')[1]);
      return [query.get('dateFrom'), query.get('dateTo')];
    };

    region.activeRegion = { code: 'ahead', timezone: 'Pacific/Kiritimati' };
    assert.deepEqual(await bounds(), [
      '2026-09-15T10:00:00.000Z',
      '2026-09-16T10:00:00.000Z',
    ]);

    region.activeRegion = { code: 'behind', timezone: 'Pacific/Pago_Pago' };
    assert.deepEqual(await bounds(), [
      '2026-09-16T11:00:00.000Z',
      '2026-09-17T11:00:00.000Z',
    ]);
  });
});
