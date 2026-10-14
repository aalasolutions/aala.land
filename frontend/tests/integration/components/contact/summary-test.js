import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { addCalendarDays, todayInZone } from 'land/utils/local-date';
import { formatMoney } from 'land/utils/money';
import { localeForRegion } from 'land/utils/locale';

const CONTACT = {
  id: 'c-1',
  accessLevel: 'FULL',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  phone: '+15551234567',
  isWhatsapp: true,
  email: 'user@example.com',
  nationality: 'Emirati',
  nationalId: '784-1',
  contactCompany: 'Example Holdings',
  jobTitle: 'Director',
  createdByName: 'Test User',
};

const ZONE = 'Asia/Dubai';

function dayOffset(days, zone = ZONE) {
  return addCalendarDays(todayInZone(zone), days);
}

module('Integration | Component | contact/summary', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
      timezone: ZONE,
    };
    this.contact = CONTACT;
    this.totals = {};
    this.firstOpenLead = null;
    this.firstActiveLease = null;
  });

  async function renderSummary() {
    await render(
      hbs`<Contact::Summary @contact={{this.contact}} @totals={{this.totals}} @firstOpenLead={{this.firstOpenLead}} @firstActiveLease={{this.firstActiveLease}} />`,
    );
  }

  test('it shows reach, identity and work with one-tap actions', async function (assert) {
    await renderSummary();

    assert.dom('[data-test-contact-phone]').hasText('+15551234567');
    assert.dom('[data-test-contact-email]').hasText('user@example.com');
    assert.dom('[data-test-contact-national-id]').hasText('784-1');
    assert.dom('[data-test-contact-company]').hasText('Example Holdings');
    assert.dom('[data-test-contact-added]').hasText('Added by Test User');
    assert
      .dom('[data-test-contact-call]')
      .hasAttribute('href', 'tel:+15551234567');
    assert
      .dom('[data-test-contact-mail]')
      .hasAttribute('href', 'mailto:user@example.com');
    assert.dom('[data-test-wa-link]').exists();
    assert
      .dom('[data-test-contact-relationship]')
      .hasText('No open leads, leases or properties yet.');
  });

  test('empty fields show a dash and no actions', async function (assert) {
    this.contact = { id: 'c-2', accessLevel: 'FULL', firstName: 'Test' };
    await renderSummary();

    assert.dom('[data-test-contact-email]').hasText('-');
    assert.dom('[data-test-contact-notes]').hasText('-');
    assert.dom('[data-test-contact-address]').hasText('-');
    assert.dom('[data-test-contact-added]').hasText('Added by -');
    assert.dom('[data-test-contact-call]').doesNotExist();
    assert.dom('[data-test-wa-link]').doesNotExist();
  });

  test('an open lead leads the sentence, other roles follow', async function (assert) {
    this.firstOpenLead = {
      id: 'l-1',
      status: 'NEW',
      temperature: 'HOT',
      locality: { name: 'Marina' },
      assignedAgentName: 'Test Agent',
    };
    this.totals = { leads: 1, openLeads: 1, units: 1, availableUnits: 1 };
    await renderSummary();

    assert
      .dom('[data-test-contact-relationship]')
      .hasText('Looking for a property in Marina. Hot lead, with Test Agent.');
    assert.dom('[data-test-contact-also]').hasText('Also owns 1 property.');
  });

  test("a lead's budget is priced in the lead's own region currency", async function (assert) {
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'dxb', currency: 'AED' },
      { code: 'pk-pb', currency: 'PKR' },
    ];
    this.firstOpenLead = {
      id: 'l-1',
      status: 'NEW',
      regionCode: 'pk-pb',
      budgetMin: '1200',
      budgetMax: '5000',
    };
    this.totals = { leads: 1, openLeads: 1 };
    await renderSummary();

    const locale = localeForRegion(region.activeRegion);
    const price = (v, currency) =>
      formatMoney(v, locale, { currency, compact: true });
    assert
      .dom('[data-test-contact-relationship]')
      .includesText(
        `budget ${price('1200', 'PKR')} to ${price('5000', 'PKR')}`,
      );
    assert
      .dom('[data-test-contact-relationship]')
      .doesNotIncludeText(price('1200', 'AED'));
  });

  test('a closed lead does not lead; an active lease does', async function (assert) {
    this.totals = { leads: 1, openLeads: 0, leases: 1, activeLeases: 1 };
    this.firstActiveLease = {
      id: 'le-1',
      status: 'ACTIVE',
      unit: { unitNumber: '302' },
      endDate: dayOffset(30),
    };
    await renderSummary();

    assert.dom('[data-test-contact-relationship]').includesText('Rents 302');
    assert.dom('[data-test-contact-also]').doesNotExist();
  });

  test('extra open leads are counted in the also line', async function (assert) {
    this.totals = { leads: 3, openLeads: 3 };
    this.firstOpenLead = { id: 'l-1', status: 'NEW' };
    await renderSummary();

    assert.dom('[data-test-contact-also]').hasText('Also 2 more open leads.');
  });

  test('a tenant line names the unit, rent and days left', async function (assert) {
    this.totals = { leases: 1, activeLeases: 1 };
    this.firstActiveLease = {
      id: 'le-1',
      status: 'ACTIVE',
      unit: { unitNumber: '101' },
      monthlyRent: '5000.00',
      currency: 'AED',
      endDate: dayOffset(30),
    };
    await renderSummary();

    assert.dom('[data-test-contact-relationship]').includesText('Rents 101,');
    assert
      .dom('[data-test-contact-relationship]')
      .includesText('ends in 30 days.');
  });

  test('an owner line counts properties and those available', async function (assert) {
    this.totals = { units: 2, availableUnits: 1 };
    await renderSummary();

    assert
      .dom('[data-test-contact-relationship]')
      .hasText('Owns 2 properties, 1 marked available.');
  });

  test('the sentence uses totals, not the rows on the first page', async function (assert) {
    this.totals = {
      units: 150,
      availableUnits: 40,
      leases: 9,
      activeLeases: 3,
      leads: 2,
      openLeads: 0,
    };
    this.firstActiveLease = {
      id: 'le-1',
      status: 'ACTIVE',
      unit: { unitNumber: '302' },
    };
    await renderSummary();

    assert.dom('[data-test-contact-relationship]').hasText('Rents 302.');
    assert.dom('[data-test-contact-also]').hasText('Also owns 150 properties.');
  });

  test('an owner line counts every owned and available unit', async function (assert) {
    this.totals = { units: 150, availableUnits: 40 };
    await renderSummary();

    assert
      .dom('[data-test-contact-relationship]')
      .hasText('Owns 150 properties, 40 marked available.');
  });
});
