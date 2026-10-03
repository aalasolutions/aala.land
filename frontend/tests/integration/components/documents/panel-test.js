import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  render,
  click,
  fillIn,
  focus,
  triggerEvent,
  waitFor,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const DOCS = [
  {
    id: 'doc-unit',
    name: 'Title Deed',
    category: 'TITLE_DEED',
    accessLevel: 'TEAM',
    fileSize: 1024,
    createdAt: '2026-09-01T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: {
      id: 'unit-1',
      unitNumber: '101',
      areaId: 'area-1',
      assetName: 'Bay Tower',
    },
    link: { type: 'unit', id: 'unit-1', label: 'Bay Tower 101' },
  },
  {
    id: 'doc-asset',
    name: 'Building NOC',
    category: 'NOC',
    accessLevel: 'TEAM',
    fileSize: 2048,
    createdAt: '2026-09-02T10:00:00.000Z',
    uploadedBy: 'user-1',
    uploadedByName: 'Me',
    unit: null,
    link: { type: 'asset', id: 'asset-1', label: 'Bay Tower' },
  },
  {
    id: 'doc-contact',
    name: 'Passport Copy',
    category: 'ID_COPY',
    accessLevel: 'ADMIN',
    fileSize: 512,
    createdAt: '2026-09-03T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link: { type: 'contact', id: 'contact-1', label: 'Test Contact' },
  },
  {
    id: 'doc-lease',
    name: 'Tenancy Contract',
    category: 'LEASE',
    accessLevel: 'TEAM',
    fileSize: 4096,
    createdAt: '2026-09-04T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link: { type: 'lease', id: 'lease-1', label: 'Test Tenant 2026-01-01' },
    derivedFrom: 'lease',
  },
  {
    id: 'doc-work-order',
    name: 'AC Invoice',
    category: 'INVOICE',
    accessLevel: 'TEAM',
    fileSize: 256,
    createdAt: '2026-09-05T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link: { type: 'work_order', id: 'wo-1', label: 'Fix AC' },
  },
  {
    id: 'doc-library',
    name: 'Trade License',
    category: 'OTHER',
    accessLevel: 'TEAM',
    fileSize: 128,
    createdAt: '2026-09-06T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link: null,
  },
];

function listResponse(rows) {
  return {
    success: true,
    data: { data: rows, total: rows.length, page: 1, limit: 20 },
  };
}

function row(id) {
  return `[data-test-data-table-row="${id}"]`;
}

function menuItem(text) {
  const items = [
    ...document.querySelectorAll(
      '.nu-menu.is-open [data-test-nu-dropdown-item]',
    ),
  ];
  return items.find((el) => el.textContent.trim() === text);
}

// A menu opened while the drawer still slides in is re-clamped inside its ResizeObserver callback.
async function drawerSettled() {
  await waitUntil(() => {
    const drawer = document.querySelector('[data-test-nu-drawer]');
    return (
      drawer?.classList.contains('is-open') &&
      drawer.getAnimations().length === 0
    );
  });
}

async function chooseOption(triggerScope, text) {
  await click(`${triggerScope} [data-test-nu-dropdown-trigger]`);
  await click(menuItem(text));
}

