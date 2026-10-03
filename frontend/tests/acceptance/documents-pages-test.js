import { module, test } from 'qunit';
import { setupApplicationTest } from 'land/tests/helpers';
import { click, visit, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Controller from '@ember/controller';
import Route from '@ember/routing/route';
import Service from '@ember/service';

const UNIT = {
  id: 'unit-1',
  unitNumber: '101',
  status: 'available',
  asset: { name: 'Bay Tower', locality: { name: 'Marina' } },
  amenities: [],
  deletedAt: null,
};

const CONTACT = {
  id: 'contact-1',
  firstName: 'Test',
  lastName: 'Contact',
  displayName: 'Test Contact',
  tags: [],
};

const UNIT_DOCS = [
  {
    id: 'doc-own',
    name: 'Title Deed',
    category: 'TITLE_DEED',
    accessLevel: 'TEAM',
    fileSize: 1024,
    createdAt: '2026-09-01T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: { id: 'unit-1', unitNumber: '101', areaId: 'area-1' },
    link: { type: 'unit', id: 'unit-1', label: 'Bay Tower 101' },
  },
  {
    id: 'doc-lease',
    name: 'Tenancy Contract',
    category: 'LEASE',
    accessLevel: 'TEAM',
    fileSize: 2048,
    createdAt: '2026-09-02T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link: { type: 'lease', id: 'lease-1', label: 'Test Tenant 2026-01-01' },
    derivedFrom: 'lease',
  },
];

const CONTACT_DOCS = [
  {
    id: 'doc-passport',
    name: 'Passport Copy',
    category: 'ID_COPY',
    accessLevel: 'TEAM',
    fileSize: 512,
    createdAt: '2026-09-03T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link: { type: 'contact', id: 'contact-1', label: 'Test Contact' },
  },
];

function listResponse(rows) {
  return {
    success: true,
    data: { data: rows, total: rows.length, page: 1, limit: 20 },
  };
}

// Swaps the app shell and the backend for stubs so only the page under test renders.
function setupPageStubs(hooks) {
  hooks.beforeEach(function () {
    const calls = [];
    this.calls = calls;
    this.responses = {};
    this.currentUser = { id: 'user-1', role: 'company_admin' };
    const context = this;

    this.owner.register('template:application', hbs`{{outlet}}`);
    this.owner.register('route:application', class extends Route {});
    this.owner.register('controller:application', class extends Controller {});
    this.owner.register(
      'service:session',
      class extends Service {
        isAuthenticated = true;
      },
    );
    this.owner.register(
      'service:auth',
      class extends Service {
        apiBase = '/api';
        get currentUser() {
          return context.currentUser;
        }
        async fetchJson(path, options = {}) {
          calls.push({ path, options });
          const [base] = path.split('?');
          return (
            context.responses[base] ?? {
              success: true,
              data: { data: [], total: 0 },
            }
          );
        }
      },
    );
    this.owner.register(
      'service:notifications',
      class extends Service {
        success() {}
        error() {}
      },
    );
  });
}

function documentListCalls(calls) {
  return calls
    .map((call) => call.path)
    .filter((path) => path.startsWith('/documents'));
}

module('Acceptance | properties/unit documents panel', function (hooks) {
  setupApplicationTest(hooks);
  setupPageStubs(hooks);

  hooks.beforeEach(function () {
    this.responses['/properties/units/unit-1'] = { success: true, data: UNIT };
    this.responses['/leases/unit/unit-1'] = { success: true, data: [] };
    this.responses['/properties/units/unit-1/media'] = {
      success: true,
      data: [],
    };
    this.responses['/documents'] = listResponse(UNIT_DOCS);
  });

  test('it lists the unit documents with derived rows and a fixed unit link', async function (assert) {
    await visit('/properties/area-1/unit/unit-1');
    await waitFor('[data-test-unit-documents] [data-test-data-table-row]');

    assert.deepEqual(
      documentListCalls(this.calls),
      ['/documents?page=1&limit=20&unitId=unit-1&includeDerived=true'],
      'the panel is the only documents request',
    );
    assert
      .dom('[data-test-unit-documents] [data-test-data-table-row]')
      .exists({ count: 2 });
    assert
      .dom('[data-test-unit-documents] [data-test-document-related]')
      .exists('the Related column is shown');
    assert
      .dom(
        '[data-test-data-table-row="doc-lease"] [data-test-document-derived]',
      )
      .hasText('via lease');

    await click('[data-test-upload-document-btn]');
    await waitFor('[data-test-related-record-readonly]');
    assert.dom('[data-test-related-type-readonly]').hasValue('Unit');
    assert.dom('[data-test-related-record-readonly]').hasValue('Bay Tower 101');
  });

  test('an archived unit offers no upload', async function (assert) {
    this.responses['/properties/units/unit-1'] = {
      success: true,
      data: { ...UNIT, deletedAt: '2026-09-10T10:00:00.000Z' },
    };
    await visit('/properties/area-1/unit/unit-1');
    await waitFor('[data-test-unit-documents] [data-test-data-table-row]');

    assert.dom('[data-test-archived-banner]').exists();
    assert.dom('[data-test-upload-document-btn]').doesNotExist();
  });
});

module('Acceptance | contacts/detail documents panel', function (hooks) {
  setupApplicationTest(hooks);
  setupPageStubs(hooks);

  hooks.beforeEach(function () {
    this.responses['/contacts/contact-1'] = { success: true, data: CONTACT };
    this.responses['/documents'] = listResponse(CONTACT_DOCS);
  });

  test('it lists the contact documents in compact form with a fixed contact link', async function (assert) {
    await visit('/contacts/contact-1');
    await waitFor('[data-test-contact-documents] [data-test-data-table-row]');

    assert.deepEqual(documentListCalls(this.calls), [
      '/documents?page=1&limit=20&contactId=contact-1',
    ]);
    assert
      .dom('[data-test-contact-documents] [data-test-data-table-row]')
      .exists({ count: 1 });
    assert
      .dom('[data-test-contact-documents] [data-test-document-related]')
      .doesNotExist('the Related column is hidden');

    await click('[data-test-contact-documents-upload]');
    await waitFor('[data-test-related-record-readonly]');
    assert.dom('[data-test-related-type-readonly]').hasValue('Contact');
    assert.dom('[data-test-related-record-readonly]').hasValue('Test Contact');
  });

  test('a contact with limited access shows no documents panel', async function (assert) {
    this.responses['/contacts/contact-1'] = {
      success: true,
      data: { ...CONTACT, accessLevel: 'LIMITED' },
    };
    await visit('/contacts/contact-1');
    await waitFor('[data-test-limited-details]');

    assert.dom('[data-test-contact-documents]').doesNotExist();
    assert.dom('[data-test-contact-documents-upload]').doesNotExist();
  });

  test('an accountant is offered no upload', async function (assert) {
    this.currentUser = { id: 'user-1', role: 'accountant' };
    await visit('/contacts/contact-1');
    await waitFor('[data-test-contact-documents] [data-test-data-table-row]');

    assert.dom('[data-test-contact-documents-upload]').doesNotExist();
  });
});
