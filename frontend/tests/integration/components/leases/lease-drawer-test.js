import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, settled, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const UNIT_ID = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';

const UNITS = [
  {
    id: UNIT_ID,
    areaName: 'Area',
    assetName: 'Tower',
    unitNumber: '101',
    subType: 'OFFICE_SPACE',
  },
  {
    id: '7f9619ff-8b86-4d01-b42d-00cf4fc964ff',
    areaName: 'Area',
    assetName: 'Tower',
    unitNumber: '202',
    subType: 'LAND_PLOT',
  },
];

const LEASE = {
  id: 'l-1',
  unitId: UNIT_ID,
  contactId: 'c-1',
  contact: { id: 'c-1', displayName: 'Test User', accessLevel: 'FULL' },
  type: 'COMMERCIAL',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: '100.00',
  numberOfCheques: 4,
  tenancyRegistrationRef: 'TR-1',
  notes: 'Old notes',
};

module('Integration | Component | leases/lease-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    const calls = [];
    this.calls = calls;
    this.owner.register(
      'service:auth',
      class extends Service {
        async fetchJson(path, options = {}) {
          calls.push({ path, options });
          if (path.startsWith('/properties/units')) {
            return { success: true, data: { data: UNITS, total: 1 } };
          }
          return { success: true, data: { data: [], total: 0 } };
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
    this.noop = () => {};
  });

  async function pickUnit(number = '101') {
    await click('#lease-unit-id [data-test-nu-dropdown-trigger]');
    const item = [
      ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
    ].find((el) => el.textContent.includes(`Property ${number}`));
    await click(item);
  }

  function sent(calls, method) {
    return calls.find((c) => c.options.method === method);
  }

  async function renderDrawer(context, mode, lease = null) {
    context.mode = mode;
    context.lease = lease;
    await render(
      hbs`<Leases::LeaseDrawer @open={{true}} @mode={{this.mode}} @lease={{this.lease}} @onClose={{this.noop}} />`,
    );
    await waitFor('#lease-form');
  }

  function unitFetches(calls) {
    return calls.filter((c) => c.path === '/properties/units?page=1&limit=100')
      .length;
  }

  test('loads its unit list when it opens, not before', async function (assert) {
    this.open = false;
    await render(
      hbs`<Leases::LeaseDrawer @open={{this.open}} @mode="create" @onClose={{this.noop}} />`,
    );
    assert.strictEqual(unitFetches(this.calls), 0, 'closed: nothing fetched');

    this.set('open', true);
    await waitFor('#lease-form');
    await settled();
    assert.strictEqual(unitFetches(this.calls), 1, 'fetched on open');
  });

  test('the unit list is fetched again on a second open', async function (assert) {
    this.open = true;
    await render(
      hbs`<Leases::LeaseDrawer @open={{this.open}} @mode="create" @onClose={{this.noop}} />`,
    );
    await waitFor('#lease-form');
    await settled();
    assert.strictEqual(unitFetches(this.calls), 1);

    this.set('open', false);
    await settled();
    this.set('open', true);
    await waitFor('#lease-form');
    await settled();
    assert.strictEqual(unitFetches(this.calls), 2);
  });

  test('a new lease starts with one cheque and needs a tenant and cheques', async function (assert) {
    await renderDrawer(this, 'create');
    assert.dom('#lease-cheques').hasValue('1');

    await pickUnit();
    await fillIn('#lease-start', '2026-01-01');
    await fillIn('#lease-end', '2026-12-31');
    await fillIn('#lease-rent', '100');
    await click('[data-test-save-lease]');
    assert
      .dom('#lease-form .text-danger')
      .hasText(
        'Select a contact, or enter a name, phone or email to create one.',
      );
    assert.notOk(sent(this.calls, 'POST'), 'nothing is sent');
  });

  test('a unit kind sets the lease type and locks it', async function (assert) {
    await renderDrawer(this, 'create');
    await pickUnit();

    assert
      .dom('#lease-type [data-test-nu-dropdown-trigger]')
      .hasText(/Commercial/);
    assert.dom('#lease-type [data-test-nu-dropdown-trigger]').isDisabled();
  });

  test('editing prefills the lease and patches it with the picked tenant id', async function (assert) {
    await renderDrawer(this, 'edit', LEASE);
    assert.dom('#lease-rent').hasValue('100.00');
    assert.dom('#lease-start').hasValue('2026-01-01');

    await fillIn('#lease-rent', '120');
    await click('[data-test-save-lease]');

    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/leases/l-1');
    const body = JSON.parse(patch.options.body);
    assert.strictEqual(body.contactId, 'c-1');
    assert.strictEqual(body.monthlyRent, 120);
    assert.strictEqual(body.status, 'ACTIVE');
    assert.notOk('unitId' in body, 'an unchanged unit is not sent');
  });

  test('a renewal starts the day after the old lease ends and posts to renew', async function (assert) {
    await renderDrawer(this, 'renew', LEASE);
    assert.dom('#lease-start').hasValue('2027-01-01');
    assert.dom('#lease-end').hasValue('');
    assert.dom('#lease-tenancy-registration-ref').hasValue('');

    await fillIn('#lease-end', '2027-12-31');
    await click('[data-test-save-lease]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/leases/l-1/renew');
    const body = JSON.parse(post.options.body);
    assert.strictEqual(body.startDate, '2027-01-01');
    assert.notOk('status' in body);
  });

  test('an edit draft never leaks into another lease', async function (assert) {
    await renderDrawer(this, 'edit', LEASE);
    await fillIn('#lease-rent', '999');
    this.set('lease', { ...LEASE, id: 'l-2', monthlyRent: '300.00' });

    assert.dom('#lease-rent').hasValue('300.00');
  });

  test('a plot leaves the lease type open', async function (assert) {
    await renderDrawer(this, 'create');
    await pickUnit('202');

    assert.dom('#lease-type [data-test-nu-dropdown-trigger]').isNotDisabled();
  });

  test('a typed tenant is sent as an identity, and cheques must be 1 or more', async function (assert) {
    await renderDrawer(this, 'create');
    await pickUnit();
    await fillIn('#lease-start', '2026-01-01');
    await fillIn('#lease-end', '2026-12-31');
    await fillIn('#lease-rent', '100');
    await click('[data-test-contact-add-new]');
    await fillIn('[data-test-contact-first-name]', ' Test ');
    await fillIn('[data-test-contact-phone]', '+15551234567');

    await fillIn('#lease-cheques', '');
    await click('[data-test-save-lease]');
    assert
      .dom('[data-test-nu-field-error]')
      .hasText('Enter the number of cheques, 1 or more');
    assert.notOk(sent(this.calls, 'POST'));

    await fillIn('#lease-cheques', '2');
    await click('[data-test-save-lease]');
    const body = JSON.parse(sent(this.calls, 'POST').options.body);
    assert.deepEqual(body.tenant, {
      firstName: 'Test',
      phone: '+15551234567',
    });
    assert.notOk('contactId' in body);
  });

  test('an error stays with the record it was raised for', async function (assert) {
    await renderDrawer(this, 'edit', LEASE);
    await fillIn('#lease-cheques', '');
    await click('[data-test-save-lease]');
    assert.dom('#lease-form [data-test-nu-field-error]').exists();

    this.set('mode', 'create');
    this.set('lease', null);
    assert.dom('#lease-form [data-test-nu-field-error]').doesNotExist();
  });

  test('an archived unit warns on edit even without a unit relation', async function (assert) {
    this.lease = LEASE;
    await render(
      hbs`<Leases::LeaseDrawer @open={{true}} @mode="edit" @lease={{this.lease}} @unitArchived={{true}} @onClose={{this.noop}} />`,
    );
    await waitFor('#lease-form');

    assert
      .dom('[data-test-lease-unit-archived]')
      .hasText('This unit is archived. Its leases can no longer be edited.');
  });
});
