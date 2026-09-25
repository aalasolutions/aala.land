import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;

module('Integration | Component | whatsapp/chat-list', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register(
      'service:whatsapp',
      class extends Service {
        unread = new Map([['c-open', { unreadCount: 3 }]]);
      },
    );
    this.now = NOW;
    this.selected = [];
    this.onSelect = (chatId) => this.selected.push(chatId);
  });

  test('shows a green clock with time left, an orange one when closed, none for groups', async function (assert) {
    this.chats = [
      {
        chatId: 'c-open',
        chatName: 'Layla',
        lastTs: NOW,
        lastInboundAt: NOW - 9 * HOUR_MS,
      },
      {
        chatId: 'c-expired',
        chatName: 'Omar',
        lastTs: NOW,
        lastInboundAt: NOW - 25 * HOUR_MS,
      },
      { chatId: 'c-never', chatName: 'Sara', lastTs: NOW, lastInboundAt: null },
      { chatId: 'g-1', chatName: 'Team', isGroup: true, lastTs: NOW },
    ];
    await render(hbs`<Whatsapp::ChatList
      @chats={{this.chats}}
      @currentChatId="c-open"
      @onSelect={{this.onSelect}}
      @now={{this.now}}
    />`);

    assert
      .dom('[data-test-wa-chat="c-open"] [data-test-wa-chat-window]')
      .hasAttribute('data-test-wa-chat-window', 'open')
      .hasClass('is-open')
      .hasAttribute('data-tooltip', 'Reply window: 15h remaining');
    const color = (chatId) =>
      getComputedStyle(
        document.querySelector(
          `[data-test-wa-chat="${chatId}"] [data-test-wa-chat-window] i`,
        ),
      ).color;
    assert.notStrictEqual(
      color('c-open'),
      color('c-expired'),
      'open and closed icons render in different colors',
    );
    for (const chatId of ['c-expired', 'c-never']) {
      assert
        .dom(`[data-test-wa-chat="${chatId}"] [data-test-wa-chat-window]`)
        .hasAttribute('data-test-wa-chat-window', 'closed')
        .hasClass('is-closed')
        .hasAttribute(
          'data-tooltip',
          "Reply window closed. Can't reply from web.",
        );
    }
    assert
      .dom('[data-test-wa-chat="g-1"] [data-test-wa-chat-window]')
      .doesNotExist();
  });

  test('marks the active chat, shows unread counts and reports clicks', async function (assert) {
    this.chats = [
      { chatId: 'c-open', chatName: 'Layla', lastTs: NOW },
      { chatId: 'c-other', chatName: 'Omar', lastTs: NOW },
    ];
    await render(hbs`<Whatsapp::ChatList
      @chats={{this.chats}}
      @currentChatId="c-open"
      @onSelect={{this.onSelect}}
      @now={{this.now}}
    />`);

    assert.dom('[data-test-wa-chat="c-open"]').hasClass('is-active');
    assert
      .dom('[data-test-wa-chat="c-open"] [data-test-wa-chat-avatar]')
      .hasText('L', 'the row avatar shows the chat initials');
    assert
      .dom('[data-test-wa-chat="c-open"] [data-test-wa-chat-unread]')
      .exists();
    assert
      .dom('[data-test-wa-chat="c-other"] [data-test-wa-chat-unread]')
      .doesNotExist();

    await click('[data-test-wa-chat="c-other"]');
    assert.deepEqual(this.selected, ['c-other']);
  });

  test('shows the empty state with no chats', async function (assert) {
    this.chats = [];
    await render(hbs`<Whatsapp::ChatList
      @chats={{this.chats}}
      @onSelect={{this.onSelect}}
      @now={{this.now}}
    />`);

    assert.dom('[data-test-wa-chat]').doesNotExist();
    assert.dom('.wa-chat-list').containsText('No chats yet');
  });
});
