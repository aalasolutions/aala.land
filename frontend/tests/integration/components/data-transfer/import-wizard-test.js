import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, render, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import { UNIT_NOTES } from 'land/components/data-transfer/import-units';

const PLAN = {
  willAdd: 2,
  willSkip: 1,
  failed: 0,
  fileErrors: [],
  rows: [
    { row: 2, status: 'add' },
    {
      row: 3,
      status: 'add',
      reason: 'Owner not found, unit imported without owner.',
      values: { asset: 'Olaya Towers', unitNumber: '1205' },
    },
    {
      row: 4,
      status: 'skip',
      reason: 'Already exists in Olaya Towers',
      values: { asset: 'Olaya Towers', unitNumber: '1204', status: 'rented' },
    },
  ],
};

const OWNER_NOTE = 'Owner not found, unit imported without owner.';

const RESULT = {
  added: 2,
  skipped: 1,
  failed: 1,
  failedRows: [
    {
      row: 5,
      values: { asset: 'Olaya Towers', unitNumber: '1207' },
      reason: 'This cell is required.',
      column: 'Sub Type',
    },
  ],
  notes: [
    {
      id: 'unit-1',
      row: 3,
      values: { asset: 'Olaya Towers', unitNumber: '1205' },
      reason: OWNER_NOTE,
      parentIds: ['loc-1'],
    },
  ],
};

// One error row, one skip and one note: only the error row belongs in the confirm-screen download.
const MIXED_PLAN = {
  willAdd: 1,
  willSkip: 1,
  failed: 1,
  fileErrors: [],
  rows: [
    {
      row: 2,
      status: 'add',
      reason: OWNER_NOTE,
      values: { asset: 'Olaya Towers', unitNumber: '1205' },
    },
    {
      row: 3,
      status: 'skip',
      reason: 'Already exists in Olaya Towers',
      values: { asset: 'Olaya Towers', unitNumber: '1204' },
    },
    {
      row: 4,
      status: 'error',
      column: 'Sub Type',
      reason: 'This cell is required.',
      values: { asset: 'Olaya Towers', unitNumber: '1207' },
    },
  ],
};

function csv() {
  return new File(['City\nRiyadh'], 'units.csv', { type: 'text/csv' });
}

