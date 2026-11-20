import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, render, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const PLAN = {
  willAdd: 2,
  willSkip: 1,
  failed: 1,
  fileErrors: [],
  rows: [
    { row: 2, status: 'add' },
    { row: 3, status: 'add' },
    { row: 4, status: 'skip', reason: 'Already exists', values: {} },
    { row: 5, status: 'error', column: 'Email', reason: 'Bad', values: {} },
  ],
};

const RESULT = {
  added: 2,
  skipped: 1,
  failed: 1,
  failedRows: [{ row: 5, values: { firstName: 'Omar' }, reason: 'Bad' }],
};

function csv() {
  return new File(['First Name\nSara'], 'people.csv', { type: 'text/csv' });
}

module(
  'Integration | Component | data-transfer/import-contacts',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      const context = this;
      this.role = 'company_admin';
      this.tier = 'PRO';
      this.regions = [{ code: 'makkah', name: 'Makkah' }];
      this.calls = [];
      this.errors = [];
      this.hold = false;
      this.release = null;

      this.owner.register(
        'service:session',
        class extends Service {
          get data() {
            return {
              authenticated: {
                user: { role: context.role },
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
            if (context.hold) {
              await new Promise((resolve) => (context.release = resolve));
            }
            return RESULT;
          }
        },
      );
      this.owner.register(
        'service:notifications',
        class extends Service {
          error(message) {
            context.errors.push(message);
          }
          success() {}
        },
      );
    });

    test('walks upload, confirm and result', async function (assert) {
      await render(hbs`<DataTransfer::ImportContacts />`);
      assert
        .dom('[data-test-import-step]')
        .hasAttribute('data-test-import-step', 'upload');
      assert.dom('[data-test-import-region-field]').doesNotExist();
      assert.dom('[data-test-import-check]').isDisabled();

      await triggerEvent('[data-test-file-drop-input]', 'change', {
        files: [csv()],
      });
      await click('[data-test-import-check]');
      assert
        .dom('[data-test-import-step]')
        .hasAttribute('data-test-import-step', 'confirm');
      assert
        .dom('[data-test-import-counts] [data-test-wu-alert-title]')
        .hasText('Will add 2, skip 1, and 1 rows have errors');
      assert
        .dom('[data-test-import-problems] [data-test-data-table-row]')
        .exists({ count: 2 });
      assert
        .dom('[data-test-import-confirm-button]')
        .hasText('Import 2 contacts');

      await click('[data-test-import-confirm-button]');
      assert
        .dom('[data-test-import-step]')
        .hasAttribute('data-test-import-step', 'result');
      assert
        .dom('[data-test-import-result-counts] [data-test-wu-alert-title]')
        .hasText('Added 2, skipped 1, 1 not imported');
      assert.dom('[data-test-import-failed="csv"]').exists();
      assert.deepEqual(this.calls, [
        ['preview', 'contacts', 'people.csv', undefined],
        ['commit', 'contacts', 'people.csv', undefined],
      ]);

      await click('[data-test-import-another]');
      assert
        .dom('[data-test-import-step]')
        .hasAttribute('data-test-import-step', 'upload');
    });

    test('several regions show an optional picker that is passed to preview', async function (assert) {
      this.regions = [
        { code: 'makkah', name: 'Makkah' },
        { code: 'punjab', name: 'Punjab' },
      ];
      await render(hbs`<DataTransfer::ImportContacts />`);
      assert.dom('[data-test-import-region-field]').exists();
      await triggerEvent('[data-test-file-drop-input]', 'change', {
        files: [csv()],
      });
      assert.dom('[data-test-import-check]').isEnabled();
      await click('[data-test-import-check]');
      assert.deepEqual(this.calls[0], [
        'preview',
        'contacts',
        'people.csv',
        undefined,
      ]);
    });

    test('a free plan sees the locked notice instead of the upload box', async function (assert) {
      this.tier = 'FREE';
      await render(hbs`<DataTransfer::ImportContacts />`);
      assert.dom('[data-test-import-locked]').exists();
      assert.dom('[data-test-import-see-plans]').exists();
      assert.dom('[data-test-import-upload]').doesNotExist();
    });

    test('a commit that lands after a reset is dropped', async function (assert) {
      this.hold = true;
      await render(hbs`<DataTransfer::ImportContacts />`);
      await triggerEvent('[data-test-file-drop-input]', 'change', {
        files: [csv()],
      });
      await click('[data-test-import-check]');

      const pending = click('[data-test-import-confirm-button]');
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.dom('[data-test-import-confirm-button]').isDisabled('busy');

      await click('[data-test-import-choose-another]');
      assert
        .dom('[data-test-import-step]')
        .hasAttribute('data-test-import-step', 'upload');

      this.release();
      await pending;
      assert
        .dom('[data-test-import-step]')
        .hasAttribute(
          'data-test-import-step',
          'upload',
          'stale result dropped',
        );
      assert.dom('[data-test-import-check]').isDisabled('no file after reset');
      assert.strictEqual(this.errors.length, 0, 'no error toast');
    });
  },
);
