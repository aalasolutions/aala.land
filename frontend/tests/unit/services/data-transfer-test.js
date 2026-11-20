import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { EXPORT_PATHS, GENERIC_ERROR } from 'land/services/data-transfer';

function jsonResponse(status, body) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

module('Unit | Service | data-transfer', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.calls = [];
    const auth = this.owner.lookup('service:auth');
    auth.authorizedFetch = async (url, options = {}) => {
      this.calls.push({ url, options });
      return this.nextResponse;
    };
    this.service = this.owner.lookup('service:data-transfer');
    this.file = new File(['a,b'], 'rows.csv', { type: 'text/csv' });
  });

  test('upload unwraps the data envelope and sends the region only when set', async function (assert) {
    this.nextResponse = jsonResponse(200, {
      success: true,
      data: { willAdd: 2 },
    });
    const plan = await this.service.preview('contacts', this.file, 'makkah');
    assert.deepEqual(plan, { willAdd: 2 });

    const { url, options } = this.calls[0];
    assert.true(url.endsWith('/data-transfer/contacts/preview'));
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.body.get('regionCode'), 'makkah');
    assert.strictEqual(options.body.get('file').name, 'rows.csv');

    this.nextResponse = jsonResponse(200, {
      success: true,
      data: { added: 2 },
    });
    await this.service.commit('contacts', this.file, '');
    assert.false(
      this.calls[1].options.body.has('regionCode'),
      'an empty region is left off the form',
    );
    assert.true(this.calls[1].url.endsWith('/data-transfer/contacts/commit'));
  });

  test('a string message from the API is thrown as the error', async function (assert) {
    this.nextResponse = jsonResponse(403, {
      message: 'This plan does not include this feature.',
    });
    await assert.rejects(
      this.service.preview('contacts', this.file),
      /This plan does not include this feature\./,
    );
  });

  test('a list of validation messages is joined into one sentence', async function (assert) {
    this.nextResponse = jsonResponse(400, {
      message: ['format must be csv or xlsx.', 'rows must be an array.'],
    });
    await assert.rejects(
      this.service.failedFile('contacts', [], 'pdf'),
      /format must be csv or xlsx\. rows must be an array\./,
    );
  });

  test('a response without a JSON body falls back to the generic message', async function (assert) {
    this.nextResponse = new Response('Payload Too Large', { status: 413 });
    await assert.rejects(
      this.service.commit('contacts', this.file),
      new RegExp(GENERIC_ERROR.replace('.', '\\.')),
    );
  });

  test('template and export return the raw response with the format in the query', async function (assert) {
    this.nextResponse = new Response('a,b', { status: 200 });
    const template = await this.service.template('contacts', 'xlsx');
    assert.strictEqual(template, this.nextResponse);
    assert.true(
      this.calls[0].url.endsWith(
        '/data-transfer/contacts/template?format=xlsx',
      ),
    );

    this.nextResponse = new Response('a,b', { status: 200 });
    await this.service.exportList('contacts', { regionCode: 'makkah' }, 'csv');
    assert.true(
      this.calls[1].url.endsWith(
        '/contacts/export?regionCode=makkah&format=csv',
      ),
    );
  });

  test('notesFile posts the note rows as JSON with the format in the query', async function (assert) {
    this.nextResponse = new Response('a,b', { status: 200 });
    const rows = [{ values: { asset: 'A', link: 'https://x/y' }, reason: 'r' }];
    const response = await this.service.notesFile('units', rows, 'xlsx');
    assert.strictEqual(response, this.nextResponse);
    const { url, options } = this.calls[0];
    assert.true(url.endsWith('/data-transfer/units/notes-file?format=xlsx'));
    assert.strictEqual(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { rows });
  });

  test('export maps the units entity onto the properties module route', async function (assert) {
    assert.deepEqual(EXPORT_PATHS, { units: 'properties' });
    this.nextResponse = new Response('a,b', { status: 200 });
    await this.service.exportList(
      'units',
      { regionCode: 'makkah', status: 'rented' },
      'xlsx',
    );
    assert.true(
      this.calls[0].url.endsWith(
        '/properties/export?regionCode=makkah&status=rented&format=xlsx',
      ),
    );
  });
});
