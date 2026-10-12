import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { formatDate } from 'land/helpers/format-date';

// Shape of GET /maintenance/:id: the bare work-order row, ids only for unit, vendor and assignee.
const ORDER = {
  id: 'wo-1',
  unitId: 'unit-1',
  regionCode: 'dxb',
  title: 'Fix AC',
  description: 'Unit is too warm',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  category: 'HVAC',
  assignedTo: 'user-9',
  vendorId: 'vendor-1',
  estimatedCost: '500.00',
  actualCost: '450.00',
  currency: 'AED',
  scheduledDate: '2026-09-10',
  completedAt: '2026-09-12T10:00:00.000Z',
  costNotes: 'Parts included',
  notes: 'Call before visiting',
};

function money(value) {
  return new Intl.NumberFormat(navigator.language || 'en', {
    style: 'currency',
    currency: 'AED',
  }).format(value);
}

module('Integration | Component | maintenance/summary', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.setupRouter();
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
    };
    this.unit = { id: 'unit-1', areaId: 'area-1', label: 'Bay Tower - 101' };
    this.vendor = { id: 'vendor-1', name: 'Cool Air' };
    this.assignee = { id: 'user-9', name: 'Test User' };
  });

  test('it renders the description, assignment, schedule and cost', async function (assert) {
    this.workOrder = ORDER;
    await render(
      hbs`<Maintenance::Summary @workOrder={{this.workOrder}} @unit={{this.unit}} @vendor={{this.vendor}} @assignee={{this.assignee}} />`,
    );

    assert.dom('[data-test-work-order-summary]').exists();
    assert
      .dom('[data-test-work-order-description]')
      .hasText('Unit is too warm');
    assert.dom('[data-test-work-order-unit-link]').hasText('Bay Tower - 101');
    assert
      .dom('[data-test-work-order-unit-link]')
      .hasAttribute('href', /\/properties\/area-1\/unit\/unit-1$/);
    assert.dom('[data-test-work-order-vendor]').hasText('Cool Air');
    assert.dom('[data-test-work-order-assignee]').hasText('Test User');
    assert
      .dom('[data-test-work-order-scheduled]')
      .hasText(formatDate('2026-09-10'));
    assert
      .dom('[data-test-work-order-completed]')
      .hasText(formatDate('2026-09-12T10:00:00.000Z'));
    assert.dom('[data-test-work-order-estimated]').hasText(money(500));
    assert.dom('[data-test-work-order-actual]').hasText(money(450));
    assert.dom('[data-test-work-order-cost-notes]').hasText('Parts included');
    assert.dom('[data-test-work-order-notes]').hasText('Call before visiting');
    assert
      .dom('[data-test-work-order-status]')
      .doesNotExist('status, priority and category live in the page header');
  });

  test('ids without a resolved name still read as assigned', async function (assert) {
    this.workOrder = ORDER;
    await render(
      hbs`<Maintenance::Summary @workOrder={{this.workOrder}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-work-order-vendor]').hasText('Vendor assigned');
    assert.dom('[data-test-work-order-assignee]').hasText('Assigned');
  });

  test('empty optional fields show a dash', async function (assert) {
    this.workOrder = {
      ...ORDER,
      unitId: null,
      vendorId: null,
      assignedTo: null,
      estimatedCost: null,
      actualCost: null,
      scheduledDate: null,
      completedAt: null,
      costNotes: null,
      description: null,
      notes: null,
    };
    await render(hbs`<Maintenance::Summary @workOrder={{this.workOrder}} />`);

    assert.dom('[data-test-work-order-unit-link]').doesNotExist();
    assert.dom('[data-test-work-order-unit]').hasText('-');
    assert.dom('[data-test-work-order-vendor]').hasText('-');
    assert.dom('[data-test-work-order-assignee]').hasText('-');
    assert.dom('[data-test-work-order-estimated]').hasText('-');
    assert.dom('[data-test-work-order-actual]').hasText('-');
    assert.dom('[data-test-work-order-scheduled]').hasText('-');
    assert.dom('[data-test-work-order-completed]').hasText('-');
    assert.dom('[data-test-work-order-cost-notes]').hasText('-');
    assert.dom('[data-test-work-order-notes]').hasText('-');
    assert.dom('[data-test-work-order-description]').hasText('-');
  });

  test('the statement and steps say where the job stands', async function (assert) {
    this.workOrder = {
      ...ORDER,
      status: 'OPEN',
      vendorId: null,
      assignedTo: null,
      reportedBy: 'Test User',
      createdAt: '2026-09-01T09:00:00.000Z',
      completedAt: null,
    };
    await render(hbs`<Maintenance::Summary @workOrder={{this.workOrder}} />`);

    assert
      .dom('[data-test-work-order-next-step]')
      .hasText('Nobody is on this yet. Assign a vendor or a team member.');
    assert.dom('[data-test-work-order-stage="current"]').hasText('Reported');
    assert.dom('[data-test-work-order-stage="todo"]').exists({ count: 3 });
    assert
      .dom('[data-test-work-order-reported]')
      .includesText('Reported by Test User');
  });

  test('a completed order shows every step done', async function (assert) {
    this.workOrder = { ...ORDER, status: 'COMPLETED' };
    await render(hbs`<Maintenance::Summary @workOrder={{this.workOrder}} />`);

    assert
      .dom('[data-test-work-order-next-step]')
      .hasText('The work is done and closed.');
    assert.dom('[data-test-work-order-stage="done"]').exists({ count: 3 });
    assert.dom('[data-test-work-order-stage="current"]').hasText('Done');
  });

  test('a cancelled order hides the steps', async function (assert) {
    this.workOrder = { ...ORDER, status: 'CANCELLED' };
    await render(hbs`<Maintenance::Summary @workOrder={{this.workOrder}} />`);

    assert
      .dom('[data-test-work-order-next-step]')
      .hasText('This work order was cancelled.');
    assert.dom('[data-test-work-order-stage]').doesNotExist();
  });
});
