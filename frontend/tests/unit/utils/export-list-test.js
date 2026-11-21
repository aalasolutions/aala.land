import { module, test } from 'qunit';
import { downloadExport } from 'land/utils/export-list';

function fileResponse(truncated) {
  return {
    headers: new Headers(truncated ? { 'X-Export-Truncated': 'true' } : {}),
    async blob() {
      return new Blob(['a']);
    },
  };
}

module('Unit | Utility | export-list', function (hooks) {
  let realCreate;

  hooks.beforeEach(function () {
    realCreate = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:test';
  });

  hooks.afterEach(function () {
    URL.createObjectURL = realCreate;
  });

  test('saves the file and names the noun when the export was capped', async function (assert) {
    const calls = [];
    const infos = [];
    await downloadExport(
      {
        dataTransfer: {
          async exportList(entity, params, format) {
            calls.push([entity, params, format]);
            return fileResponse(true);
          },
        },
        notifications: {
          info: (m) => infos.push(m),
          error: () => assert.ok(false, 'no error expected'),
        },
      },
      {
        entity: 'units',
        params: { regionCode: 'makkah' },
        format: 'xlsx',
        noun: 'properties',
      },
    );
    assert.deepEqual(calls, [['units', { regionCode: 'makkah' }, 'xlsx']]);
    assert.deepEqual(infos, [
      'Only the first 20,000 properties were exported. Narrow the filters to export the rest.',
    ]);
  });

  test('a complete export shows no notice', async function (assert) {
    const infos = [];
    await downloadExport(
      {
        dataTransfer: {
          async exportList() {
            return fileResponse(false);
          },
        },
        notifications: { info: (m) => infos.push(m), error() {} },
      },
      { entity: 'contacts', params: {}, format: 'csv', noun: 'contacts' },
    );
    assert.deepEqual(infos, []);
  });

  test('a failed request is reported in plain words', async function (assert) {
    const errors = [];
    await downloadExport(
      {
        dataTransfer: {
          async exportList() {
            throw new Error('This plan does not include this feature.');
          },
        },
        notifications: {
          info: () => assert.ok(false, 'no wait notice after a fast failure'),
          error: (m) => errors.push(m),
        },
      },
      { entity: 'contacts', params: {}, format: 'csv', noun: 'contacts' },
    );
    assert.deepEqual(errors, ['This plan does not include this feature.']);
  });
});
