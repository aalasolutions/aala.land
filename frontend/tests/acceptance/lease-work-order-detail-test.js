import { module, test } from 'qunit';
import { setupApplicationTest } from 'land/tests/helpers';
import { click, currentURL, visit, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Controller from '@ember/controller';
import Route from '@ember/routing/route';
import Service from '@ember/service';

const LEASE = {
  id: 'lease-1',
  unitId: 'unit-1',
  regionCode: 'dxb',
  contactId: 'contact-1',
  contact: { id: 'contact-1', displayName: 'Test Tenant' },
  type: 'RESIDENTIAL',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: '5000.00',
  currency: 'AED',
  numberOfCheques: 4,
  deletedAt: null,
};

const WORK_ORDER = {
  id: 'wo-1',
  unitId: 'unit-1',
  regionCode: 'dxb',
  title: 'Fix AC',
  description: 'Unit is too warm',
  status: 'OPEN',
  priority: 'HIGH',
  category: 'HVAC',
  vendorId: null,
  assignedTo: null,
  currency: 'AED',
};

const UNIT = {
  id: 'unit-1',
  unitNumber: '101',
  asset: { name: 'Bay Tower', localityId: 'area-1' },
};

function doc(id, link) {
  return {
    id,
    name: `Document ${id}`,
    category: 'OTHER',
    accessLevel: 'TEAM',
    fileSize: 1024,
    createdAt: '2026-09-01T10:00:00.000Z',
    uploadedBy: 'user-2',
    uploadedByName: 'Test User',
    unit: null,
    link,
  };
}

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

module('Acceptance | leases/detail', function (hooks) {
  setupApplicationTest(hooks);
  setupPageStubs(hooks);

  hooks.beforeEach(function () {
    this.responses['/leases/lease-1'] = { success: true, data: LEASE };
    this.responses['/properties/units/unit-1'] = { success: true, data: UNIT };
    this.responses['/documents'] = listResponse([
      doc('doc-1', { type: 'lease', id: 'lease-1', label: 'Test Tenant' }),
    ]);
  });

  test('the list row opens the detail page', async function (assert) {
    this.responses['/leases'] = listResponse([
      { ...LEASE, unit: { id: 'unit-1', unitNumber: '101', areaId: 'area-1' } },
    ]);
    await visit('/leases');
    await click('[data-test-lease-detail-link]');

    assert.strictEqual(currentURL(), '/leases/lease-1');
    assert.dom('[data-test-lease-summary]').exists();
  });

  test('it shows the summary and the lease documents with a fixed lease link', async function (assert) {
    await visit('/leases/lease-1');
    await waitFor('[data-test-lease-documents] [data-test-data-table-row]');

    assert.dom('[data-test-nu-page-header-title]').hasText('Test Tenant');
    assert.dom('[data-test-breadcrumb-leases]').hasAttribute('href', '/leases');
    assert.dom('[data-test-lease-unit-link]').hasText('Bay Tower - 101');
    assert.deepEqual(documentListCalls(this.calls), [
      '/documents?page=1&limit=20&leaseId=lease-1',
    ]);
    assert
      .dom('[data-test-lease-documents] [data-test-document-related]')
      .doesNotExist('the Related column is hidden');

    await click('[data-test-lease-documents-upload]');
    await waitFor('[data-test-related-record-readonly]');
    assert.dom('[data-test-related-type-readonly]').hasValue('Lease');
    assert
      .dom('[data-test-related-record-readonly]')
      .hasValue('Test Tenant 2026-01-01');
  });

  test('an archived lease offers no upload', async function (assert) {
    this.responses['/leases/lease-1'] = {
      success: true,
      data: { ...LEASE, deletedAt: '2026-09-10T10:00:00.000Z' },
    };
    await visit('/leases/lease-1');
    await waitFor('[data-test-lease-documents] [data-test-data-table-row]');

    assert.dom('[data-test-lease-archived]').exists();
    assert.dom('[data-test-lease-documents-upload]').doesNotExist();
  });

  test('a lease that fails to load shows not found and no panel', async function (assert) {
    this.responses['/leases/lease-1'] = { success: true, data: null };
    await visit('/leases/lease-1');

    assert.dom('[data-test-lease-not-found]').exists();
    assert.dom('[data-test-lease-documents]').doesNotExist();
    assert.deepEqual(documentListCalls(this.calls), []);
  });

  test('a company admin sees the lease history', async function (assert) {
    await visit('/leases/lease-1');

    assert.dom('[data-test-lease-history-card]').exists();
    assert.ok(
      this.calls.some(
        (c) =>
          c.path.startsWith('/record-history?') &&
          c.path.includes('entityType=Lease') &&
          c.path.includes('entityId=lease-1'),
      ),
      'loads the lease history',
    );
  });

  test('an accountant sees no lease history', async function (assert) {
    this.currentUser = { id: 'user-1', role: 'accountant' };
    await visit('/leases/lease-1');

    assert.dom('[data-test-lease-summary]').exists();
    assert.dom('[data-test-lease-history-card]').doesNotExist();
  });
});

module('Acceptance | maintenance/detail', function (hooks) {
  setupApplicationTest(hooks);
  setupPageStubs(hooks);

  hooks.beforeEach(function () {
    this.responses['/maintenance/wo-1'] = { success: true, data: WORK_ORDER };
    this.responses['/properties/units/unit-1'] = { success: true, data: UNIT };
    this.responses['/documents'] = listResponse([
      doc('doc-1', { type: 'work_order', id: 'wo-1', label: 'Fix AC' }),
    ]);
  });

  test('the list row opens the detail page', async function (assert) {
    this.responses['/maintenance'] = listResponse([WORK_ORDER]);
    await visit('/maintenance');
    await click('[data-test-work-order-detail-link]');

    assert.strictEqual(currentURL(), '/maintenance/wo-1');
    assert.dom('[data-test-work-order-summary]').exists();
  });

  test('it shows the summary and the work-order documents with a fixed link', async function (assert) {
    await visit('/maintenance/wo-1');
    await waitFor(
      '[data-test-work-order-documents] [data-test-data-table-row]',
    );

    assert.dom('[data-test-nu-page-header-title]').hasText('Fix AC');
    assert
      .dom('[data-test-breadcrumb-maintenance]')
      .hasAttribute('href', '/maintenance');
    assert.deepEqual(documentListCalls(this.calls), [
      '/documents?page=1&limit=20&workOrderId=wo-1',
    ]);
    assert
      .dom('[data-test-work-order-documents] [data-test-document-related]')
      .doesNotExist('the Related column is hidden');

    await click('[data-test-work-order-documents-upload]');
    await waitFor('[data-test-related-record-readonly]');
    assert.dom('[data-test-related-type-readonly]').hasValue('Work Order');
    assert.dom('[data-test-related-record-readonly]').hasValue('Fix AC');
  });

  test('an accountant is offered no upload', async function (assert) {
    this.currentUser = { id: 'user-1', role: 'accountant' };
    await visit('/maintenance/wo-1');
    await waitFor(
      '[data-test-work-order-documents] [data-test-data-table-row]',
    );

    assert.dom('[data-test-work-order-documents-upload]').doesNotExist();
  });
});
