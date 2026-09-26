import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click } from '@ember/test-helpers';
import Service from '@ember/service';
import template from 'land/templates/leads';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const FULL_LEAD = {
  id: 'lead-full',
  status: 'NEW',
  temperature: 'WARM',
  assignedTo: 'user-1',
  createdAt: '2026-09-01T10:00:00.000Z',
  contact: {
    id: 'c-1',
    accessLevel: 'FULL',
    displayName: 'Sara Khan',
    phone: '+971501112233',
    email: 'sara@example.com',
    isWhatsapp: true,
  },
};

const LIMITED_LEAD = {
  id: 'lead-limited',
  status: 'NEW',
  temperature: 'HOT',
  assignedTo: 'user-1',
  createdAt: '2026-09-02T10:00:00.000Z',
  contact: {
    id: 'c-9',
    accessLevel: 'LIMITED',
    firstName: 'Omar',
    lastInitial: 'H.',
    phoneMasked: '+971 50 *** **67',
    accessPending: true,
  },
};

// A LIMITED contact on a lead must never leak its number through a wa.me link or print undefined.
module('Integration | Template | leads', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register(
      'service:socket',
      class extends Service {
        on() {}
        off() {}
      },
    );
    stubNotifications(this.owner);
    stubAuth(this.owner, { respond: () => ({ data: [] }) });
  });

  async function renderLeads(ctx, viewMode) {
    const controller = ctx.owner.lookup('controller:leads');
    controller.viewMode = viewMode;
    controller.filterType = 'all';
    await renderRouteTemplate(ctx, template, {
      name: 'leads',
      controller,
      model: { data: [FULL_LEAD, LIMITED_LEAD], total: 2 },
    });
  }

  test('list view masks a limited contact and drops its email and WhatsApp link', async function (assert) {
    await renderLeads(this, 'list');

    const limited = '[data-test-data-table-row="lead-limited"]';
    const full = '[data-test-data-table-row="lead-full"]';
    assert.dom(`${limited} [data-test-lead-row]`).hasText('Omar H.');
    assert.dom(`${limited} [data-test-limited-badge]`).hasText('Limited');
    assert.dom(`${limited} [data-test-lead-phone]`).hasText('+971 50 *** **67');
    assert.dom(`${limited} [data-test-lead-email]`).hasText('');
    assert.dom(`${limited} [data-test-wa-link]`).doesNotExist();
    assert.dom(limited).doesNotContainText('undefined');

    assert.dom(`${full} [data-test-lead-row]`).hasText('Sara Khan');
    assert.dom(`${full} [data-test-limited-badge]`).doesNotExist();
    assert.dom(`${full} [data-test-lead-email]`).hasText('sara@example.com');
    assert
      .dom(`${full} [data-test-wa-link]`)
      .hasAttribute('href', 'https://wa.me/971501112233');
  });

  test('pipeline cards mask a limited contact the same way', async function (assert) {
    await renderLeads(this, 'pipeline');

    const limited = '[data-test-lead-card][data-test-lead-id="lead-limited"]';
    const full = '[data-test-lead-card][data-test-lead-id="lead-full"]';
    assert.dom(limited).containsText('Omar H.');
    assert.dom(`${limited} [data-test-limited-badge]`).exists();
    assert.dom(`${limited} [data-test-lead-phone]`).hasText('+971 50 *** **67');
    assert.dom(`${limited} [data-test-wa-link]`).doesNotExist();
    assert.dom(limited).doesNotContainText('undefined');
    assert.dom(`${full} [data-test-wa-link]`).exists();
  });

  test('the detail modal of a limited lead shows the masked phone, no email and no WhatsApp', async function (assert) {
    await renderLeads(this, 'list');

    await click(
      '[data-test-data-table-row="lead-limited"] [data-test-lead-row]',
    );

    assert.dom('[data-test-nu-modal-title]').hasText('Omar H.');
    assert.dom('[data-test-nu-modal] [data-test-limited-badge]').exists();
    assert
      .dom('[data-test-nu-modal] [data-test-lead-phone]')
      .hasText('+971 50 *** **67');
    assert.dom('[data-test-nu-modal] [data-test-lead-email]').doesNotExist();
    assert.dom('[data-test-nu-modal] [data-test-wa-link]').doesNotExist();
    assert.dom('[data-test-nu-modal]').doesNotContainText('Email');
  });
});
