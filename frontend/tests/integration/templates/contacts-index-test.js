import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, findAll } from '@ember/test-helpers';
import template from 'land/templates/contacts/index';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const FULL = {
  id: 'c-full',
  accessLevel: 'FULL',
  displayName: 'Sara Khan',
  firstName: 'Sara',
  lastName: 'Khan',
  email: 'sara@example.com',
  phone: '+971501112233',
  isWhatsapp: true,
  contactCompany: 'Example Holdings',
  tags: ['lead'],
  regionCode: 'DXB',
  createdBy: 'user-1',
  createdByName: 'Test User',
};

const LIMITED = {
  id: 'c-limited',
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

// Agents first meet someone else's contact on this list, so its limited rows are pinned.
module('Integration | Template | contacts/index', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.toasts = stubNotifications(this.owner);
  });

  async function renderList(
    ctx,
    { role = 'agent', contacts = [FULL, LIMITED], respond } = {},
  ) {
    ctx.calls = stubAuth(ctx.owner, { role, respond });
    const controller = ctx.owner.lookup('controller:contacts/index');
    controller.router = { refresh() {} };
    await renderRouteTemplate(ctx, template, {
      name: 'contacts.index',
      controller,
      model: {
        contacts,
        total: contacts.length,
        page: 1,
        limit: 50,
        agents: [],
      },
    });
    return controller;
  }

  function row(id) {
    return `[data-test-data-table-row="${id}"]`;
  }

  test('a limited row shows the masked name and phone, a badge, and no email or company', async function (assert) {
    await renderList(this);

    assert
      .dom(`${row('c-limited')} [data-test-view-contact]`)
      .hasText('Omar H.');
    assert
      .dom(`${row('c-limited')} [data-test-limited-badge]`)
      .hasText('Limited');
    assert
      .dom(`${row('c-limited')} [data-test-contact-phone]`)
      .hasText('+971 50 *** **67');
    assert.dom(`${row('c-limited')} [data-test-wa-link]`).doesNotExist();
    assert.dom(row('c-limited')).doesNotContainText('undefined');
    assert
      .dom(row('c-limited'))
      .containsText('Other Agent', 'Added by is shown');
    assert.dom(`${row('c-limited')} [data-test-edit-contact]`).doesNotExist();
    assert.dom(`${row('c-limited')} [data-test-request-access]`).exists();

    assert
      .dom(`${row('c-full')} [data-test-view-contact]`)
      .hasText('Sara Khan');
    assert.dom(`${row('c-full')} [data-test-limited-badge]`).doesNotExist();
    assert.dom(row('c-full')).containsText('sara@example.com');
    assert.dom(`${row('c-full')} [data-test-wa-link]`).exists();
    assert.dom(`${row('c-full')} [data-test-edit-contact]`).exists();
  });

  test('a limited row already waiting shows Access pending instead of the button', async function (assert) {
    await renderList(this, { contacts: [{ ...LIMITED, accessPending: true }] });

    assert
      .dom(`${row('c-limited')} [data-test-access-pending]`)
      .hasText('Access pending');
    assert.dom(`${row('c-limited')} [data-test-request-access]`).doesNotExist();
  });

  test('Request access posts the contact id, toasts, and flips the row to pending', async function (assert) {
    await renderList(this, {
      respond: (path) =>
        path === '/contact-access-requests' ? { data: { id: 'r-1' } } : {},
    });

    await click(`${row('c-limited')} [data-test-request-access]`);

    const post = this.calls.find((c) => c.path === '/contact-access-requests');
    assert.strictEqual(post.method, 'POST');
    assert.deepEqual(post.body, { contactId: 'c-limited' });
    assert.strictEqual(this.toasts[0].type, 'success');
    assert.dom(`${row('c-limited')} [data-test-access-pending]`).exists();
    assert.dom(`${row('c-limited')} [data-test-request-access]`).doesNotExist();
  });

  test('the All regions toggle defaults off for an agent and on for a company admin', async function (assert) {
    const controller = await renderList(this, { role: 'agent' });
    assert.dom('[data-test-all-regions-toggle] input').isNotChecked();

    await click('[data-test-all-regions-toggle] input');
    assert.strictEqual(
      controller.allRegions,
      'true',
      'turning it on is written to the query param',
    );
    assert.dom('[data-test-all-regions-toggle] input').isChecked();
  });

  test('a company admin opens on all regions and can narrow to the active one', async function (assert) {
    const controller = await renderList(this, { role: 'company_admin' });
    assert.dom('[data-test-all-regions-toggle] input').isChecked();

    await click('[data-test-all-regions-toggle] input');
    assert.strictEqual(controller.allRegions, 'false');
    assert.dom('[data-test-all-regions-toggle] input').isNotChecked();
  });

  test('the My requests tab swaps the list for the caller own requests', async function (assert) {
    const controller = await renderList(this, {
      respond: (path) =>
        path.startsWith('/contact-access-requests')
          ? { data: { data: [], total: 0, page: 1, limit: 20 } }
          : {},
    });
    assert.dom('[data-test-contacts-table]').exists();
    assert.dom('[data-test-my-requests]').doesNotExist();

    await click('[data-test-nu-tabs-trigger="requests"]');

    assert.strictEqual(controller.tab, 'requests');
    assert.dom('[data-test-contacts-table]').doesNotExist();
    assert.dom('[data-test-my-requests]').exists();
    assert.ok(
      this.calls.some((c) =>
        c.path.startsWith('/contact-access-requests?mine=true'),
      ),
      'the tab loads the caller own requests',
    );
    assert.strictEqual(findAll('[data-test-all-regions-toggle]').length, 0);
  });
  test('an agent with a grant sees a full row without Edit', async function (assert) {
    await renderList(this, {
      contacts: [{ ...FULL, id: 'c-granted', createdBy: 'user-2' }],
    });

    const granted = row('c-granted');
    assert.dom(`${granted} [data-test-view-contact]`).hasText('Sara Khan');
    assert.dom(granted).containsText('sara@example.com');
    assert.dom(`${granted} [data-test-edit-contact]`).doesNotExist();
    assert.dom(`${granted} [data-test-request-access]`).doesNotExist();
  });
});
