import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { stubAuth } from 'land/tests/helpers/stub-auth';

// allRegions is sent only when on: an explicit param wins, otherwise the role decides.
module('Unit | Route | contacts/index', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.calls = stubAuth(this.owner, {
      respond: () => ({ data: { data: [], total: 0, page: 1, limit: 50 } }),
    });
  });

  async function contactsPath(ctx, role, params = {}) {
    ctx.owner.lookup('service:auth').currentUser = { id: 'user-1', role };
    ctx.calls.length = 0;
    await ctx.owner.lookup('route:contacts/index').model(params);
    return ctx.calls.find((c) => c.path.startsWith('/contacts?')).path;
  }

  test('an agent lists the active region unless the toggle is on', async function (assert) {
    assert.notOk((await contactsPath(this, 'agent')).includes('allRegions'));
    assert.notOk(
      (await contactsPath(this, 'agent', { allRegions: 'false' })).includes(
        'allRegions',
      ),
    );
    assert.ok(
      (await contactsPath(this, 'agent', { allRegions: 'true' })).includes(
        'allRegions=true',
      ),
    );
  });

  test('a company admin and the operator list every region by default', async function (assert) {
    assert.ok(
      (await contactsPath(this, 'company_admin')).includes('allRegions=true'),
    );
    assert.ok(
      (await contactsPath(this, 'super_admin')).includes('allRegions=true'),
    );
    assert.notOk(
      (
        await contactsPath(this, 'company_admin', { allRegions: 'false' })
      ).includes('allRegions'),
    );
  });

  test('a manager lists the active region by default', async function (assert) {
    assert.notOk((await contactsPath(this, 'manager')).includes('allRegions'));
  });

  test('created-at bounds are midnights of the region day', async function (assert) {
    const region = this.owner.lookup('service:region');
    const ahead = { code: 'ahead', timezone: 'Pacific/Kiritimati' };
    const behind = { code: 'behind', timezone: 'Pacific/Pago_Pago' };
    region.regions = [ahead, behind];
    const days = { dateFrom: '2026-09-16', dateTo: '2026-09-16' };
    const bounds = async (params) => {
      const query = new URLSearchParams(
        (await contactsPath(this, 'manager', params)).split('?')[1],
      );
      return [query.get('dateFrom'), query.get('dateTo')];
    };

    region.activeRegion = ahead;
    assert.deepEqual(await bounds(days), [
      '2026-09-15T10:00:00.000Z',
      '2026-09-16T10:00:00.000Z',
    ]);

    region.activeRegion = behind;
    assert.deepEqual(
      await bounds(days),
      ['2026-09-16T11:00:00.000Z', '2026-09-17T11:00:00.000Z'],
      'a region switch moves the bounds',
    );

    assert.deepEqual(
      await bounds({ ...days, region: 'ahead' }),
      ['2026-09-15T10:00:00.000Z', '2026-09-16T10:00:00.000Z'],
      'a linked region uses its own day',
    );
  });
});
