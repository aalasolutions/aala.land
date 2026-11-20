import { module, test } from 'qunit';
import { setupApplicationTest } from 'land/tests/helpers';
import { click, currentURL, triggerEvent, visit } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Controller from '@ember/controller';
import Route from '@ember/routing/route';
import Service from '@ember/service';

const PLAN = {
  fileName: 'people.csv',
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
      reason: 'Already exists in Makkah',
      values: { firstName: 'Sara', phone: '+966501234567' },
    },
    {
      row: 5,
      status: 'error',
      column: 'Email',
      reason: 'Enter a valid email address.',
      values: { firstName: 'Omar', email: 'nope' },
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
      values: { firstName: 'Sara' },
      reason: 'Already exists in Makkah',
    },
    {
      row: 5,
      values: { firstName: 'Omar' },
      reason: 'Enter a valid email address.',
    },
  ],
};

module('Acceptance | import contacts', function (hooks) {
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
    return new File(['First Name\nSara'], 'people.csv', { type: 'text/csv' });
  }

  test('walks upload, confirm and result', async function (assert) {
    await visit('/import/contacts');
    assert.strictEqual(currentURL(), '/import/contacts');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'upload');
    assert
      .dom('[data-test-import-region-field]')
      .doesNotExist('one region needs no picker');
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
      .dom('[data-test-import-confirm-button]')
      .hasText('Import 2 contacts');
    assert.deepEqual(this.calls, [
      ['preview', 'contacts', 'people.csv', undefined],
    ]);

    await click('[data-test-import-confirm-button]');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'result');
    assert
      .dom('[data-test-import-result-counts] [data-test-wu-alert-title]')
      .hasText('Added 2 rows, skipped 1 row, 1 row not imported');
    assert.dom('[data-test-import-failed="csv"]').exists();
    assert.deepEqual(this.calls[1], [
      'commit',
      'contacts',
      'people.csv',
      undefined,
    ]);

    await click('[data-test-import-another]');
    assert
      .dom('[data-test-import-step]')
      .hasAttribute('data-test-import-step', 'upload');
  });

  test('a company with several regions sees an optional picker and can check without it', async function (assert) {
    this.regions = [
      { code: 'makkah', name: 'Makkah' },
      { code: 'punjab', name: 'Punjab' },
    ];
    await visit('/import/contacts');
    assert.dom('[data-test-import-region-field]').exists();
    await triggerEvent('[data-test-file-drop-input]', 'change', {
      files: [csv()],
    });
    assert
      .dom('[data-test-import-check]')
      .isEnabled('no region needed to check');
    await click('[data-test-import-check]');
    assert.deepEqual(
      this.calls[0],
      ['preview', 'contacts', 'people.csv', undefined],
      'preview runs with no region',
    );
  });

  test('a free plan sees the locked notice instead of the upload box', async function (assert) {
    this.tier = 'FREE';
    await visit('/import/contacts');
    assert.dom('[data-test-import-locked]').exists();
    assert.dom('[data-test-import-see-plans]').exists();
    assert.dom('[data-test-import-upload]').doesNotExist();
  });

  test('a manager is sent back to contacts', async function (assert) {
    this.role = 'manager';
    await visit('/import/contacts');
    assert.strictEqual(currentURL(), '/contacts');
  });
});