module(
  'Integration | Component | data-transfer/import-wizard',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      const context = this;
      this.owner.setupRouter();
      this.plan = PLAN;
      this.set('notes', UNIT_NOTES);
      this.regions = [
        { code: 'makkah', name: 'Makkah' },
        { code: 'punjab', name: 'Punjab' },
      ];
      this.calls = [];
      this.set('nouns', { singular: 'property', plural: 'properties' });
      this.set('valueColumns', [
        { name: 'Asset', valuePath: 'asset', width: 160 },
        { name: 'Unit Number', valuePath: 'unitNumber', width: 110 },
      ]);

      this.owner.register(
        'service:session',
        class extends Service {
          get data() {
            return {
              authenticated: {
                user: { role: 'company_admin' },
                subscriptionTier: 'PRO',
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
        },
      );
      this.owner.register(
        'service:data-transfer',
        class extends Service {
          async preview(entity, file, regionCode) {
            context.calls.push(['preview', entity, file.name, regionCode]);
            return context.plan;
          }
          async commit(entity, file, regionCode) {
            context.calls.push(['commit', entity, file.name, regionCode]);
            return RESULT;
          }
          // Throws after recording, so no blob download runs inside the test.
          async failedFile(entity, rows, format) {
            context.calls.push(['failedFile', entity, rows, format]);
            throw new Error('stop');
          }
          async notesFile(entity, rows, format) {
            context.calls.push(['notesFile', entity, rows, format]);
            throw new Error('stop');
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

    test('takes the entity, copy and columns from its args and hides the region picker when told to', async function (assert) {
      await render(hbs`
        <DataTransfer::ImportWizard
          @entity="units"
          @backRoute="properties.index"
          @nouns={{this.nouns}}
          @showRegionPicker={{false}}
          @intro="Units intro"
          @valueColumns={{this.valueColumns}}
          @notes={{this.notes}}
        />
      `);
      assert.dom('[data-test-import-intro]').hasText('Units intro');
      assert
        .dom('[data-test-import-region-field]')
        .doesNotExist('picker off despite two regions');

      await triggerEvent('[data-test-file-drop-input]', 'change', {
        files: [csv()],
      });
      await click('[data-test-import-check]');
      assert
        .dom('[data-test-import-counts] [data-test-wu-alert-title]')
        .hasText('Will add 2 rows, skip 1 row, and 0 rows have errors');
      assert
        .dom('[data-test-import-counts] [data-test-wu-alert-description]')
        .hasText(
          'Skipped rows already exist or repeat an earlier row in the file. Rows with errors are not imported; fix them in the file and upload it again later.',
        );
      assert
        .dom('[data-test-import-confirm-button]')
        .hasText('Import 2 properties');
      assert
        .dom('[data-test-import-problems] [data-test-data-table-row]')
        .exists({ count: 2 }, 'the noted add row and the skipped row');
      assert
        .dom('[data-test-import-problems] [data-test-data-table-row="3"]')
        .includesText('Note');
      assert
        .dom('[data-test-import-problems] [data-test-data-table-row="4"]')
        .includesText(
          'Skipped',
          'a Status cell in the sheet does not shadow the row status',
        );
      assert
        .dom('[data-test-import-problems] [data-test-data-table-row="4"]')
        .hasClass('is-muted');
      assert
        .dom('[data-test-import-problems]')
        .includesText('Owner not found, unit imported without owner.');
      assert.dom('[data-test-import-problems]').includesText('Unit Number');
      assert.dom('[data-test-import-problems]').includesText('1204');
      assert
        .dom('[data-test-import-failed]')
        .doesNotExist('no error rows, so nothing to download yet');

      await click('[data-test-import-confirm-button]');
      assert
        .dom('[data-test-import-result-counts] [data-test-wu-alert-title]')
        .hasText('Added 2 rows, skipped 1 row, 1 row not imported');
      assert.dom('[data-test-import-back]').hasText('Back to properties');
      assert
        .dom('[data-test-import-notes-count] [data-test-wu-alert-title]')
        .hasText('1 property imported without an owner');
      assert
        .dom('[data-test-import-notes] [data-test-data-table-row]')
        .exists({ count: 1 });
      assert.dom('[data-test-import-notes]').includesText('Olaya Towers');
      assert.dom('[data-test-import-notes]').includesText(OWNER_NOTE);
      assert
        .dom('[data-test-import-note-link]')
        .hasText('1205')
        .hasAttribute('href', '/properties/loc-1/unit/unit-1');
      await click('[data-test-import-failed="csv"]');
      await click('[data-test-import-notes-download="xlsx"]');
      assert.deepEqual(this.calls, [
        ['preview', 'units', 'units.csv', undefined],
        ['commit', 'units', 'units.csv', undefined],
        [
          'failedFile',
          'units',
          [
            {
              values: { asset: 'Olaya Towers', unitNumber: '1207' },
              reason: 'This cell is required.',
              column: 'Sub Type',
            },
          ],
          'csv',
        ],
        [
          'notesFile',
          'units',
          [
            {
              values: {
                asset: 'Olaya Towers',
                unitNumber: '1205',
                link: `${window.location.origin}/properties/loc-1/unit/unit-1`,
              },
              reason: OWNER_NOTE,
            },
          ],
          'xlsx',
        ],
      ]);
    });

    test('the confirm screen downloads the error rows only, with their column', async function (assert) {
      this.plan = MIXED_PLAN;
      await render(hbs`
        <DataTransfer::ImportWizard
          @entity="units"
          @backRoute="properties.index"
          @nouns={{this.nouns}}
          @showRegionPicker={{false}}
          @intro="Units intro"
          @valueColumns={{this.valueColumns}}
          @notes={{this.notes}}
        />
      `);
      await triggerEvent('[data-test-file-drop-input]', 'change', {
        files: [csv()],
      });
      await click('[data-test-import-check]');
      assert
        .dom('[data-test-import-counts] [data-test-wu-alert-title]')
        .hasText('Will add 1 row, skip 1 row, and 1 row has an error');
      assert
        .dom('[data-test-import-problems] [data-test-data-table-row]')
        .exists({ count: 3 }, 'the table still lists note, skip and error');
      assert.dom('[data-test-import-failed="csv"]').exists();
      assert.dom('[data-test-import-failed="xlsx"]').exists();
      await click('[data-test-import-failed="xlsx"]');
      assert.deepEqual(this.calls[1], [
        'failedFile',
        'units',
        [
          {
            values: { asset: 'Olaya Towers', unitNumber: '1207' },
            reason: 'This cell is required.',
            column: 'Sub Type',
          },
        ],
        'xlsx',
      ]);
      assert
        .dom('[data-test-import-step]')
        .hasAttribute('data-test-import-step', 'confirm', 'still on confirm');
    });

    test('without a notes config the result screen shows no notes list', async function (assert) {
      await render(hbs`
        <DataTransfer::ImportWizard
          @entity="contacts"
          @backRoute="contacts.index"
          @nouns={{this.nouns}}
          @showRegionPicker={{false}}
          @intro="Contacts intro"
        />
      `);
      await triggerEvent('[data-test-file-drop-input]', 'change', {
        files: [csv()],
      });
      await click('[data-test-import-check]');
      await click('[data-test-import-confirm-button]');
      assert.dom('[data-test-import-result]').exists();
      assert.dom('[data-test-import-notes]').doesNotExist();
      assert.dom('[data-test-import-notes-count]').doesNotExist();
    });

    test('shows the region picker when asked and the company has several regions', async function (assert) {
      await render(hbs`
        <DataTransfer::ImportWizard
          @entity="contacts"
          @backRoute="contacts.index"
          @nouns={{this.nouns}}
          @showRegionPicker={{true}}
          @intro="Contacts intro"
        />
      `);
      assert.dom('[data-test-import-region-field]').exists();
    });
  },
);
