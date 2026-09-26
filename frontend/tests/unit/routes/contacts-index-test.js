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
});
