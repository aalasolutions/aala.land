import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn } from '@ember/test-helpers';
import template from 'land/templates/contacts/detail';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';
import { formatMoney } from 'land/utils/money';
import { localeForRegion } from 'land/utils/locale';

const LIMITED = {
  id: 'c-9',
  accessLevel: 'LIMITED',
  firstName: 'Omar',
  lastInitial: 'H.',
  phoneMasked: '+971 50 *** **67',
  regionCode: 'SHJ',
  createdBy: 'user-2',
  createdByName: 'Other Agent',
  createdAt: '2026-09-01T10:00:00.000Z',
  accessPending: false,
};

const FULL = {
  id: 'c-1',
  accessLevel: 'FULL',
  displayName: 'Sara Khan',
  firstName: 'Sara',
  lastName: 'Khan',
  email: 'sara@example.com',
  phone: '+971501112233',
  isWhatsapp: true,
  nationality: 'Emirati',
  nationalId: '784-0000-0000000-0',
  contactCompany: 'Example Holdings',
  jobTitle: 'Director',
  address: 'Example Street',
  notes: 'Prefers mornings',
  tags: ['owner', 'tenant', 'lead'],
  regionCode: 'DXB',
  createdBy: 'user-2',
  createdByName: 'Test User',
};

module('Integration | Template | contacts/detail', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.toasts = stubNotifications(this.owner);
  });

  async function renderDetail(
    ctx,
    contact,
    { role = 'manager', respond, records = {} } = {},
  ) {
    ctx.calls = stubAuth(ctx.owner, {
      role,
      respond: respond ?? (() => ({ data: { data: [], total: 0 } })),
    });
    const controller = ctx.owner.lookup('controller:contacts/detail');
    ctx.refreshed = [];
    controller.router = {
      refresh: (name) => ctx.refreshed.push(name),
      transitionTo() {},
    };
    await renderRouteTemplate(ctx, template, {
      name: 'contacts.detail',
      controller,
      model: {
        contact,
        units: [],
        leases: [],
        leads: [],
        totals: {},
        firstOpenLead: null,
        firstActiveLease: null,
        ...records,
      },
    });
    return controller;
  }

  test('a limited contact shows only the masked name, phone, region, added by and date', async function (assert) {
    await renderDetail(this, LIMITED);

    const detail = '[data-test-contact-detail]';
    assert.dom(detail).containsText('Omar H.');
    assert.dom('[data-test-limited-badge]').hasText('Limited');
    assert.dom('[data-test-limited-phone]').hasText('+971 50 *** **67');
    assert.dom('[data-test-limited-region]').hasText('SHJ');
    assert.dom('[data-test-contact-added-by]').hasText('Other Agent');
    for (const label of [
      'Email',
      'Nationality',
      'National ID',
      'Company',
      'Job Title',
      'Address',
    ]) {
      assert.dom(detail).doesNotContainText(label, `${label} is hidden`);
    }
    assert.dom(detail).doesNotContainText('undefined');
    assert.dom('[data-test-edit-contact]').doesNotExist();
    assert.dom('[data-test-wa-link]').doesNotExist();
  });

  test('a limited contact hides every related card, history included', async function (assert) {
    await renderDetail(this, LIMITED, { role: 'manager' });

    const detail = '[data-test-contact-detail]';
    assert.dom(detail).doesNotContainText('Properties Owned');
    assert.dom(detail).doesNotContainText('Leases');
    assert.dom(detail).doesNotContainText('Lead Requirements');
    assert.dom('[data-test-contact-history]').doesNotExist();
    assert.strictEqual(this.calls.length, 0, 'no history is fetched either');
  });

  test('a limited contact offers Request access and the number unlock form', async function (assert) {
    await renderDetail(this, LIMITED);

    assert.dom('[data-test-request-access]').exists();
    assert
      .dom('[data-test-verify-phone-form]')
      .containsText('Know this contact? Enter their number to unlock details');
  });

  test('a limited contact already requested shows Access pending', async function (assert) {
    await renderDetail(this, { ...LIMITED, accessPending: true });

    assert.dom('[data-test-access-pending]').hasText('Access pending');
    assert.dom('[data-test-request-access]').doesNotExist();
  });

  test('a matching number reloads the route', async function (assert) {
    await renderDetail(this, LIMITED, {
      respond: () => ({
        data: { verified: true, contact: { id: 'c-9', accessLevel: 'FULL' } },
      }),
    });

    await fillIn('[data-test-verify-phone-input]', '0501234567');
    await click('[data-test-verify-phone-submit]');

    assert.deepEqual(this.refreshed, ['contacts.detail']);
    assert.strictEqual(this.toasts[0].type, 'success');
  });

  test('a wrong number stays on the limited view with the fixed message', async function (assert) {
    await renderDetail(this, LIMITED, {
      respond: () => ({ data: { verified: false, contact: LIMITED } }),
    });

    await fillIn('[data-test-verify-phone-input]', '0509999999');
    await click('[data-test-verify-phone-submit]');

    assert.deepEqual(this.refreshed, []);
    assert
      .dom('[data-test-wu-field-error]')
      .hasText('The number does not match');
  });

  test('a full contact shows its details, Added by and Edit, and no unlock form', async function (assert) {
    this.owner.lookup('service:region').regions = [
      { code: 'DXB', name: 'Dubai' },
    ];
    await renderDetail(this, FULL);

    const detail = '[data-test-contact-detail]';
    assert.dom(detail).containsText('sara@example.com');
    assert.dom(detail).containsText('784-0000-0000000-0');
    assert.dom('[data-test-contact-added-by]').hasText('Test User');
    assert.dom('[data-test-edit-contact]').exists();
    assert.dom('[data-test-verify-phone-form]').doesNotExist();
    assert.dom('[data-test-request-access]').doesNotExist();
    assert.dom('[data-test-limited-badge]').doesNotExist();
    assert.dom('[data-test-wu-tabs-trigger="documents"]').exists();
    assert
      .dom('[data-test-contact-documents]')
      .exists('no records: Documents is open');

    await click('[data-test-wu-tabs-trigger="history"]');
    assert.dom('[data-test-contact-history]').exists();
  });

  test('the related tabs open on the lead, then the lease, and leases link to their page', async function (assert) {
    const lease = {
      id: 'lease-1',
      status: 'ACTIVE',
      unit: { unitNumber: '101' },
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: '5000.00',
      currency: 'AED',
    };
    const lead = { id: 'lead-1', status: 'NEW', temperature: 'HOT' };
    this.owner.setupRouter();
    await renderDetail(this, FULL, {
      records: {
        leads: [lead],
        leases: [lease],
        totals: { leads: 1, openLeads: 1, leases: 1, activeLeases: 1 },
        firstOpenLead: lead,
        firstActiveLease: lease,
      },
    });

    assert
      .dom('[data-test-wu-tabs-trigger="leads"]')
      .hasAttribute('aria-selected', 'true');
    assert.dom('[data-test-contact-leads] [data-test-lead-card]').exists();

    await click('[data-test-wu-tabs-trigger="leases"]');
    assert
      .dom('[data-test-lease-row]')
      .hasAttribute('href', /\/leases\/lease-1$/);
    assert.dom('[data-test-wu-tabs-trigger="properties"]').doesNotExist();
  });

  test("a lead in another region prices its budget in that region's currency", async function (assert) {
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'DXB', name: 'Dubai', currency: 'AED' },
      { code: 'PB', name: 'Punjab', currency: 'PKR' },
    ];
    region.activeRegion = region.regions[0];
    const lead = {
      id: 'lead-1',
      status: 'NEW',
      temperature: 'HOT',
      regionCode: 'PB',
      budgetMin: '1200',
      budgetMax: '5000',
    };
    await renderDetail(this, FULL, {
      records: {
        leads: [lead],
        totals: { leads: 1, openLeads: 1 },
        firstOpenLead: lead,
      },
    });

    const locale = localeForRegion(region.activeRegion);
    const price = (v, currency) =>
      formatMoney(v, locale, { currency, compact: true });
    const card = '[data-test-contact-leads] [data-test-lead-card]';
    assert.dom(card).includesText(price('1200', 'PKR'));
    assert.dom(card).includesText(price('5000', 'PKR'));
    assert.dom(card).doesNotIncludeText(price('1200', 'AED'));
  });

  test('a won lead with an active lease opens on Leases, like the sentence', async function (assert) {
    const lease = {
      id: 'lease-1',
      status: 'ACTIVE',
      unit: { unitNumber: '302' },
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      monthlyRent: '5000.00',
      currency: 'AED',
    };
    const lead = { id: 'lead-1', status: 'WON', temperature: 'HOT' };
    this.owner.setupRouter();
    await renderDetail(this, FULL, {
      records: {
        leads: [lead],
        leases: [lease],
        totals: { leads: 1, openLeads: 0, leases: 1, activeLeases: 1 },
        firstActiveLease: lease,
      },
    });

    assert
      .dom('[data-test-wu-tabs-trigger="leases"]')
      .hasAttribute('aria-selected', 'true');
    assert
      .dom('[data-test-wu-tabs-trigger="leads"]')
      .hasAttribute('aria-selected', 'false');
    assert.dom('[data-test-contact-relationship]').includesText('Rents 302');
  });
  test('a tab counts the list total, not the rows loaded', async function (assert) {
    const units = Array.from({ length: 50 }, (_, i) => ({
      id: `u-${i}`,
      unitNumber: `U${i}`,
      areaId: 'a-1',
      status: 'rented',
    }));
    this.owner.setupRouter();
    await renderDetail(this, FULL, {
      records: { units, totals: { units: 150, availableUnits: 0 } },
    });

    assert
      .dom('[data-test-wu-tabs-trigger="properties"]')
      .hasAttribute('aria-selected', 'true');
    assert.dom('[data-test-wu-tabs-trigger="properties"]').includesText('150');
    assert
      .dom('[data-test-contact-relationship]')
      .hasText('Owns 150 properties.');
    assert.dom('[data-test-contact-properties-pager]').exists();
  });

  test('the pager fetches the next page for that tab only', async function (assert) {
    const units = Array.from({ length: 50 }, (_, i) => ({
      id: `u-${i}`,
      unitNumber: `U${i}`,
      areaId: 'a-1',
      status: 'rented',
    }));
    const lease = {
      id: 'lease-1',
      status: 'EXPIRED',
      unit: { unitNumber: 'L1' },
    };
    this.owner.setupRouter();
    const controller = await renderDetail(this, FULL, {
      respond: (path) =>
        path.startsWith('/properties/units')
          ? {
              data: {
                data: [{ id: 'u-99', unitNumber: 'P2-UNIT', areaId: 'a-1' }],
                total: 120,
              },
            }
          : { data: { data: [], total: 0 } },
      records: {
        units,
        leases: [lease],
        totals: { units: 120, leases: 1 },
      },
    });

    await click(
      '[data-test-contact-properties-pager] [data-test-wu-pagination-page="2"]',
    );

    const paths = this.calls.map((c) => c.path);
    assert.deepEqual(paths, ['/properties/units?ownerId=c-1&page=2&limit=50']);
    assert.dom('[data-test-owned-unit-row]').exists({ count: 1 });
    assert.dom('[data-test-owned-unit-row]').hasText('P2-UNIT');
    assert.strictEqual(controller.pages.properties, 2);
    assert.strictEqual(controller.pages.leases, 1);

    await click('[data-test-wu-tabs-trigger="leases"]');
    assert.dom('[data-test-lease-row]').hasText('L1');
    assert.dom('[data-test-contact-leases-pager]').doesNotExist();
  });

  test('a late page answer is dropped once a newer page was asked for', async function (assert) {
    const resolvers = [];
    this.owner.setupRouter();
    const controller = await renderDetail(this, FULL, {
      respond: (path) =>
        new Promise((resolve) => resolvers.push({ path, resolve })),
      records: { totals: { leads: 200, openLeads: 0 } },
    });

    const first = controller.goToRelatedPage('leads', 2);
    const second = controller.goToRelatedPage('leads', 3);
    resolvers[1].resolve({ data: { data: [{ id: 'page-3' }], total: 200 } });
    await second;
    resolvers[0].resolve({ data: { data: [{ id: 'page-2' }], total: 200 } });
    await first;

    assert.deepEqual(
      controller.leadRows.map((l) => l.id),
      ['page-3'],
    );
    assert.strictEqual(controller.pages.leads, 3);
  });

  test('an agent with a grant sees full details but no Edit', async function (assert) {
    await renderDetail(this, FULL, { role: 'agent' });

    assert.dom('[data-test-contact-detail]').containsText('sara@example.com');
    assert.dom('[data-test-edit-contact]').doesNotExist();
    assert.dom('[data-test-request-access]').doesNotExist();
  });
});
