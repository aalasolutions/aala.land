import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

// The send path relies on ingestMessage to append the server's response, the
// same code path the whatsapp:message socket handler uses. That is what keeps
// a later socket echo of the same id from being appended twice.
module('Unit | Controller | whatsapp', function (hooks) {
  setupTest(hooks);

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:whatsapp');
    controller.notifications = { error() {}, success() {}, info() {} };
    return controller;
  }

  test('sendMessage does nothing when the body is blank', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.messageText = '   ';

    let called = false;
    controller.whatsapp = {
      sendMessage() {
        called = true;
        return Promise.resolve({ data: {} });
      },
    };

    await controller.sendMessage();
    assert.false(called, 'service was not called for a blank body');
  });

  test('sendMessage does nothing when no chat is selected', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = null;
    controller.messageText = 'hi';

    let called = false;
    controller.whatsapp = {
      sendMessage() {
        called = true;
        return Promise.resolve({ data: {} });
      },
    };

    await controller.sendMessage();
    assert.false(called, 'service was not called with no chat selected');
  });

  test('sendMessage on success ingests the returned message and clears the input', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.connection = { status: 'connected' };
    controller.messageText = 'hello there';

    let capturedChatId;
    let capturedBody;
    controller.whatsapp = {
      sendMessage(chatId, body) {
        capturedChatId = chatId;
        capturedBody = body;
        return Promise.resolve({
          data: {
            id: 'm-1',
            chatId: 'chat-1',
            body: 'hello there',
            fromMe: true,
            timestamp: 1000,
          },
        });
      },
    };

    await controller.sendMessage();

    assert.strictEqual(capturedChatId, 'chat-1');
    assert.strictEqual(capturedBody, 'hello there');
    assert.strictEqual(controller.messageText, '', 'input cleared on success');
    assert.strictEqual(controller.messages.length, 1);
    assert.strictEqual(controller.messages[0].id, 'm-1');
    assert.false(controller.isSending, 'isSending reset');
  });

  test('sendMessage dedupes against a socket echo that already arrived', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.connection = { status: 'connected' };
    controller.messageText = 'hi';
    // Simulate the whatsapp:message socket event landing before the send
    // response resolves.
    controller.ingestMessage({
      id: 'm-1',
      chatId: 'chat-1',
      body: 'hi',
      fromMe: true,
      timestamp: 1000,
    });

    controller.whatsapp = {
      sendMessage() {
        return Promise.resolve({
          data: {
            id: 'm-1',
            chatId: 'chat-1',
            body: 'hi',
            fromMe: true,
            timestamp: 1000,
          },
        });
      },
    };

    await controller.sendMessage();
    assert.strictEqual(controller.messages.length, 1, 'no duplicate message');
  });

  test('sendMessage surfaces a failure via notifications.error and resets isSending', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.connection = { status: 'connected' };
    controller.messageText = 'hi';

    let errorMessage;
    controller.notifications = {
      error(message) {
        errorMessage = message;
      },
    };
    controller.whatsapp = {
      sendMessage() {
        return Promise.reject(new Error('No connected WhatsApp number'));
      },
    };

    await controller.sendMessage();

    assert.strictEqual(errorMessage, 'No connected WhatsApp number');
    assert.strictEqual(controller.messageText, 'hi', 'input kept on failure');
    assert.strictEqual(
      controller.messages.length,
      0,
      'nothing ingested on failure',
    );
    assert.false(controller.isSending, 'isSending reset');
  });

  test('composerDisabled is true with no chat selected or while sending', function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };
    controller.currentChatId = null;
    assert.true(controller.composerDisabled);

    controller.currentChatId = 'chat-1';
    controller.isSending = false;
    assert.false(controller.composerDisabled);

    controller.isSending = true;
    assert.true(controller.composerDisabled);
  });

  test('composerDisabled is true with no connected number, even with a chat open', function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.isSending = false;

    controller.connection = null;
    assert.true(controller.composerDisabled, 'no connection row');

    controller.connection = { status: 'disconnected' };
    assert.true(controller.composerDisabled, 'disconnected');

    controller.connection = { status: 'flagged' };
    assert.true(controller.composerDisabled, 'flagged');

    controller.connection = { status: 'connected' };
    assert.false(controller.composerDisabled, 'connected clears the gate');
  });

  // ── Reply window ────────────────────────────────────────────────────────
  // Meta opens the window on an inbound customer message only and it runs 24h
  // from that message. `now` is the controller's own clock, so every case below
  // is driven from a fixed instant rather than the wall clock.

  const NOW = Date.parse('2026-08-21T12:00:00.000Z');
  const HOUR = 60 * 60 * 1000;

  function withChat(controller, lastInboundAt) {
    controller.now = NOW;
    controller.chats = [
      { chatId: 'chat-1', chatName: 'Layla', lastTs: NOW, lastInboundAt },
    ];
    controller.currentChatId = 'chat-1';
  }

  test('replyWindow is null when no chat is open', function (assert) {
    const controller = makeController(this);
    controller.currentChatId = null;
    assert.strictEqual(controller.replyWindow, null);
  });

  test('replyWindow is open and counts down from the last inbound message', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - 2 * HOUR);

    const win = controller.replyWindow;
    assert.true(win.open);
    assert.true(win.everOpened);
    assert.strictEqual(win.remainingMs, 22 * HOUR);
    assert.strictEqual(win.label, 'Reply window closes in 22h');
  });

  test('replyWindow renders hours and minutes together when both are left', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - (23 * HOUR + 20 * 60 * 1000));

    assert.strictEqual(
      controller.replyWindow.label,
      'Reply window closes in 40m',
    );

    withChat(controller, NOW - (1 * HOUR + 25 * 60 * 1000));
    assert.strictEqual(
      controller.replyWindow.label,
      'Reply window closes in 22h 35m',
    );
  });

  test('replyWindow reports the last minute as under a minute, not as closed', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - (24 * HOUR - 30 * 1000));

    const win = controller.replyWindow;
    assert.true(win.open);
    assert.strictEqual(win.label, 'Reply window closes in under a minute');
  });

  test('replyWindow closes exactly 24h after the inbound message', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - 24 * HOUR);

    const win = controller.replyWindow;
    assert.false(win.open, 'the boundary itself is closed, not open');
    assert.true(win.everOpened);
    assert.strictEqual(win.remainingMs, 0);
    assert.strictEqual(win.label, 'Reply window closed');
  });

  test('replyWindow reads a chat the customer never wrote in as closed, not unknown', function (assert) {
    const controller = makeController(this);
    withChat(controller, null);

    const win = controller.replyWindow;
    assert.false(win.open);
    assert.false(win.everOpened);
    assert.strictEqual(
      win.detail,
      'The customer has not written yet, so no window is open.',
    );
  });

  test('a closed window never disables the composer: the backend is the enforcement point', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - 30 * HOUR);
    controller.connection = { status: 'connected' };

    assert.false(controller.replyWindow.open);
    assert.false(controller.composerDisabled, 'composer stays usable');
  });

  test('an inbound message reopens the window without a chat-list refetch', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - 30 * HOUR);
    assert.false(controller.replyWindow.open, 'closed before the message');

    // ingestMessage takes epoch seconds, like the API.
    controller.ingestMessage({
      id: 'm-new',
      chatId: 'chat-1',
      body: 'still interested',
      fromMe: false,
      timestamp: Math.floor(NOW / 1000),
    });

    assert.true(controller.replyWindow.open, 'reopened by the inbound message');
  });

  test('an outbound message never opens or extends the window', function (assert) {
    const controller = makeController(this);
    withChat(controller, null);

    controller.ingestMessage({
      id: 'm-out',
      chatId: 'chat-1',
      body: 'hello?',
      fromMe: true,
      timestamp: Math.floor(NOW / 1000),
    });

    assert.false(controller.replyWindow.open);
    assert.false(controller.replyWindow.everOpened, 'still never opened');
  });

  // ── Connection card ─────────────────────────────────────────────────────

  test('connection reads as none, with copy, when the caller has no row', function (assert) {
    const controller = makeController(this);
    controller.connection = null;

    assert.strictEqual(controller.connectionStatus, 'none');
    assert.false(controller.isConnected);
    assert.strictEqual(controller.connectionLabel, 'No number connected');
    assert.strictEqual(
      controller.connectionDetail,
      'Connect your WhatsApp Business number to send and receive here.',
    );
    assert.true(controller.needsConnect, 'the connect CTA is offered');
  });

  // A dead token is stored as FLAGGED so Meta keeps delivering inbound. The card still has
  // to tell the agent to reconnect, and must not call it a quality problem.
  test('a token failure reads as reconnect, not as a quality flag', function (assert) {
    const controller = makeController(this);
    controller.connection = {
      status: 'flagged',
      disconnectReason: 'token_invalid_190',
    };

    assert.true(controller.needsReauth);
    assert.true(controller.needsConnect, 'the reconnect CTA is offered');
    assert.strictEqual(
      controller.connectionDetail,
      'Meta authorization for this number expired. Reconnect to send again.',
    );
  });

  test('a quality flag keeps its own copy and offers no reconnect', function (assert) {
    const controller = makeController(this);
    controller.connection = {
      status: 'flagged',
      disconnectReason: 'QUALITY_LOW',
    };

    assert.false(controller.needsReauth);
    assert.false(controller.needsConnect);
    assert.strictEqual(controller.connectionLabel, 'Flagged by Meta');
  });

  test('the connect button stays disabled until the server serves a signup config', function (assert) {
    const controller = makeController(this);

    controller.signupConfig = null;
    assert.false(controller.signupReady);
    assert.true(controller.connectDisabled);
    assert.strictEqual(
      controller.connectTooltip,
      'WhatsApp signup is not configured on this server yet',
    );

    controller.signupConfig = { appId: 'a', configId: null };
    assert.false(controller.signupReady, 'both values are required');

    controller.signupConfig = { appId: 'a', configId: 'c' };
    assert.true(controller.signupReady);
    assert.false(controller.connectDisabled);
    assert.strictEqual(controller.connectTooltip, null);
  });

  test('connectWhatsapp posts the launch result and adopts the saved connection', async function (assert) {
    const controller = makeController(this);
    controller.signupConfig = { appId: 'a', configId: 'c', graphVersion: 'v23.0' };

    let launchedWith = null;
    controller.embeddedSignup = {
      launch(config) {
        launchedWith = config;
        return Promise.resolve({
          code: 'AQ-code',
          wabaId: '111',
          phoneNumberId: '222',
        });
      },
    };

    let posted = null;
    controller.whatsapp = {
      connect(payload) {
        posted = payload;
        return Promise.resolve({
          data: { status: 'connected', displayPhoneNumber: '+971500000000' },
        });
      },
    };

    await controller.connectWhatsapp();

    assert.strictEqual(launchedWith, controller.signupConfig);
    assert.deepEqual(posted, {
      code: 'AQ-code',
      wabaId: '111',
      phoneNumberId: '222',
    });
    assert.strictEqual(controller.connectionStatus, 'connected');
    assert.false(controller.isConnecting, 'the button is released again');
  });

  test('connectWhatsapp refuses to launch before the config has arrived', async function (assert) {
    const controller = makeController(this);
    controller.signupConfig = null;

    let launched = false;
    controller.embeddedSignup = {
      launch() {
        launched = true;
        return Promise.resolve({});
      },
    };

    await controller.connectWhatsapp();
    assert.false(launched);
  });

  // Walking away from a Meta-hosted flow is not an error worth shouting about.
  test('a cancelled signup is reported quietly and leaves the connection alone', async function (assert) {
    const controller = makeController(this);
    controller.signupConfig = { appId: 'a', configId: 'c' };
    controller.connection = null;

    let errored = false;
    let informed = false;
    controller.notifications = {
      error() {
        errored = true;
      },
      success() {},
      info() {
        informed = true;
      },
    };
    controller.embeddedSignup = {
      launch() {
        const err = new Error('cancelled');
        err.cancelled = true;
        return Promise.reject(err);
      },
    };
    controller.whatsapp = {
      connect() {
        assert.true(false, 'connect must not be called');
        return Promise.resolve({});
      },
    };

    await controller.connectWhatsapp();

    assert.true(informed);
    assert.false(errored);
    assert.strictEqual(controller.connection, null);
    assert.false(controller.isConnecting);
  });

  test('a failed exchange surfaces the error and releases the button', async function (assert) {
    const controller = makeController(this);
    controller.signupConfig = { appId: 'a', configId: 'c' };

    let message = null;
    controller.notifications = {
      error(m) {
        message = m;
      },
      success() {},
      info() {},
    };
    controller.embeddedSignup = {
      launch: () =>
        Promise.resolve({ code: 'c', wabaId: '1', phoneNumberId: '2' }),
    };
    controller.whatsapp = {
      connect: () => Promise.reject(new Error('That number is already connected')),
    };

    await controller.connectWhatsapp();

    assert.strictEqual(message, 'That number is already connected');
    assert.false(controller.isConnecting);
  });

  test('disconnectWhatsapp tears down and re-reads the connection', async function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };

    let disconnected = false;
    controller.whatsapp = {
      disconnect() {
        disconnected = true;
        return Promise.resolve({ success: true });
      },
      getConnection: () => Promise.resolve({ data: null }),
    };

    await controller.disconnectWhatsapp();

    assert.true(disconnected);
    assert.strictEqual(controller.connectionStatus, 'none');
    assert.false(controller.isConnecting);
  });

  test('a connected row shows the display number as its detail', function (assert) {
    const controller = makeController(this);
    controller.connection = {
      status: 'connected',
      displayPhoneNumber: '+971500000000',
    };

    assert.true(controller.isConnected);
    assert.strictEqual(controller.connectionLabel, 'Connected');
    assert.strictEqual(controller.connectionVariant, 'success');
    assert.strictEqual(controller.connectionDetail, '+971500000000');
  });

  test('a disconnected row surfaces the reason Meta gave over the generic copy', function (assert) {
    const controller = makeController(this);
    controller.connection = {
      status: 'disconnected',
      displayPhoneNumber: '+971500000000',
      disconnectReason: 'PARTNER_REMOVED',
    };

    assert.strictEqual(controller.connectionLabel, 'Disconnected');
    assert.strictEqual(controller.connectionVariant, 'danger');
    assert.strictEqual(
      controller.connectionDetail,
      'Meta reported PARTNER_REMOVED.',
    );
  });

  test('a disconnected row with no reason still explains itself', function (assert) {
    const controller = makeController(this);
    controller.connection = {
      status: 'disconnected',
      displayPhoneNumber: '+971500000000',
      disconnectReason: null,
    };

    assert.strictEqual(
      controller.connectionDetail,
      'This number is no longer linked. Reconnect it to send again.',
    );
  });

  test('pending and flagged each get their own label and variant', function (assert) {
    const controller = makeController(this);

    controller.connection = { status: 'pending', displayPhoneNumber: '' };
    assert.strictEqual(controller.connectionLabel, 'Connection pending');
    assert.strictEqual(controller.connectionVariant, 'warning');

    controller.connection = { status: 'flagged', displayPhoneNumber: '+9715' };
    assert.strictEqual(controller.connectionLabel, 'Flagged by Meta');
    assert.strictEqual(controller.connectionVariant, 'danger');
    assert.false(controller.isConnected, 'flagged is not connected');
  });

  test('an unrecognised status falls back to the none copy rather than rendering blank', function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'something-new' };

    assert.strictEqual(controller.connectionLabel, 'No number connected');
    assert.strictEqual(controller.connectionVariant, 'secondary');
  });

  // ── Message updates ─────────────────────────────────────────────────────
  // Status, edits and deletions all arrive on an id we already hold, so the
  // ingest path has to merge them rather than drop them as duplicates.

  test('ingestMessages merges a delivery status onto a message already held', function (assert) {
    const controller = makeController(this);
    controller.ingestMessages([
      { id: 'm-1', chatId: 'chat-1', body: 'hi', fromMe: true, timestamp: 100 },
    ]);
    assert.strictEqual(controller.messages[0].status, undefined);

    controller.ingestMessages([
      {
        id: 'm-1',
        chatId: 'chat-1',
        body: 'hi',
        fromMe: true,
        timestamp: 100,
        status: 'read',
        statusAt: 120,
      },
    ]);

    assert.strictEqual(controller.messages.length, 1, 'still one message');
    assert.strictEqual(controller.messages[0].status, 'read');
    assert.strictEqual(controller.messages[0].statusAt, 120);
  });

  test('ingestMessages keeps an updated message in its original position', function (assert) {
    const controller = makeController(this);
    controller.ingestMessages([
      { id: 'm-1', chatId: 'chat-1', body: 'a', fromMe: true, timestamp: 100 },
      { id: 'm-2', chatId: 'chat-1', body: 'b', fromMe: true, timestamp: 200 },
    ]);

    controller.ingestMessages([
      {
        id: 'm-1',
        chatId: 'chat-1',
        body: 'a',
        fromMe: true,
        timestamp: 100,
        status: 'delivered',
      },
    ]);

    assert.deepEqual(
      controller.messages.map((m) => m.id),
      ['m-1', 'm-2'],
    );
  });

  test('a deleted message survives the empty-body filter and carries deletedAt', function (assert) {
    const controller = makeController(this);
    controller.ingestMessages([
      {
        id: 'm-gone',
        chatId: 'chat-1',
        body: '',
        hasMedia: false,
        fromMe: false,
        timestamp: 100,
        deletedAt: 150,
      },
    ]);

    assert.strictEqual(controller.messages.length, 1, 'stub is kept');
    assert.strictEqual(controller.messages[0].deletedAt, 150);
  });

  test('a body-less, media-less, undeleted row is still dropped', function (assert) {
    const controller = makeController(this);
    controller.ingestMessages([
      {
        id: 'm-empty',
        chatId: 'chat-1',
        body: '',
        fromMe: false,
        timestamp: 100,
      },
    ]);

    assert.strictEqual(controller.messages.length, 0);
  });

  test('a deletion arriving later replaces the body of a message already rendered', function (assert) {
    const controller = makeController(this);
    controller.ingestMessages([
      {
        id: 'm-1',
        chatId: 'chat-1',
        body: 'my old address',
        fromMe: false,
        timestamp: 100,
      },
    ]);

    controller.ingestMessages([
      {
        id: 'm-1',
        chatId: 'chat-1',
        body: 'my old address',
        fromMe: false,
        timestamp: 100,
        deletedAt: 150,
      },
    ]);

    assert.strictEqual(controller.messages.length, 1);
    assert.strictEqual(controller.messages[0].deletedAt, 150);
  });

  // ── Poll dedupe ─────────────────────────────────────────────────────────

  test('pollUpdates does not stack a second request while one is in flight', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';

    let calls = 0;
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    controller.whatsapp = {
      getMessages() {
        calls++;
        return pending.then(() => ({ data: { messages: [] } }));
      },
    };

    const first = controller.pollUpdates();
    await controller.pollUpdates(); // the next tick, first still unresolved
    assert.strictEqual(calls, 1, 'second tick skipped while one was in flight');

    release();
    await first;

    await controller.pollUpdates();
    assert.strictEqual(calls, 2, 'polling resumes once the first settled');
  });

  test('a failed poll releases the in-flight guard instead of wedging it', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';

    let calls = 0;
    controller.whatsapp = {
      getMessages() {
        calls++;
        return Promise.reject(new Error('network down'));
      },
    };

    await controller.pollUpdates();
    await controller.pollUpdates();

    assert.strictEqual(calls, 2, 'a rejection does not block the next tick');
  });

  test('pollUpdates advances the clock even with no chat open', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = null;
    controller.now = 0;

    await controller.pollUpdates();

    assert.true(controller.now > 0, 'countdown clock still moves');
  });

  test('handleKeydown sends on Enter and lets Shift+Enter through for a newline', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.connection = { status: 'connected' };
    controller.messageText = 'hi';

    // @action getter-binds sendMessage, so spy through the service call it
    // makes rather than replacing the bound action itself.
    let sendCalled = 0;
    controller.whatsapp = {
      sendMessage() {
        sendCalled++;
        return Promise.resolve({ data: { id: `m-${sendCalled}` } });
      },
    };

    let prevented = false;
    controller.handleKeydown({
      key: 'Enter',
      shiftKey: false,
      preventDefault: () => (prevented = true),
    });
    await Promise.resolve();
    assert.strictEqual(sendCalled, 1, 'Enter triggers send');
    assert.true(prevented, 'default Enter behavior prevented');

    controller.handleKeydown({
      key: 'Enter',
      shiftKey: true,
      preventDefault: () =>
        assert.notOk(true, 'should not preventDefault on Shift+Enter'),
    });
    await Promise.resolve();
    assert.strictEqual(
      sendCalled,
      1,
      'Shift+Enter does not trigger another send',
    );
  });

  // ── AI toggle ────────────────────────────────────────────────────────────

  test('toggleAi on success adopts the returned enabled state', async function (assert) {
    const controller = makeController(this);
    controller.aiKeyConfigured = true;
    controller.aiEnabled = false;
    controller.whatsapp = {
      toggleAi(enabled) {
        return Promise.resolve({ data: { enabled } });
      },
    };

    await controller.toggleAi();
    assert.true(controller.aiEnabled);
  });

  test('toggleAi surfaces a failure via notifications.error instead of failing silently', async function (assert) {
    const controller = makeController(this);
    controller.aiKeyConfigured = true;
    controller.aiEnabled = false;

    let errorMessage;
    controller.notifications = {
      error(message) {
        errorMessage = message;
      },
    };
    controller.whatsapp = {
      toggleAi() {
        return Promise.reject(new Error('gateway unreachable'));
      },
    };

    await controller.toggleAi();

    assert.strictEqual(errorMessage, 'gateway unreachable');
    assert.false(controller.aiEnabled, 'state unchanged on failure');
  });

  test('toggleAi falls back to a generic message when the error carries none', async function (assert) {
    const controller = makeController(this);
    controller.aiKeyConfigured = true;

    let errorMessage;
    controller.notifications = {
      error(message) {
        errorMessage = message;
      },
    };
    controller.whatsapp = {
      toggleAi() {
        return Promise.reject(new Error());
      },
    };

    await controller.toggleAi();
    assert.strictEqual(errorMessage, 'Could not toggle AI');
  });

  // ── JID residue (Cloud API chat ids are bare E.164 digits, never Baileys JIDs) ──

  test('_isIgnoredChat only filters groups now that Baileys JIDs are gone', function (assert) {
    const controller = makeController(this);

    assert.true(controller._isIgnoredChat({ isGroup: true }));
    assert.false(controller._isIgnoredChat({ isGroup: false }));
    // A chat id that happens to end in the old Baileys newsletter suffix is
    // no longer special-cased: Cloud API chat ids can never look like this,
    // and if one somehow did, it should render like any other chat.
    assert.false(
      controller._isIgnoredChat({
        isGroup: false,
        chatId: '971500000000@newsletter',
      }),
    );
  });

  test('currentChatName falls back to the raw chatId, not a Baileys-style split', function (assert) {
    const controller = makeController(this);
    controller.chats = [];
    controller.currentChatId = '971500000000';

    assert.strictEqual(controller.currentChatName, '971500000000');
  });

  test('_updateChat names a new chat with the raw chatId when no chatName is given', function (assert) {
    const controller = makeController(this);
    controller.ingestMessage({
      id: 'm-1',
      chatId: '971500000000',
      body: 'hi',
      fromMe: false,
      timestamp: 100,
    });

    assert.strictEqual(controller.chats[0].chatId, '971500000000');
    assert.strictEqual(controller.chats[0].chatName, '971500000000');
  });

  // ── Setup failure ────────────────────────────────────────────────────────

  test('setup surfaces a failure via notifications.error, not just the console', async function (assert) {
    const controller = makeController(this);

    let errorMessage;
    controller.notifications = {
      error(message) {
        errorMessage = message;
      },
    };
    controller.whatsapp = {
      connectSocket() {
        return {};
      },
      getChats() {
        return Promise.reject(new Error('backend down'));
      },
      getAllMessages() {
        return Promise.resolve({ data: { messages: [] } });
      },
      getAi() {
        return Promise.resolve({ data: {} });
      },
      getConnection() {
        return Promise.resolve({ data: null });
      },
      getSignupConfig() {
        return Promise.resolve({ data: null });
      },
    };

    await controller.setup();

    assert.strictEqual(errorMessage, 'Could not load WhatsApp data');
  });
});