module('Integration | Component | documents/panel', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    const calls = [];
    this.calls = calls;
    this.responses = { list: DOCS, lists: {} };
    const responses = this.responses;
    this.owner.register(
      'service:auth',
      class extends Service {
        currentUser = { id: 'user-1', role: 'company_admin' };
        apiBase = '/api';
        async fetchJson(path, options = {}) {
          calls.push({ path, options });
          const [base] = path.split('?');
          if (base === '/documents') return listResponse(responses.list);
          if (responses.lists[base]) return listResponse(responses.lists[base]);
          return { success: true, data: {} };
        }
        async uploadWithProgress(path, body, onProgress) {
          calls.push({ path, options: { method: 'POST', body } });
          onProgress(100);
          return { success: true, data: {} };
        }
      },
    );
    this.toasts = [];
    const toasts = this.toasts;
    this.owner.register(
      'service:notifications',
      class extends Service {
        success(message) {
          toasts.push(['success', message]);
        }
        error(message) {
          toasts.push(['error', message]);
        }
      },
    );
  });

  test('it loads rows with the fixed filters merged into the query', async function (assert) {
    this.filters = { unitId: 'unit-1', includeDerived: true };
    await render(hbs`<Documents::Panel @filters={{this.filters}} />`);
    await waitFor(row('doc-unit'));

    const listCalls = this.calls.filter((c) =>
      c.path.startsWith('/documents?'),
    );
    assert.strictEqual(listCalls.length, 1, 'one list request');
    assert.strictEqual(
      listCalls[0].path,
      '/documents?page=1&limit=20&unitId=unit-1&includeDerived=true',
    );
    assert.dom('[data-test-documents-panel]').exists();
    assert.dom('[data-test-data-table-row]').exists({ count: DOCS.length });
    assert.dom('[data-test-documents-count]').hasText('6 documents');
  });

  test('the Related column labels every link type', async function (assert) {
    await render(hbs`<Documents::Panel />`);
    await waitFor(row('doc-unit'));

    const related = (id) => `${row(id)} [data-test-document-related]`;
    assert
      .dom(`${related('doc-unit')} [data-test-document-related-type]`)
      .hasText('Unit');
    assert
      .dom(`${related('doc-unit')} [data-test-document-related-link]`)
      .hasText('Bay Tower 101');
    assert
      .dom(`${related('doc-asset')} [data-test-document-related-type]`)
      .hasText('Property');
    assert
      .dom(`${related('doc-asset')} [data-test-document-related-label]`)
      .hasText('Bay Tower', 'an asset has no page, so its label is plain text');
    assert
      .dom(`${related('doc-contact')} [data-test-document-related-type]`)
      .hasText('Contact');
    assert
      .dom(`${related('doc-contact')} [data-test-document-related-link]`)
      .hasText('Test Contact');
    assert
      .dom(`${related('doc-lease')} [data-test-document-related-type]`)
      .hasText('Lease');
    assert
      .dom(`${related('doc-lease')} [data-test-document-related-link]`)
      .hasText('Test Tenant 2026-01-01');
    assert
      .dom(`${related('doc-work-order')} [data-test-document-related-type]`)
      .hasText('Work Order');
    assert
      .dom(`${related('doc-work-order')} [data-test-document-related-link]`)
      .hasText('Fix AC');
    assert
      .dom(`${related('doc-library')} [data-test-document-related-none]`)
      .hasText('Library only');
  });

  test('@compact hides the Related column', async function (assert) {
    await render(hbs`<Documents::Panel @compact={{true}} />`);
    await waitFor(row('doc-unit'));

    assert.dom('[data-test-document-related]').doesNotExist();
  });

  test('a derived row shows its source and offers download only', async function (assert) {
    await render(hbs`<Documents::Panel />`);
    await waitFor(row('doc-lease'));

    assert
      .dom(`${row('doc-lease')} [data-test-document-derived]`)
      .hasText('via lease');
    assert.dom(`${row('doc-lease')} [data-test-download-btn]`).exists();
    assert.dom(`${row('doc-lease')} [data-test-edit-btn]`).doesNotExist();
    assert.dom(`${row('doc-lease')} [data-test-delete-btn]`).doesNotExist();

    assert
      .dom(`${row('doc-unit')} [data-test-document-derived]`)
      .doesNotExist();
    assert.dom(`${row('doc-unit')} [data-test-edit-btn]`).exists();
    assert.dom(`${row('doc-unit')} [data-test-delete-btn]`).exists();
  });

  test('@canUpload=false hides the upload button', async function (assert) {
    await render(hbs`<Documents::Panel @canUpload={{false}} />`);
    await waitFor(row('doc-unit'));

    assert.dom('[data-test-documents-upload]').doesNotExist();
  });

  test('the upload drawer sends the chosen link field', async function (assert) {
    this.responses.list = [];
    this.responses.lists['/maintenance'] = [
      { id: 'wo-1', title: 'Fix AC' },
      { id: 'wo-2', title: 'Paint lobby' },
    ];
    await render(hbs`<Documents::Panel />`);
    await waitFor('[data-test-documents-empty]');

    await click('[data-test-documents-upload]');
    await drawerSettled();
    await chooseOption('[data-test-field-related-type]', 'Work Order');
    await focus(
      '[data-test-field-related-record] [data-test-nu-dropdown-filter]',
    );
    await click(menuItem('Paint lobby'));

    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    await triggerEvent('[data-test-file-input]', 'change', { files: [file] });
    await fillIn('[data-test-field-name]', 'Lobby invoice');
    await click('[data-test-save-btn]');

    const upload = this.calls.find((c) =>
      c.path.startsWith('/documents/upload'),
    );
    assert.ok(upload, 'posted the upload');
    const body = upload.options.body;
    assert.strictEqual(body.get('workOrderId'), 'wo-2');
    assert.strictEqual(body.get('name'), 'Lobby invoice');
    assert.strictEqual(body.get('unitId'), null, 'only one link field is sent');
    assert.strictEqual(body.get('leaseId'), null);
    assert.deepEqual(this.toasts, [['success', 'Document uploaded']]);
    const listCalls = this.calls.filter((c) =>
      c.path.startsWith('/documents?'),
    );
    assert.strictEqual(listCalls.length, 2, 'reloads the list after upload');
  });

  test('a chosen type without a record blocks the upload', async function (assert) {
    this.responses.list = [];
    await render(hbs`<Documents::Panel />`);
    await waitFor('[data-test-documents-empty]');

    await click('[data-test-documents-upload]');
    await drawerSettled();
    await chooseOption('[data-test-field-related-type]', 'Lease');
    const file = new File(['pdf'], 'lease.pdf', { type: 'application/pdf' });
    await triggerEvent('[data-test-file-input]', 'change', { files: [file] });
    await click('[data-test-save-btn]');

    assert
      .dom('[data-test-error]')
      .hasText('Choose a lease to link, or pick Library only.');
    assert.notOk(
      this.calls.some((c) => c.path.startsWith('/documents/upload')),
    );
  });

  test('editing a relink sends null for the replaced link field', async function (assert) {
    this.responses.lists['/maintenance'] = [
      { id: 'wo-9', title: 'Replace pump' },
    ];
    await render(hbs`<Documents::Panel />`);
    await waitFor(row('doc-unit'));

    await click(`${row('doc-unit')} [data-test-edit-btn]`);
    await drawerSettled();
    await chooseOption('[data-test-field-related-type]', 'Work Order');
    await focus(
      '[data-test-field-related-record] [data-test-nu-dropdown-filter]',
    );
    await click(menuItem('Replace pump'));
    await click('[data-test-save-btn]');

    const patch = this.calls.find((c) => c.options.method === 'PATCH');
    assert.strictEqual(patch.path, '/documents/doc-unit');
    assert.deepEqual(JSON.parse(patch.options.body), {
      name: 'Title Deed',
      category: 'TITLE_DEED',
      accessLevel: 'TEAM',
      unitId: null,
      workOrderId: 'wo-9',
    });
    assert.deepEqual(this.toasts, [['success', 'Document updated']]);
  });

  test('editing to Library only clears the link and an untouched link is not sent', async function (assert) {
    await render(hbs`<Documents::Panel />`);
    await waitFor(row('doc-work-order'));

    await click(`${row('doc-work-order')} [data-test-edit-btn]`);
    await drawerSettled();
    await chooseOption('[data-test-field-related-type]', 'Library only');
    await click('[data-test-save-btn]');

    let patch = this.calls.find((c) => c.options.method === 'PATCH');
    assert.deepEqual(JSON.parse(patch.options.body).workOrderId, null);

    this.calls.length = 0;
    await click(`${row('doc-asset')} [data-test-edit-btn]`);
    await drawerSettled();
    await fillIn('[data-test-field-name]', 'Building NOC 2026');
    await click('[data-test-save-btn]');

    patch = this.calls.find((c) => c.options.method === 'PATCH');
    assert.deepEqual(JSON.parse(patch.options.body), {
      name: 'Building NOC 2026',
      category: 'NOC',
      accessLevel: 'TEAM',
    });
  });

  test('a preset link is read-only and is sent on upload', async function (assert) {
    this.responses.list = [];
    this.presetLink = {
      type: 'lease',
      id: 'lease-7',
      label: 'Test Tenant 2026-02-01',
    };
    this.filters = { leaseId: 'lease-7' };
    await render(
      hbs`<Documents::Panel @filters={{this.filters}} @presetLink={{this.presetLink}} />`,
    );
    await waitFor('[data-test-documents-empty]');

    await click('[data-test-documents-upload]');
    await drawerSettled();
    assert
      .dom('[data-test-related-type-readonly]')
      .hasValue('Lease')
      .hasAttribute('readonly');
    assert
      .dom('[data-test-related-record-readonly]')
      .hasValue('Test Tenant 2026-02-01')
      .hasAttribute('readonly');
    assert.dom('[data-test-field-related-type]').doesNotExist();

    const file = new File(['pdf'], 'contract.pdf', { type: 'application/pdf' });
    await triggerEvent('[data-test-file-input]', 'change', { files: [file] });
    await click('[data-test-save-btn]');

    const upload = this.calls.find((c) =>
      c.path.startsWith('/documents/upload'),
    );
    assert.strictEqual(upload.options.body.get('leaseId'), 'lease-7');
    assert.strictEqual(upload.options.body.get('name'), 'contract.pdf');
  });

  test('a non-admin is offered the Team access level only', async function (assert) {
    this.owner.lookup('service:auth').currentUser = {
      id: 'user-1',
      role: 'manager',
    };
    this.responses.list = [];
    await render(hbs`<Documents::Panel />`);
    await waitFor('[data-test-documents-empty]');

    await click('[data-test-documents-upload]');
    await drawerSettled();
    await click('[data-test-field-access] [data-test-nu-dropdown-trigger]');
    const labels = [
      ...document.querySelectorAll(
        '.nu-menu.is-open [data-test-nu-dropdown-item]',
      ),
    ].map((el) => el.textContent.trim());
    assert.deepEqual(labels, ['Share with Team']);
  });

  test('row actions follow the role: agent downloads, manager edits, admin deletes', async function (assert) {
    const auth = this.owner.lookup('service:auth');
    this.responses.list = [DOCS[0]];

    auth.currentUser = { id: 'user-1', role: 'agent' };
    await render(hbs`<Documents::Panel />`);
    await waitFor('[data-test-download-btn]');
    assert.dom('[data-test-documents-upload]').exists('an agent may upload');
    assert.dom('[data-test-edit-btn]').doesNotExist();
    assert.dom('[data-test-delete-btn]').doesNotExist();

    auth.currentUser = { id: 'user-1', role: 'manager' };
    await render(hbs`<Documents::Panel />`);
    await waitFor('[data-test-edit-btn]');
    assert.dom('[data-test-delete-btn]').doesNotExist();

    auth.currentUser = { id: 'user-1', role: 'accountant' };
    await render(hbs`<Documents::Panel />`);
    await waitFor('[data-test-download-btn]');
    assert.dom('[data-test-documents-upload]').doesNotExist();
    assert.dom('[data-test-edit-btn]').doesNotExist();
  });

  test('a controlled page is reported to the host, not changed internally', async function (assert) {
    this.responses.list = DOCS;
    this.page = 1;
    this.pages = [];
    this.onPageChange = (page) => this.pages.push(page);
    this.owner.lookup('service:auth').fetchJson = async (path) => {
      this.calls.push({ path, options: {} });
      return {
        success: true,
        data: { data: DOCS, total: 45, page: 1, limit: 20 },
      };
    };
    await render(
      hbs`<Documents::Panel @page={{this.page}} @onPageChange={{this.onPageChange}} />`,
    );
    await waitFor('[data-test-documents-pagination]');

    await click('[data-test-nu-pagination-page="2"]');
    assert.deepEqual(this.pages, [2]);
    const listCalls = this.calls.filter((c) =>
      c.path.startsWith('/documents?'),
    );
    assert.strictEqual(
      listCalls.length,
      1,
      'no fetch until the host moves the page',
    );
  });
});
