import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click, find } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const FULL_STAMP = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

// Browser-local wall clock on NOW's calendar day, shifted by dayOffset days.
function localAt(dayOffset, hours, minutes) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

// Left edge of one character of an element's text, for checking visual order.
function charLeft(element, index) {
  const text = document
    .createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    })
    .nextNode();
  const offset = text.data.indexOf(text.data.trim()) + index;
  const range = document.createRange();
  range.setStart(text, offset);
  range.setEnd(text, offset + 1);
  return range.getBoundingClientRect().left;
}

module('Integration | Component | whatsapp/chat-list', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register(
      'service:whatsapp',
      class extends Service {
        unread = new Map([
          ['c-open', { unreadCount: 3 }],
          ['c-many', { unreadCount: 120 }],
        ]);
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

  test('shows a short time with the full stamp on hover', async function (assert) {
    const today = localAt(0, 9, 30);
    const yesterday = localAt(-1, 18, 45);
    this.chats = [
      { chatId: 'c-today', chatName: 'Layla', lastTs: today },
      { chatId: 'c-yesterday', chatName: 'Omar', lastTs: yesterday },
    ];
    await render(hbs`<Whatsapp::ChatList
      @chats={{this.chats}}
      @onSelect={{this.onSelect}}
      @now={{this.now}}
    />`);

    const fullStamp = (value) =>
      new Date(value).toLocaleString('en-US', FULL_STAMP).replace(/\s/g, ' ');
    assert
      .dom('[data-test-wa-chat="c-today"] [data-test-wa-chat-time]')
      .hasText('9:30 AM')
      .hasAttribute('title', fullStamp(today));
    assert
      .dom('[data-test-wa-chat="c-yesterday"] [data-test-wa-chat-time]')
      .hasText('Yesterday')
      .hasAttribute('title', fullStamp(yesterday));
  });

  test('keeps the preview and the unread count in reading order under RTL', async function (assert) {
    this.chats = [
      {
        chatId: 'c-many',
        chatName: 'Layla',
        lastTs: NOW,
        lastFromMe: true,
        lastBody: '',
      },
    ];
    await render(hbs`<div dir="rtl"><Whatsapp::ChatList
      @chats={{this.chats}}
      @onSelect={{this.onSelect}}
      @now={{this.now}}
    /></div>`);

    assert
      .dom('[data-test-wa-chat="c-many"] [data-test-wa-chat-preview]')
      .hasAttribute('dir', 'auto')
      .hasText('You:');

    const badge = find(
      '[data-test-wa-chat="c-many"] [data-test-wa-chat-unread]',
    );
    assert.dom(badge).hasText('99+');
    assert.true(
      charLeft(badge, 0) < charLeft(badge, 2),
      'the plus sign renders after the digits, not before them',
    );
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
