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
    assert.strictEqual(model.totals.units, 0);
    assert.strictEqual(model.firstOpenLead, null);
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

    assert.deepEqual(
      calls.map((c) => c.path),
      [
        '/contacts/c-1',
        '/properties/units?ownerId=c-1&page=1&limit=50',
        '/leases?contactId=c-1&archived=include&page=1&limit=50',
        '/leads?contactId=c-1&page=1&limit=50',
        '/leases?contactId=c-1&status=ACTIVE&page=1&limit=1',
        '/leads?contactId=c-1&open=true&page=1&limit=1',
        '/properties/units?ownerId=c-1&status=available&page=1&limit=1',
      ],
    );
  });

  test('totals come from each list total, not the rows loaded', async function (assert) {
    const lease = { id: 'le-1', status: 'ACTIVE' };
    const lead = { id: 'l-1', status: 'NEW' };
    const answers = {
      '/properties/units?ownerId=c-1&page=1&limit=50': {
        data: [{ id: 'u-1' }],
        total: 150,
      },
      '/leases?contactId=c-1&archived=include&page=1&limit=50': {
        data: [lease],
        total: 7,
      },
      '/leads?contactId=c-1&page=1&limit=50': { data: [lead], total: 60 },
      '/leases?contactId=c-1&status=ACTIVE&page=1&limit=1': {
        data: [lease],
        total: 2,
      },
      '/leads?contactId=c-1&open=true&page=1&limit=1': {
        data: [lead],
        total: 55,
      },
      '/properties/units?ownerId=c-1&status=available&page=1&limit=1': {
        data: [{ id: 'u-1' }],
        total: 40,
      },
    };
    stubAuth(this.owner, {
      respond: (path) =>
        path === '/contacts/c-1'
          ? {
              data: { id: 'c-1', accessLevel: 'FULL', tags: ['owner', 'lead'] },
            }
          : { data: answers[path] },
    });
    const route = this.owner.lookup('route:contacts/detail');

    const model = await route.model({ contact_id: 'c-1' });

    assert.deepEqual(model.totals, {
      units: 150,
      leases: 7,
      leads: 60,
      activeLeases: 2,
      openLeads: 55,
      availableUnits: 40,
    });
    assert.deepEqual(model.units, [{ id: 'u-1' }]);
    assert.strictEqual(model.firstActiveLease, lease);
    assert.strictEqual(model.firstOpenLead, lead);
  });

  test('a failed list falls back to empty rows and a zero total', async function (assert) {
    stubAuth(this.owner, {
      respond: (path) =>
        path === '/contacts/c-1'
          ? { data: { id: 'c-1', accessLevel: 'FULL', tags: ['owner'] } }
          : new Error('boom'),
    });
    const route = this.owner.lookup('route:contacts/detail');

    const model = await route.model({ contact_id: 'c-1' });

    assert.deepEqual(model.units, []);
    assert.strictEqual(model.totals.units, 0);
    assert.strictEqual(model.totals.availableUnits, 0);
    assert.strictEqual(model.firstActiveLease, null);
  });

  test('leases load for every full contact, archived ones included', async function (assert) {
    const calls = stubAuth(this.owner, {
      respond: (path) =>
        path === '/contacts/c-1'
          ? { data: { id: 'c-1', accessLevel: 'FULL', tags: [] } }
          : { data: { data: [] } },
    });
    const route = this.owner.lookup('route:contacts/detail');

    await route.model({ contact_id: 'c-1' });

    assert.ok(
      calls.some(
        (c) =>
          c.path === '/leases?contactId=c-1&archived=include&page=1&limit=50',
      ),
      'no tenant tag, still fetched',
    );
    const paths = calls.map((c) => c.path);
    assert.notOk(paths.some((p) => p.startsWith('/leads')));
    assert.notOk(paths.some((p) => p.startsWith('/properties')));
  });

  test('a refresh keeps the open tab; leaving the page forgets it', function (assert) {
    const route = this.owner.lookup('route:contacts/detail');
    const controller = this.owner.lookup('controller:contacts/detail');
    controller.setTab('history');

    controller.resetEditState();
    assert.strictEqual(controller.tab, 'history');

    route.resetController(controller, true);
    assert.strictEqual(controller.tab, null);
  });

  test('leaving the page resets every tab to its first page', function (assert) {
    const route = this.owner.lookup('route:contacts/detail');
    const controller = this.owner.lookup('controller:contacts/detail');
    controller.pages = { leads: 1, leases: 3, properties: 2 };
    controller.pagedRows = { leases: [{ id: 'le-9' }] };

    route.resetController(controller, true);

    assert.deepEqual(controller.pages, { leads: 1, leases: 1, properties: 1 });
    assert.deepEqual(controller.pagedRows, {});
  });
});
