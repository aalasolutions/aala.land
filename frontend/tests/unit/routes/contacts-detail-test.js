import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { stubAuth } from 'land/tests/helpers/stub-auth';

module('Unit | Route | contacts/detail', function (hooks) {
  setupTest(hooks);

  test('a limited contact loads without its units, leases or leads', async function (assert) {
    const calls = stubAuth(this.owner, {
      respond: () => ({
        data: { id: 'c-1', accessLevel: 'LIMITED', firstName: 'Omar' },
      }),
    });
    const route = this.owner.lookup('route:contacts/detail');

    const model = await route.model({ contact_id: 'c-1' });

    assert.deepEqual(
      calls.map((c) => c.path),
      ['/contacts/c-1'],
    );
    assert.deepEqual(model.units, []);
    assert.deepEqual(model.leases, []);
    assert.deepEqual(model.leads, []);
  });

  test('a full contact still loads the records its tags point at', async function (assert) {
    const calls = stubAuth(this.owner, {
      respond: (path) =>
        path === '/contacts/c-1'
          ? {
              data: { id: 'c-1', accessLevel: 'FULL', tags: ['owner', 'lead'] },
            }
          : { data: { data: [] } },
    });
    const route = this.owner.lookup('route:contacts/detail');

    await route.model({ contact_id: 'c-1' });

    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.startsWith('/properties/units?ownerId=c-1')));
    assert.ok(paths.some((p) => p.startsWith('/leads?contactId=c-1')));
  });
});
