import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { localMidnightIso } from 'land/utils/local-date';

module('Unit | Controller | contacts/index', function (hooks) {
  setupTest(hooks);

  // A company admin defaults to every region; these cases switch the toggle off like a user would.
  function makeController(ctx, { role = 'company_admin', regions } = {}) {
    const controller = ctx.owner.lookup('controller:contacts/index');
    controller.auth = { currentUser: { role } };
    controller.regionService = regions;
    controller.allRegions = 'false';
    return controller;
  }

  test('exportParams mirrors the list query for the active region', function (assert) {
    const controller = makeController(this, {
      regions: {
        regionCode: 'makkah',
        activeRegion: { code: 'makkah', timezone: 'Asia/Riyadh' },
        regions: [{ code: 'makkah', timezone: 'Asia/Riyadh' }],
      },
    });
    controller.search = 'Sara';
    controller.tag = 'tenant';
    controller.agentId = 'agent-1';
    controller.isWhatsapp = true;
    controller.company = 'Acme';
    controller.companyExact = 'true';
    controller.nationality = 'Saudi';
    controller.dateFrom = '2026-11-01';
    controller.dateTo = '2026-11-19';

    assert.deepEqual(controller.exportParams, {
      regionCode: 'makkah',
      search: 'Sara',
      tag: 'tenant',
      agentId: 'agent-1',
      isWhatsapp: 'true',
      company: 'Acme',
      companyExact: 'true',
      nationality: 'Saudi',
      dateFrom: localMidnightIso('2026-11-01', 0, 'Asia/Riyadh'),
      dateTo: localMidnightIso('2026-11-19', 1, 'Asia/Riyadh'),
    });
  });

  test('exportParams sends allRegions instead of a region when the toggle is on', function (assert) {
    const controller = makeController(this, {
      regions: { regionCode: 'makkah', activeRegion: null, regions: [] },
    });
    controller.allRegions = 'true';
    assert.deepEqual(controller.exportParams, { allRegions: 'true' });
  });

  test('exportParams prefers the explicit region query param', function (assert) {
    const controller = makeController(this, {
      regions: {
        regionCode: 'makkah',
        activeRegion: { code: 'makkah', timezone: 'Asia/Riyadh' },
        regions: [{ code: 'punjab', timezone: 'Asia/Karachi' }],
      },
    });
    controller.region = 'punjab';
    controller.dateFrom = '2026-11-01';
    assert.deepEqual(controller.exportParams, {
      regionCode: 'punjab',
      dateFrom: localMidnightIso('2026-11-01', 0, 'Asia/Karachi'),
    });
  });

  test('exportContacts saves the file and warns when the export was capped', async function (assert) {
    const controller = makeController(this, {
      regions: { regionCode: 'makkah', activeRegion: null, regions: [] },
    });
    const calls = [];
    const infos = [];
    controller.dataTransfer = {
      async exportList(entity, params, format) {
        calls.push([entity, params, format]);
        return {
          headers: new Headers({ 'X-Export-Truncated': 'true' }),
          async blob() {
            return new Blob(['a']);
          },
        };
      },
    };
    controller.notifications = {
      info: (m) => infos.push(m),
      error: () => assert.ok(false, 'no error expected'),
    };
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:test';
    try {
      await controller.exportContacts('csv');
    } finally {
      URL.createObjectURL = realCreate;
    }
    assert.deepEqual(calls, [['contacts', { regionCode: 'makkah' }, 'csv']]);
    assert.strictEqual(infos.length, 1);
    assert.ok(infos[0].startsWith('Only the first 20,000 contacts'));
  });

  test('exportContacts reports a failed request in plain words', async function (assert) {
    const controller = makeController(this, {
      regions: { regionCode: 'makkah', activeRegion: null, regions: [] },
    });
    const errors = [];
    controller.dataTransfer = {
      async exportList() {
        throw new Error('This plan does not include this feature.');
      },
    };
    controller.notifications = { info() {}, error: (m) => errors.push(m) };
    await controller.exportContacts('xlsx');
    assert.deepEqual(errors, ['This plan does not include this feature.']);
  });
});
