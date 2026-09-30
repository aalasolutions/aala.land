import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { formatDate } from 'land/helpers/format-date';

// Shape of GET /leases/:id: the lease row plus its contact relation with displayName.
const LEASE = {
  id: 'lease-1',
  unitId: 'unit-1',
  regionCode: 'dxb',
  contactId: 'contact-1',
  contact: {
    id: 'contact-1',
    firstName: 'Test',
    lastName: 'Tenant',
    displayName: 'Test Tenant',
  },
  type: 'RESIDENTIAL',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: '5000.00',
  currency: 'AED',
  securityDeposit: '10000.00',
  numberOfCheques: 4,
  tenancyRegistrationRef: 'TR-2026-001',
  notes: 'Pays by cheque',
  deletedAt: null,
};

const UNIT = { id: 'unit-1', areaId: 'area-1', label: 'Bay Tower - 101' };

function money(value) {
  return new Intl.NumberFormat(navigator.language || 'en', {
    style: 'currency',
    currency: 'AED',
  }).format(value);
}

module('Integration | Component | leases/summary', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.setupRouter();
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
    };
    this.unit = UNIT;
  });

  test('it renders every lease field', async function (assert) {
    this.lease = LEASE;
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-summary]').exists();
    assert.dom('[data-test-lease-tenant-link]').hasText('Test Tenant');
    assert
      .dom('[data-test-lease-tenant-link]')
      .hasAttribute('href', /\/contacts\/contact-1$/);
    assert.dom('[data-test-lease-unit-link]').hasText('Bay Tower - 101');
    assert
      .dom('[data-test-lease-unit-link]')
      .hasAttribute('href', /\/properties\/area-1\/unit\/unit-1$/);
    assert.dom('[data-test-lease-region]').hasText('dxb');
    assert.dom('[data-test-lease-status]').hasText('ACTIVE');
    assert.dom('[data-test-lease-archived]').doesNotExist();
    assert.dom('[data-test-lease-type]').hasText('Residential (Long-Term)');
    assert.dom('[data-test-lease-start]').hasText(formatDate('2026-01-01'));
    assert.dom('[data-test-lease-end]').hasText(formatDate('2026-12-31'));
    assert.dom('[data-test-lease-rent]').hasText(money(5000));
    assert.dom('[data-test-lease-currency]').hasText('AED');
    assert.dom('[data-test-lease-deposit]').hasText(money(10000));
    assert.dom('[data-test-lease-cheques]').hasText('4');
    assert.dom('[data-test-lease-registration]').hasText('TR-2026-001');
    assert.dom('[data-test-lease-notes]').hasText('Pays by cheque');
  });

  test('a limited contact never prints undefined', async function (assert) {
    this.lease = {
      ...LEASE,
      contact: {
        id: 'contact-1',
        accessLevel: 'LIMITED',
        firstName: 'Test',
        lastInitial: 'T.',
      },
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-tenant-link]').hasText('Test T.');
  });

  test('no tenant renders plain text without a link', async function (assert) {
    this.lease = { ...LEASE, contactId: null, contact: null };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-tenant-link]').doesNotExist();
    assert.dom('[data-test-lease-tenant]').hasText('Unknown tenant');
  });

  test('a unit without an area id is plain text; no unit is a dash', async function (assert) {
    this.lease = LEASE;
    this.unit = { id: 'unit-1', areaId: null, label: '101' };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-unit-link]').doesNotExist();
    assert.dom('[data-test-lease-unit]').hasText('101');

    this.set('unit', null);
    assert.dom('[data-test-lease-unit]').hasText('-');
  });

  test('empty optional fields show a dash and an archived lease is tagged', async function (assert) {
    this.lease = {
      ...LEASE,
      securityDeposit: null,
      tenancyRegistrationRef: null,
      notes: null,
      deletedAt: '2026-09-01T00:00:00.000Z',
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-deposit]').hasText('-');
    assert.dom('[data-test-lease-registration]').hasText('-');
    assert.dom('[data-test-lease-notes]').hasText('-');
    assert.dom('[data-test-lease-archived]').hasText('Archived');
  });
});
