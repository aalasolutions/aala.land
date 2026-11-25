import { module, test } from 'qunit';
import { click } from '@ember/test-helpers';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/whatsapp';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

module('Integration | Template | whatsapp', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    stubNotifications(this.owner);
    this.calls = stubAuth(this.owner, { respond: () => ({ data: {} }) });
  });

  async function renderChat(ctx, chat) {
    const controller = ctx.owner.lookup('controller:whatsapp');
    controller.session = { whatsappConfigured: true };
    controller.whatsapp.chats = [
      { chatId: 'chat-1', chatName: 'Test Customer', lastTs: NOW, ...chat },
    ];
    controller.currentChatId = 'chat-1';
    await renderRouteTemplate(ctx, template, {
      name: 'whatsapp',
      controller,
      model: {},
    });
  }

  test('a chat without AI state shows neither notice nor the clear button', async function (assert) {
    await renderChat(this, { aiEscalatedAt: null, aiOptedOutAt: null });
    assert.dom('[data-test-wa-composer-input]').exists('the composer renders');
    assert.dom('[data-test-wa-needs-human-notice]').doesNotExist();
    assert.dom('[data-test-wa-clear-needs-human]').doesNotExist();
    assert.dom('[data-test-wa-opted-out-notice]').doesNotExist();
  });

  test('an escalated chat shows the needs reply notice with its clear button', async function (assert) {
    await renderChat(this, {
      aiEscalatedAt: NOW,
      aiEscalationReason: 'payment',
      aiOptedOutAt: null,
    });
    assert
      .dom('[data-test-wa-needs-human-notice]')
      .hasAttribute('role', 'status')
      .containsText('Automatic replies are paused.');
    assert.dom('[data-test-wa-clear-needs-human]').hasText('Clear needs reply');
    assert.dom('[data-test-wa-opted-out-notice]').doesNotExist();
  });

  test('clearing needs reply removes the notice after the request succeeds', async function (assert) {
    await renderChat(this, { aiEscalatedAt: NOW, aiEscalationReason: 'other' });
    await click('[data-test-wa-clear-needs-human]');
    assert.deepEqual(
      this.calls.map((c) => `${c.method} ${c.path}`),
      ['DELETE /whatsapp/chats/chat-1/escalation'],
    );
    assert.dom('[data-test-wa-needs-human-notice]').doesNotExist();
    assert.dom('[data-test-wa-clear-needs-human]').doesNotExist();
  });

  test('an opted out chat shows the opted out notice only', async function (assert) {
    await renderChat(this, { aiEscalatedAt: null, aiOptedOutAt: NOW });
    assert
      .dom('[data-test-wa-opted-out-notice]')
      .hasAttribute('role', 'status')
      .containsText('This customer turned off automatic replies.');
    assert.dom('[data-test-wa-needs-human-notice]').doesNotExist();
    assert.dom('[data-test-wa-clear-needs-human]').doesNotExist();
  });

  test('a chat with both states shows both notices', async function (assert) {
    await renderChat(this, { aiEscalatedAt: NOW, aiOptedOutAt: NOW });
    assert.dom('[data-test-wa-needs-human-notice]').exists();
    assert.dom('[data-test-wa-clear-needs-human]').exists();
    assert.dom('[data-test-wa-opted-out-notice]').exists();
  });
});
