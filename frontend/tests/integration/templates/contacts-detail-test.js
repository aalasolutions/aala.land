import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn } from '@ember/test-helpers';
import template from 'land/templates/contacts/detail';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

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
    { role = 'manager', respond } = {},
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
      model: { contact, units: [], leases: [], leads: [] },
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
      .dom('[data-test-nu-field-error]')
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
    assert.dom(detail).containsText('Properties Owned');
    assert.dom('[data-test-contact-history]').exists();
  });
  test('an agent with a grant sees full details but no Edit', async function (assert) {
    await renderDetail(this, FULL, { role: 'agent' });

    assert.dom('[data-test-contact-detail]').containsText('sara@example.com');
    assert.dom('[data-test-edit-contact]').doesNotExist();
    assert.dom('[data-test-request-access]').doesNotExist();
  });
});
