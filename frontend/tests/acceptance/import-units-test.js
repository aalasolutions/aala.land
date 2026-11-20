import { module, test } from 'qunit';
import { setupApplicationTest } from 'land/tests/helpers';
import { click, currentURL, triggerEvent, visit } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Controller from '@ember/controller';
import Route from '@ember/routing/route';
import Service from '@ember/service';

const PLAN = {
  fileName: 'units.csv',
  willAdd: 2,
  willSkip: 1,
  failed: 1,
  fileErrors: [],
  rows: [
    { row: 2, status: 'add' },
    { row: 3, status: 'add' },
    {
      row: 4,
      status: 'skip',
      reason: 'Already exists in Olaya Towers',
      values: { asset: 'Olaya Towers', unitNumber: '1204' },
    },
    {
      row: 5,
      status: 'error',
      column: 'Sub Type',
      reason: 'Use one of: APARTMENT, VILLA.',
      values: { asset: 'Olaya Towers', unitNumber: '1205', subType: 'FLAT' },
    },
  ],
};

const RESULT = {
  added: 2,
  skipped: 1,
  failed: 1,
  failedRows: [
    {
      row: 4,
      values: { unitNumber: '1204' },
      reason: 'Already exists in Olaya Towers',
    },
    {
      row: 5,
      values: { unitNumber: '1205' },
      reason: 'Use one of: APARTMENT, VILLA.',
    },
  ],
  notes: [
    {
      id: 'unit-3',
      row: 3,
      values: { asset: 'Olaya Towers', unitNumber: '1206' },
      reason: 'Owner not found, unit imported without owner.',
      parentIds: ['loc-9'],
    },
  ],
};

module('Acceptance | import units', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    const context = this;
    this.role = 'company_admin';
    this.tier = 'PRO';
    this.regions = [{ code: 'makkah', name: 'Makkah' }];
    this.calls = [];

    this.owner.register('template:application', hbs`{{outlet}}`);
    this.owner.register('route:application', class extends Route {});
    this.owner.register('controller:application', class extends Controller {});
    this.owner.register(
      'service:session',
      class extends Service {
        isAuthenticated = true;
        needsOnboarding = false;
        get data() {
          return {
            authenticated: {
              user: { id: 'user-1', role: context.role },
              subscriptionTier: context.tier,
            },
          };
        }
      },
    );
    this.owner.register(
      'service:region',
      class extends Service {
        get regions() {
          return context.regions;
        }
        activeRegion = null;
      },
    );
    this.owner.register(
      'service:data-transfer',
      class extends Service {
        async preview(entity, file, regionCode) {
          context.calls.push(['preview', entity, file.name, regionCode]);
          return PLAN;
        }
        async commit(entity, file, regionCode) {
          context.calls.push(['commit', entity, file.name, regionCode]);
          return RESULT;
        }
      },
    );
    this.owner.register(
      'service:notifications',
      class extends Service {
        error() {}
        success() {}
      },
    );
  });

  function csv() {
    return new File(['City\nRiyadh'], 'units.csv', { type: 'text/csv' });
  }

  test('walks upload, confirm and result', async function (assert) {
    await visit('/import/units');
    assert.strictEqual(currentURL(), '/import/units');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'upload');
    assert.dom('[data-test-import-units]').exists('frame renders');
    assert
      .dom('[data-test-import-region-field]')
      .doesNotExist('units take their region from the city');
    assert.dom('[data-test-import-check]').isDisabled();

    await triggerEvent('[data-test-file-drop-input]', 'change', {
      files: [csv()],
    });
    assert.dom('[data-test-import-check]').isEnabled();

    await click('[data-test-import-check]');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'confirm');
    assert
      .dom('[data-test-import-counts] [data-test-wu-alert-title]')
      .hasText('Will add 2 rows, skip 1 row, and 1 row has an error');
    assert
      .dom('[data-test-import-problems] [data-test-data-table-row]')
      .exists({ count: 2 });
    assert
      .dom('[data-test-import-failed="csv"]')
      .exists('the error row can be downloaded before importing');
    assert
      .dom('[data-test-import-confirm-button]')
      .hasText('Import 2 properties');
    assert.deepEqual(this.calls, [
      ['preview', 'units', 'units.csv', undefined],
    ]);

    await click('[data-test-import-confirm-button]');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'result');
    assert
      .dom('[data-test-import-result-counts] [data-test-wu-alert-title]')
      .hasText('Added 2 rows, skipped 1 row, 1 row not imported');
    assert.dom('[data-test-import-failed="csv"]').exists();
    assert
      .dom('[data-test-import-notes-count] [data-test-wu-alert-title]')
      .hasText('1 property imported without an owner');
    assert
      .dom('[data-test-import-notes] [data-test-import-note-link]')
      .hasText('1206')
      .hasAttribute('href', '/properties/loc-9/unit/unit-3');
    assert.dom('[data-test-import-notes-download="csv"]').exists();
    assert.deepEqual(this.calls[1], [
      'commit',
      'units',
      'units.csv',
      undefined,
    ]);

    await click('[data-test-import-another]');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'upload');
  });

  test('a company with several regions still sees no region picker', async function (assert) {
    this.regions = [
      { code: 'makkah', name: 'Makkah' },
      { code: 'punjab', name: 'Punjab' },
    ];
    await visit('/import/units');
    assert.dom('[data-test-import-region-field]').doesNotExist();
    await triggerEvent('[data-test-file-drop-input]', 'change', {
      files: [csv()],
    });
    await click('[data-test-import-check]');
    assert.deepEqual(this.calls[0], [
      'preview',
      'units',
      'units.csv',
      undefined,
    ]);
  });

  test('a free plan sees the locked notice instead of the upload box', async function (assert) {
    this.tier = 'FREE';
    await visit('/import/units');
    assert.dom('[data-test-import-locked]').exists();
    assert.dom('[data-test-import-see-plans]').exists();
    assert.dom('[data-test-import-upload]').doesNotExist();
  });

  test('a manager is sent back to properties', async function (assert) {
    this.role = 'manager';
    await visit('/import/units');
    assert.strictEqual(currentURL(), '/properties');
  });
});
