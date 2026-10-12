import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

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

function dayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    assert.dom('[data-test-lease-type]').hasText('Residential (Long-Term)');
    assert.dom('[data-test-lease-currency]').hasText('AED');
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

  test('empty optional fields show a dash', async function (assert) {
    this.lease = {
      ...LEASE,
      tenancyRegistrationRef: null,
      notes: null,
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-registration]').hasText('-');
    assert.dom('[data-test-lease-notes]').hasText('-');
  });

  test('an active lease says how it is doing and how long is left', async function (assert) {
    this.lease = {
      ...LEASE,
      startDate: dayOffset(-30),
      endDate: dayOffset(200),
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert
      .dom('[data-test-lease-next-step]')
      .hasText('Running smoothly. Nothing needs your attention.');
    assert.dom('[data-test-lease-countdown]').hasText('200 days left');
  });

  test('the last two months ask about renewal; a passed end date says so', async function (assert) {
    this.lease = {
      ...LEASE,
      startDate: dayOffset(-300),
      endDate: dayOffset(20),
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );
    assert
      .dom('[data-test-lease-next-step]')
      .hasText('Ends in 20 days. Time to talk about renewal.');

    this.set('lease', { ...LEASE, endDate: dayOffset(-3) });
    assert.dom('[data-test-lease-countdown]').hasText('Ended 3 days ago');
  });

  test('a draft shows no countdown', async function (assert) {
    this.lease = { ...LEASE, status: 'DRAFT' };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert
      .dom('[data-test-lease-next-step]')
      .hasText('This lease is a draft. Activate it once the tenant signs.');
    assert.dom('[data-test-lease-countdown]').doesNotExist();
  });

  test('it shows the term, the cheque plan and the tenant contact details', async function (assert) {
    this.lease = {
      ...LEASE,
      contact: {
        ...LEASE.contact,
        accessLevel: 'FULL',
        phone: '+15551234567',
        email: 'user@example.com',
      },
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-length]').hasText('12 months');
    assert.dom('[data-test-lease-cheques]').hasText('4');
    assert.dom('[data-test-lease-tenant-phone]').hasText('+15551234567');
    assert.dom('[data-test-lease-tenant-email]').hasText('user@example.com');
  });

  test('a limited tenant shows the masked phone and no email', async function (assert) {
    this.lease = {
      ...LEASE,
      contact: {
        id: 'contact-1',
        accessLevel: 'LIMITED',
        firstName: 'Test',
        lastInitial: 'T.',
        phoneMasked: '+1555***4567',
      },
    };
    await render(
      hbs`<Leases::Summary @lease={{this.lease}} @unit={{this.unit}} />`,
    );

    assert.dom('[data-test-lease-tenant-phone]').hasText('+1555***4567');
    assert.dom('[data-test-lease-tenant-email]').doesNotExist();
  });
});
