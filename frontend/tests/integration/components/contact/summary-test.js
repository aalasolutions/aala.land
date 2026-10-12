import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

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

function dayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module('Integration | Component | contact/summary', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.lookup('service:region').activeRegion = {
      code: 'dxb',
      currency: 'AED',
    };
    this.contact = CONTACT;
    this.units = [];
    this.leases = [];
    this.leads = [];
  });

  async function renderSummary() {
    await render(
      hbs`<Contact::Summary @contact={{this.contact}} @units={{this.units}} @leases={{this.leases}} @leads={{this.leads}} />`,
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
    this.leads = [
      {
        id: 'l-1',
        status: 'NEW',
        temperature: 'HOT',
        locality: { name: 'Marina' },
        assignedAgentName: 'Test Agent',
      },
    ];
    this.units = [{ id: 'u-1', status: 'available' }];
    await renderSummary();

    assert
      .dom('[data-test-contact-relationship]')
      .hasText('Looking for a property in Marina. Hot lead, with Test Agent.');
    assert.dom('[data-test-contact-also]').hasText('Also owns 1 property.');
  });

  test('a tenant line names the unit, rent and days left', async function (assert) {
    this.leases = [
      {
        id: 'le-1',
        status: 'ACTIVE',
        unit: { unitNumber: '101' },
        monthlyRent: '5000.00',
        currency: 'AED',
        endDate: dayOffset(30),
      },
    ];
    await renderSummary();

    assert.dom('[data-test-contact-relationship]').includesText('Rents 101,');
    assert
      .dom('[data-test-contact-relationship]')
      .includesText('ends in 30 days.');
  });

  test('an owner line counts properties and those available', async function (assert) {
    this.units = [
      { id: 'u-1', status: 'available' },
      { id: 'u-2', status: 'rented' },
    ];
    await renderSummary();

    assert
      .dom('[data-test-contact-relationship]')
      .hasText('Owns 2 properties, 1 available.');
  });
});
