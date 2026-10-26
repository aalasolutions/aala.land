import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, settled, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import {
  httpError,
  stubAuth,
  stubNotifications,
} from 'land/tests/helpers/stub-auth';

const LOCALITIES = [
  { id: 'loc-1', name: 'Marina' },
  { id: 'loc-2', name: 'Downtown' },
];

const UNITS = [{ id: 'unit-1', unitNumber: '101', status: 'VACANT' }];

const FULL = { id: 'c-1', accessLevel: 'FULL', displayName: 'Test User' };
const LIMITED = {
  id: 'c-9',
  accessLevel: 'LIMITED',
  firstName: 'Omar',
  lastInitial: 'H.',
  phoneMasked: '+971 50 *** **67',
};

const LEAD = {
  id: 'lead-1',
  status: 'CONTACTED',
  temperature: 'HOT',
  source: 'WEBSITE',
  regionCode: 'DXB',
  locality: { id: 'loc-1', name: 'Marina' },
  unitId: 'unit-1',
  contact: FULL,
};

module('Integration | Component | leads/lead-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.toasts = stubNotifications(this.owner);
    this.respond = (path) => {
      if (path.startsWith('/locations/company/localities')) {
        return { data: LOCALITIES };
      }
      if (path.startsWith('/properties/units')) {
        return { data: { data: UNITS, total: 1 } };
      }
      if (path.startsWith('/contacts')) {
        return { data: { data: [FULL, LIMITED], total: 2 } };
      }
      return { data: { id: 'lead-new' } };
    };
    this.calls = stubAuth(this.owner, {
      respond: (path, options) => this.respond(path, options),
    });
    const region = this.owner.lookup('service:region');
    region.activeRegion = { code: 'DXB' };
    this.saved = 0;
    this.onSaved = () => (this.saved += 1);
    this.noop = () => {};
  });

  function sent(calls, method) {
    return calls.find((c) => c.method === method);
  }

  async function renderDrawer(ctx, lead = null) {
    ctx.lead = lead;
    ctx.open = true;
    await render(
      hbs`<Leads::LeadDrawer @open={{this.open}} @lead={{this.lead}} @onClose={{this.noop}} @onSaved={{this.onSaved}} />`,
    );
    await waitFor('#lead-form');
    await settled();
  }

  async function pickOption(id, text) {
    await click(`#${id} [data-test-wu-dropdown-trigger]`);
    const item = [
      ...document.querySelectorAll(
        '.wu-menu.is-open [data-test-wu-dropdown-item]',
      ),
    ].find((el) => el.textContent.trim() === text);
    await click(item);
  }

  async function pickContact(name) {
    await fillIn(
      '[data-test-contact-search] [data-test-wu-dropdown-filter]',
      '',
    );
    const item = [
      ...document.querySelectorAll(
        '.wu-menu.is-open [data-test-wu-dropdown-item]:not(.m-create)',
      ),
    ].find((el) => el.textContent.trim() === name);
    await click(item);
  }

  test('opening loads localities for the active region', async function (assert) {
    await renderDrawer(this);
    assert.ok(
      this.calls.some(
        (c) => c.path === '/locations/company/localities?regionCode=DXB',
      ),
    );
    assert.dom('[data-test-wu-drawer-title]').hasText('New Lead');
    assert.dom('[data-test-save-lead]').hasText('Create Lead');
  });

  test('create needs a contact before it saves', async function (assert) {
    await renderDrawer(this);
    await click('[data-test-save-lead]');

    assert
      .dom('#lead-form .text-danger')
      .hasText(
        'Select a contact, or enter a name, phone or email to create one.',
      );
    assert.notOk(sent(this.calls, 'POST'), 'nothing is sent');
  });

  test('create posts the picked contact, the defaults and the chosen place', async function (assert) {
    await renderDrawer(this);
    await pickContact('Test User');
    await pickOption('lead-locality', 'Marina');
    assert.ok(
      this.calls.some(
        (c) =>
          c.path ===
          '/properties/units?localityId=loc-1&limit=100&regionCode=DXB',
      ),
      'a locality loads its units',
    );
    await pickOption('lead-unit', 'Property 101 (VACANT)');
    await click('[data-test-save-lead]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/leads');
    assert.deepEqual(post.body, {
      contactId: 'c-1',
      status: 'NEW',
      temperature: 'WARM',
      source: 'OTHER',
      localityId: 'loc-1',
      unitId: 'unit-1',
      regionCode: 'DXB',
    });
    assert.strictEqual(this.saved, 1);
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Lead created' },
    ]);
  });

  test('create sends typed identity and omits an empty locality', async function (assert) {
    await renderDrawer(this);
    await click('[data-test-contact-add-new]');
    await fillIn('[data-test-contact-first-name]', ' A ');
    await click('[data-test-save-lead]');

    const body = sent(this.calls, 'POST').body;
    assert.strictEqual(body.firstName, 'A');
    assert.false('localityId' in body);
    assert.false('unitId' in body);
    assert.false('contactId' in body);
  });

  test('a limited pick sends the typed number beside the contact id', async function (assert) {
    await renderDrawer(this);
    await pickContact('Omar H.');
    await fillIn('[data-test-contact-verify-phone]', ' 0501234567 ');
    await click('[data-test-save-lead]');

    const body = sent(this.calls, 'POST').body;
    assert.strictEqual(body.contactId, 'c-9');
    assert.strictEqual(body.contactVerifyPhone, '0501234567');
  });

  test('a full contact sends no contactVerifyPhone', async function (assert) {
    await renderDrawer(this);
    await pickContact('Test User');
    await click('[data-test-save-lead]');

    assert.false('contactVerifyPhone' in sent(this.calls, 'POST').body);
  });

  test('a pending contact access is announced after the lead is created', async function (assert) {
    const base = this.respond;
    this.respond = (path, options) =>
      options.method === 'POST'
        ? { data: { id: 'lead-1', contactAccess: 'PENDING' } }
        : base(path, options);
    await renderDrawer(this);
    await pickContact('Omar H.');
    await click('[data-test-save-lead]');

    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Lead created' },
      { type: 'info', message: 'Access pending: an approver has been asked' },
    ]);
  });

  test('a CONTACT_EXISTS answer is handed to the picker and can be used', async function (assert) {
    const base = this.respond;
    let posts = 0;
    this.respond = (path, options) => {
      if (options.method === 'POST' && posts++ === 0) {
        return httpError(409, {
          message: 'Contact already added',
          code: 'CONTACT_EXISTS',
          contact: LIMITED,
        });
      }
      return base(path, options);
    };
    await renderDrawer(this);
    await click('[data-test-contact-add-new]');
    await fillIn('[data-test-contact-phone]', '+971501234567');
    await click('[data-test-save-lead]');

    assert.dom('#lead-form .text-danger').hasText('Contact already added');
    assert.dom('[data-test-contact-conflict]').exists();
    assert.strictEqual(this.saved, 0);

    await click('[data-test-contact-use-existing]');
    await click('[data-test-save-lead]');
    const second = this.calls.filter((c) => c.method === 'POST')[1];
    assert.strictEqual(second.body.contactId, 'c-9');
    assert.strictEqual(this.saved, 1);
  });

  test('editing prefills the lead, loads its units and patches only changes', async function (assert) {
    await renderDrawer(this, LEAD);
    assert.dom('[data-test-wu-drawer-title]').hasText('Edit Lead');
    assert.dom('[data-test-contact-picker]').doesNotExist();
    assert.dom('#lead-form').containsText('Test User');
    assert.ok(
      this.calls.some(
        (c) =>
          c.path ===
          '/properties/units?localityId=loc-1&limit=100&regionCode=DXB',
      ),
    );
    assert
      .dom('#lead-status [data-test-wu-dropdown-trigger]')
      .containsText('Contacted');
    assert
      .dom('#lead-unit [data-test-wu-dropdown-trigger]')
      .containsText('Property 101');
    assert.dom('[data-test-save-lead]').hasText('Update');

    await click('[data-test-save-lead]');
    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/leads/lead-1');
    assert.deepEqual(patch.body, {
      status: 'CONTACTED',
      temperature: 'HOT',
      source: 'WEBSITE',
    });
  });

  test('edit sends localityId: null when cleared', async function (assert) {
    await renderDrawer(this, LEAD);
    await pickOption('lead-locality', '-- None --');
    assert.dom('#lead-unit').doesNotExist('no locality hides the property');
    await click('[data-test-save-lead]');

    const body = sent(this.calls, 'PATCH').body;
    assert.strictEqual(body.localityId, null);
    assert.strictEqual(body.unitId, null);
  });

  test('changing the region clears the place and reloads localities', async function (assert) {
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'DXB', name: 'Dubai', currency: 'AED' },
      { code: 'SHJ', name: 'Sharjah', currency: 'AED' },
    ];
    await renderDrawer(this, LEAD);
    await pickOption('lead-region', 'Sharjah (AED)');

    assert.ok(
      this.calls.some(
        (c) => c.path === '/locations/company/localities?regionCode=SHJ',
      ),
    );
    await click('[data-test-save-lead]');
    const body = sent(this.calls, 'PATCH').body;
    assert.strictEqual(body.regionCode, 'SHJ');
    assert.strictEqual(body.localityId, null);
    assert.strictEqual(body.unitId, null);
  });

  test('an edit draft never leaks into another lead', async function (assert) {
    await renderDrawer(this, LEAD);
    await pickOption('lead-temp', 'Cold');
    this.set('lead', { ...LEAD, id: 'lead-2', temperature: 'WARM' });

    assert
      .dom('#lead-temp [data-test-wu-dropdown-trigger]')
      .containsText('Warm');
  });

  test('closing clears the typed contact and the error', async function (assert) {
    await renderDrawer(this);
    await click('[data-test-save-lead]');
    await click('[data-test-contact-add-new]');
    await fillIn('[data-test-contact-first-name]', 'A');

    this.set('open', false);
    await settled();
    this.set('open', true);
    await waitFor('#lead-form');

    assert.dom('#lead-form .text-danger').doesNotExist();
    assert.dom('[data-test-contact-first-name]').doesNotExist();
    await click('[data-test-save-lead]');
    assert.notOk(sent(this.calls, 'POST'), 'the old identity is gone');
  });
});
