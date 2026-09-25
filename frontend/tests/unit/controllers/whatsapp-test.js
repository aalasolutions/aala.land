import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { settled } from '@ember/test-helpers';
import WhatsappService from 'land/services/whatsapp';

// sendMessage relies on ingestMessage, the socket handler's path, so a later echo is deduped.
module('Unit | Controller | whatsapp', function (hooks) {
  setupTest(hooks);

  function openThread(controller, state = {}, chatId = 'chat-1') {
    controller.currentChatId = chatId;
    controller.threads = new Map([
      [
        chatId,
        {
          messages: [],
          oldestId: null,
          newestId: null,
          hasMore: false,
          hasMoreNewer: false,
          loading: null,
          error: false,
          newerError: false,
          ...state,
        },
      ],
    ]);
  }

  function ids(controller) {
    return controller.currentChatMessages.map((m) => m.id);
  }

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:whatsapp');
    controller.notifications = { error() {}, success() {}, info() {} };
    // Defaults to configured so the signupConfig-only tests below still exercise just appId/configId.
    controller.session = { whatsappConfigured: true };
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
    openThread(controller);
    controller.connection = { status: 'connected' };
    controller.messageText = 'hello there';

    let capturedChatId;
    let capturedBody;
    controller.whatsapp = {
      ...fakeWhatsappService(),
      chats: [{ chatId: 'chat-1', lastInboundAt: Date.now() }],
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
    assert.deepEqual(ids(controller), ['m-1']);
    assert.false(controller.isSending, 'isSending reset');
  });

  test('sendMessage dedupes against a socket echo that already arrived', async function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.connection = { status: 'connected' };
    controller.messageText = 'hi';
    // Simulate the whatsapp:message socket event landing before the send response resolves.
    controller.ingestMessage({
      id: 'm-1',
      chatId: 'chat-1',
      body: 'hi',
      fromMe: true,
      timestamp: 1000,
    });

    const errors = [];
    controller.notifications = {
      error: (m) => errors.push(m),
      success() {},
      info() {},
    };
    controller.whatsapp = {
      ...fakeWhatsappService(),
      chats: [{ chatId: 'chat-1', lastInboundAt: Date.now() }],
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
    assert.deepEqual(ids(controller), ['m-1'], 'no duplicate message');
    assert.deepEqual(errors, [], 'the dedupe path raises no error');
  });

  test('sendMessage surfaces a failure via notifications.error and resets isSending', async function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.connection = { status: 'connected' };
    controller.messageText = 'hi';

    let errorMessage;
    controller.notifications = {
      error(message) {
        errorMessage = message;
      },
    };
    controller.whatsapp = {
      chats: [{ chatId: 'chat-1', lastInboundAt: Date.now() }],
      sendMessage() {
        return Promise.reject(new Error('No connected WhatsApp number'));
      },
    };

    await controller.sendMessage();

    assert.strictEqual(errorMessage, 'No connected WhatsApp number');
    assert.strictEqual(controller.messageText, 'hi', 'input kept on failure');
    assert.deepEqual(ids(controller), [], 'nothing ingested on failure');
    assert.false(controller.isSending, 'isSending reset');
  });

  function withOpenWindow(controller, chatId = 'chat-1') {
    controller.now = Date.now();
    controller.whatsapp.chats = [
      { chatId, chatName: 'Layla', lastInboundAt: controller.now },
    ];
  }

  test('composerDisabled is true with no chat selected or while sending', function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };
    withOpenWindow(controller);
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
    withOpenWindow(controller);
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

  // Meta's 24h window opens on inbound only; `now` is the controller's clock, fixed for tests.

  const NOW = Date.parse('2026-08-21T12:00:00.000Z');
  const HOUR = 60 * 60 * 1000;

  function withChat(controller, lastInboundAt) {
    controller.now = NOW;
    controller.whatsapp.chats = [
      { chatId: 'chat-1', chatName: 'Layla', lastTs: NOW, lastInboundAt },
    ];
    controller.currentChatId = 'chat-1';
  }

  function timeAt(ms) {
    return new Date(ms).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
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
    assert.strictEqual(
      win.label,
      `Reply window closes in 22h (at ${timeAt(NOW + 22 * HOUR)})`,
    );
  });

  test('replyWindow renders hours and minutes together when both are left', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - (23 * HOUR + 20 * 60 * 1000));

    assert.strictEqual(
      controller.replyWindow.label,
      `Reply window closes in 40m (at ${timeAt(NOW + 40 * 60 * 1000)})`,
    );

    withChat(controller, NOW - (1 * HOUR + 25 * 60 * 1000));
    assert.strictEqual(
      controller.replyWindow.label,
      `Reply window closes in 22h 35m (at ${timeAt(NOW + 22 * HOUR + 35 * 60 * 1000)})`,
    );
  });

  test('replyWindow label shows both the duration and the closing time', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - (21 * HOUR + 30 * 60 * 1000));

    const label = controller.replyWindow.label;
    assert.true(label.includes('2h 30m'), 'duration');
    assert.true(label.includes(`(at ${timeAt(NOW + 2.5 * HOUR)})`), 'time');
  });

  test('replyWindow reports the last minute as under a minute, not as closed', function (assert) {
    const controller = makeController(this);
    withChat(controller, NOW - (24 * HOUR - 30 * 1000));

    const win = controller.replyWindow;
    assert.true(win.open);
    assert.true(
      win.label.startsWith('Reply window closes in under a minute (at '),
    );
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

  test('a closed reply window disables the composer', function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };

    withChat(controller, NOW - 30 * HOUR);
    assert.false(controller.replyWindow.open);
    assert.true(controller.composerDisabled, 'expired window');

    withChat(controller, null);
    assert.true(controller.composerDisabled, 'customer never wrote');
  });

  test('an open reply window leaves the composer enabled', function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };
    withChat(controller, NOW - 2 * HOUR);

    assert.true(controller.replyWindow.open);
    assert.false(controller.composerDisabled);
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
      'Meta authorization expired. Reconnect to send again.',
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

  test('signupReady also requires the server whatsappConfigured flag', function (assert) {
    const controller = makeController(this);
    controller.session = { whatsappConfigured: false };
    controller.signupConfig = { appId: 'a', configId: 'c' };

    assert.false(
      controller.signupReady,
      'the session flag gates readiness even with a full signup config',
    );
    assert.true(controller.connectDisabled);
    assert.strictEqual(
      controller.connectTooltip,
      'WhatsApp is not configured. Check system variables or contact your admin.',
    );
  });

  test('connectTooltip keeps the signup-specific message when only the Meta config is missing', function (assert) {
    const controller = makeController(this);
    controller.session = { whatsappConfigured: true };
    controller.signupConfig = null;

    assert.false(controller.signupReady);
    assert.strictEqual(
      controller.connectTooltip,
      'WhatsApp signup is not configured on this server yet',
    );
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

  test('disconnectWhatsapp unwraps a null connection to null, not the response wrapper', async function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };

    controller.whatsapp = {
      disconnect: () => Promise.resolve({ success: true }),
      getConnection: () => Promise.resolve({ success: true, data: null }),
    };

    await controller.disconnectWhatsapp();

    assert.strictEqual(controller.connection, null);
    assert.strictEqual(
      controller.connectButtonText,
      'Connect WhatsApp',
      'a never-connected user is not offered Reconnect',
    );
  });

  test('openDisconnectConfirm opens the modal without disconnecting', function (assert) {
    const controller = makeController(this);
    let disconnected = false;
    controller.whatsapp = {
      disconnect() {
        disconnected = true;
        return Promise.resolve({ success: true });
      },
    };

    controller.openDisconnectConfirm();

    assert.true(controller.isDisconnectConfirmOpen);
    assert.false(disconnected);
  });

  test('confirmDisconnect disconnects and closes the modal', async function (assert) {
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

    controller.openDisconnectConfirm();
    await controller.confirmDisconnect();

    assert.true(disconnected);
    assert.false(controller.isDisconnectConfirmOpen);
    assert.false(controller.isConnecting);
  });

  test('confirmDisconnect closes the modal when the disconnect fails', async function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };
    controller.whatsapp = {
      disconnect: () => Promise.reject(new Error('Meta is down')),
    };
    const originalError = console.error;
    console.error = () => {};

    controller.openDisconnectConfirm();
    try {
      await controller.confirmDisconnect();
    } finally {
      console.error = originalError;
    }

    assert.false(controller.isDisconnectConfirmOpen);
    assert.false(controller.isConnecting);
  });

  test('closeDisconnectConfirm cancels without disconnecting', function (assert) {
    const controller = makeController(this);
    let disconnected = false;
    controller.whatsapp = {
      disconnect() {
        disconnected = true;
        return Promise.resolve({ success: true });
      },
    };

    controller.openDisconnectConfirm();
    controller.closeDisconnectConfirm();

    assert.false(controller.isDisconnectConfirmOpen);
    assert.false(disconnected);
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
      'Access was removed in Meta Business settings.',
    );
  });

  test('an unknown disconnect reason never shows the raw code', function (assert) {
    const controller = makeController(this);
    controller.connection = {
      status: 'disconnected',
      disconnectReason: 'SOME_NEW_META_REASON',
    };

    assert.strictEqual(
      controller.connectionDetail,
      'This number was disconnected.',
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

  // Status, edits and deletions arrive on an id already held, so ingest merges, not drops, them.

  function ingestAll(controller, msgs) {
    for (const m of msgs) controller.ingestMessage(m);
  }

  test('ingestMessage merges a delivery status onto a message already held', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    ingestAll(controller, [
      { id: 'm-1', chatId: 'chat-1', body: 'hi', fromMe: true, timestamp: 100 },
    ]);
    assert.strictEqual(controller.currentChatMessages[0].status, undefined);

    controller.ingestMessage({
      id: 'm-1',
      chatId: 'chat-1',
      body: 'hi',
      fromMe: true,
      timestamp: 100,
      status: 'read',
      statusAt: 120,
    });

    assert.strictEqual(controller.currentChatMessages.length, 1);
    assert.strictEqual(controller.currentChatMessages[0].status, 'read');
    assert.strictEqual(controller.currentChatMessages[0].statusAt, 120);
  });

  test('ingestMessage keeps an updated message in its original position', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    ingestAll(controller, [
      { id: 'm-1', chatId: 'chat-1', body: 'a', fromMe: true, timestamp: 100 },
      { id: 'm-2', chatId: 'chat-1', body: 'b', fromMe: true, timestamp: 200 },
    ]);

    controller.ingestMessage({
      id: 'm-1',
      chatId: 'chat-1',
      body: 'a',
      fromMe: true,
      timestamp: 100,
      status: 'delivered',
    });

    assert.deepEqual(ids(controller), ['m-1', 'm-2']);
  });

  test('a deleted message survives the empty-body filter and carries deletedAt', function (assert) {
    const controller = makeController(this);
    const page = controller._pageMessages([
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

    assert.strictEqual(page.length, 1, 'stub kept');
    assert.strictEqual(page[0].deletedAt, 150);
  });

  test('a body-less, media-less, undeleted row is still dropped', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.ingestMessage({
      id: 'm-empty',
      chatId: 'chat-1',
      body: '',
      fromMe: false,
      timestamp: 100,
    });

    assert.strictEqual(controller.currentChatMessages.length, 0);
  });

  test('a deletion arriving later replaces the body of a message already rendered', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    const base = {
      id: 'm-1',
      chatId: 'chat-1',
      body: 'my old address',
      fromMe: false,
      timestamp: 100,
    };
    controller.ingestMessage(base);
    controller.ingestMessage({ ...base, deletedAt: 150 });

    assert.strictEqual(controller.currentChatMessages.length, 1);
    assert.strictEqual(controller.currentChatMessages[0].deletedAt, 150);
  });

  test('a status event merges status, statusAt and errorCode into the held message', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.ingestMessage({
      id: 'm-1',
      chatId: 'chat-1',
      body: 'hi',
      fromMe: true,
      timestamp: 100,
    });

    controller.applyStatus({
      id: 'm-1',
      status: 'failed',
      statusAt: 120,
      errorCode: '131042',
    });

    const [held] = controller.currentChatMessages;
    assert.strictEqual(controller.currentChatMessages.length, 1);
    assert.strictEqual(held.status, 'failed');
    assert.strictEqual(held.statusAt, 120);
    assert.strictEqual(held.errorCode, '131042');
    assert.strictEqual(held.body, 'hi', 'body kept');
  });

  test('a status event for an unknown message id is ignored', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.ingestMessage({
      id: 'm-1',
      chatId: 'chat-1',
      body: 'hi',
      fromMe: true,
      timestamp: 100,
    });
    const before = controller.threads;

    controller.applyStatus({ id: 'm-unknown', status: 'read', statusAt: 120 });

    assert.strictEqual(controller.threads, before, 'threads untouched');
  });

  function msg(id, timestamp, chatId = 'chat-1') {
    return { id, chatId, body: id, fromMe: false, timestamp };
  }

  function httpError(status) {
    const err = new Error('Unknown message cursor');
    err.status = status;
    return err;
  }

  function fakeWhatsappService({ pages = [], chats = [], saved = null } = {}) {
    const listeners = {};
    const calls = [];
    const saves = [];
    return {
      listeners,
      calls,
      saves,
      connects: 0,
      disconnects: 0,
      activeChatId: null,
      unread: new Map(),
      chats: [],
      viewerMessage: null,
      updateChat: WhatsappService.prototype.updateChat,
      isChatLastMessage: WhatsappService.prototype.isChatLastMessage,
      closeMediaViewer() {
        this.viewerMessage = null;
      },
      on(type, fn) {
        (listeners[type] ??= new Set()).add(fn);
      },
      off(type, fn) {
        listeners[type]?.delete(fn);
      },
      emit(type, data) {
        for (const fn of listeners[type] ?? []) fn(data);
      },
      connectSocket() {
        this.connects++;
      },
      disconnectSocket() {
        this.disconnects++;
      },
      beginUnreadSeed: () => ({ seq: 1, since: 0 }),
      seedUnread() {},
      seedChats(list, ticket) {
        this.seedUnread(list, ticket);
        this.chats = list;
      },
      saveLastChat(entry) {
        saves.push(entry);
      },
      readLastChat: () => saved,
      getChats: () => Promise.resolve({ data: { chats } }),
      getAi: () => Promise.resolve({ data: {} }),
      getConnection: () => Promise.resolve({ data: null }),
      getSignupConfig: () => Promise.resolve({ data: null }),
      getMessages(chatId, opts) {
        calls.push({ chatId, opts });
        const next = pages.shift() ?? { messages: [], hasMore: false };
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve({ data: next });
      },
    };
  }

  // Fake scroll container with row offsets.
  function threadEl(controller, { scrollTop, scrollHeight, clientHeight }) {
    const el = {
      scrollTop,
      scrollHeight,
      clientHeight,
      rows: [],
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll() {
        return el.rows.map((r) => ({
          dataset: { messageId: r.id },
          getBoundingClientRect: () => ({ top: r.top, bottom: r.top + 50 }),
        }));
      },
    };
    controller._threadElement = () => el;
    return el;
  }

  // ── Lifecycle ──

  test('setup subscribes to message, status, chats and ai without touching the socket', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService();
    controller.whatsapp = whatsapp;

    await controller.setup();
    controller.stopClock();

    assert.deepEqual(Object.keys(whatsapp.listeners).sort(), [
      'ai',
      'chats',
      'connection',
      'history',
      'message',
      'message-update',
      'status',
    ]);
    assert.strictEqual(whatsapp.connects, 0, 'the app controller owns connect');

    openThread(controller);
    whatsapp.emit('message', msg('m-1', 100));
    assert.deepEqual(ids(controller), ['m-1'], 'message ingested');

    whatsapp.emit('status', { id: 'm-1', status: 'read', statusAt: 120 });
    assert.strictEqual(controller.currentChatMessages[0].status, 'read');

    whatsapp.emit('ai', { enabled: true, creditsUsed: 3 });
    assert.true(controller.aiEnabled, 'ai applied');
    assert.strictEqual(controller.creditsUsed, 3);
    controller.teardown();
  });

  test('teardown unsubscribes every handler and never disconnects the socket', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService();
    controller.whatsapp = whatsapp;

    await controller.setup();
    controller.teardown();

    for (const type of ['message', 'message-update', 'status', 'ai', 'chats']) {
      assert.strictEqual(whatsapp.listeners[type].size, 0, `${type} removed`);
    }
    assert.strictEqual(whatsapp.disconnects, 0, 'socket stays alive');
    assert.strictEqual(controller.threads.size, 0, 'threads reset');
    assert.strictEqual(controller.currentChatId, null);
  });

  test('setup loads only the chat list with unread counters, no messages', async function (assert) {
    const controller = makeController(this);
    const chats = [
      { chatId: 'chat-1', unreadCount: 3, lastReadMessageId: 'm-1' },
    ];
    const whatsapp = fakeWhatsappService({ chats });
    let seeded;
    whatsapp.seedUnread = (list) => (seeded = list);
    controller.whatsapp = whatsapp;

    await controller.setup();
    controller.teardown();

    assert.deepEqual(seeded, chats, 'unread seeded from chats');
    assert.strictEqual(whatsapp.calls.length, 0, 'no message reads');
    assert.strictEqual(whatsapp.getAllMessages, undefined);
    assert.strictEqual(whatsapp.chats.length, 1);
  });

  // ── Opening a chat ──

  test('opening a chat with nothing unread loads the latest 50 and shows the bottom', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-2', 200), msg('m-3', 300)], hasMore: true }],
    });
    whatsapp.unread.set('chat-1', { unreadCount: 0, lastReadMessageId: 'm-3' });
    controller.whatsapp = whatsapp;
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 400,
    });

    controller.selectChat('chat-1');
    assert.true(controller.currentChatLoadingWindow, 'loading while in flight');
    assert.false(controller.currentChatLoadingOlder);
    controller.selectChat('chat-1');
    await settled();

    assert.deepEqual(whatsapp.calls, [
      { chatId: 'chat-1', opts: { limit: 50 } },
    ]);
    const { messages, requestId, ...rest } = controller.threads.get('chat-1');
    assert.deepEqual(
      messages.map((m) => m.id),
      ['m-2', 'm-3'],
    );
    assert.strictEqual(typeof requestId, 'number');
    assert.deepEqual(rest, {
      oldestId: 'm-2',
      newestId: 'm-3',
      hasMore: true,
      hasMoreNewer: false,
      loading: null,
      error: false,
      newerError: false,
      windowError: false,
    });
    assert.strictEqual(controller.unreadMarkerId, null);
    assert.strictEqual(whatsapp.activeChatId, 'chat-1');
    assert.strictEqual(el.scrollTop, 1000, 'bottom');
  });

  test('opening an unread chat loads around the read marker with limit 100 and puts the marker near the top', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [
        {
          messages: [msg('m-1', 100), msg('m-2', 200), msg('m-3', 300)],
          hasMoreOlder: true,
          hasMoreNewer: true,
        },
      ],
    });
    whatsapp.unread.set('chat-1', { unreadCount: 4, lastReadMessageId: 'm-2' });
    controller.whatsapp = whatsapp;
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 3000,
      clientHeight: 400,
    });
    el.rows = [{ id: 'm-2', top: 500 }];

    await controller.selectChat('chat-1');
    await settled();

    assert.deepEqual(whatsapp.calls[0].opts, { around: 'm-2', limit: 100 });
    assert.strictEqual(controller.unreadMarkerId, 'm-2');
    const state = controller.threads.get('chat-1');
    assert.true(state.hasMore);
    assert.true(state.hasMoreNewer);
    assert.strictEqual(state.oldestId, 'm-1');
    assert.strictEqual(state.newestId, 'm-3');
    assert.strictEqual(el.scrollTop, 476, 'marker 24px from the top');

    controller.teardown();
    assert.strictEqual(whatsapp.activeChatId, null, 'teardown clears it');
  });

  test('an unread chat whose marker no longer exists falls back to the latest page', async function (assert) {
    const controller = makeController(this);
    let toasted = false;
    controller.notifications = { error: () => (toasted = true) };
    const whatsapp = fakeWhatsappService({
      pages: [httpError(400), { messages: [msg('m-9', 900)], hasMore: false }],
    });
    whatsapp.unread.set('chat-1', { unreadCount: 2, lastReadMessageId: 'm-x' });
    controller.whatsapp = whatsapp;

    await controller.selectChat('chat-1');

    assert.deepEqual(
      whatsapp.calls.map((c) => c.opts),
      [{ around: 'm-x', limit: 100 }, { limit: 50 }],
    );
    assert.strictEqual(controller.unreadMarkerId, null);
    assert.deepEqual(ids(controller), ['m-9']);
    assert.false(toasted);
  });

  test('each chat loads independently: switching drops the old window and reopening reloads', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [
        { messages: [msg('m-1', 100)], hasMore: false },
        { messages: [msg('x-1', 100, 'chat-2')], hasMore: false },
        { messages: [msg('m-1', 100)], hasMore: false },
      ],
    });
    controller.whatsapp = whatsapp;

    await controller.selectChat('chat-1');
    await controller.selectChat('chat-2');
    assert.false(controller.threads.has('chat-1'), 'old window dropped');
    assert.deepEqual(ids(controller), ['x-1']);

    await controller.selectChat('chat-1');
    assert.deepEqual(
      whatsapp.calls.map((c) => c.chatId),
      ['chat-1', 'chat-2', 'chat-1'],
    );
  });

  test('a page resolving after a switch is dropped', async function (assert) {
    const controller = makeController(this);
    controller.whatsapp = fakeWhatsappService({
      pages: [
        { messages: [msg('m-1', 100)], hasMore: false },
        { messages: [msg('x-1', 100, 'chat-2')], hasMore: false },
      ],
    });

    controller.selectChat('chat-1');
    controller.selectChat('chat-2');
    await settled();

    assert.false(controller.threads.has('chat-1'));
    assert.deepEqual(ids(controller), ['x-1']);
  });

  test('a failed window load logs, toasts, clears the thread, and selecting again retries', async function (assert) {
    const controller = makeController(this);
    const failure = new Error('down');
    const whatsapp = fakeWhatsappService({
      pages: [failure, { messages: [msg('m-1', 100)], hasMore: false }],
    });
    controller.whatsapp = whatsapp;
    let toast;
    controller.notifications = { error: (m) => (toast = m) };
    const originalError = console.error;
    let logged;
    console.error = (...args) => (logged = args);
    try {
      await controller.selectChat('chat-1');
    } finally {
      console.error = originalError;
    }

    assert.strictEqual(logged?.[1], failure);
    assert.strictEqual(toast, 'Could not load messages');
    assert.false(controller.threads.has('chat-1'));

    await controller.selectChat('chat-1');
    assert.deepEqual(ids(controller), ['m-1'], 'retried');
  });

  // ── Edge paging ──

  test('a scroll burst near the top loads before=<oldestId> once and keeps the visual position', async function (assert) {
    const controller = makeController(this);
    openThread(controller, {
      messages: [msg('m-2', 200)],
      oldestId: 'm-2',
      newestId: 'm-2',
      hasMore: true,
    });
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-1', 100)], hasMore: true }],
    });
    controller.whatsapp = whatsapp;

    // 100px per row, no anchor rows.
    const el = {
      scrollTop: 0,
      get scrollHeight() {
        return controller.currentChatMessages.length * 100;
      },
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => [],
    };
    const first = controller.onThreadScroll({ target: el });
    controller.onThreadScroll({ target: el });
    controller.onThreadScroll({
      target: { scrollTop: 300, scrollHeight: 500, clientHeight: 100 },
    });
    await first;
    await settled();

    assert.deepEqual(whatsapp.calls, [
      { chatId: 'chat-1', opts: { before: 'm-2', limit: 50 } },
    ]);
    assert.deepEqual(ids(controller), ['m-1', 'm-2']);
    assert.strictEqual(el.scrollTop, 100, 'moved by the added height');
    assert.strictEqual(controller.threads.get('chat-1').oldestId, 'm-1');
  });

  test('an empty older page keeps the cursor and sets hasMore false', async function (assert) {
    const controller = makeController(this);
    openThread(controller, { oldestId: 'm-5', newestId: 'm-5', hasMore: true });
    controller.whatsapp = fakeWhatsappService({
      pages: [{ messages: [], hasMore: true }],
    });

    await controller.loadEdgePage('chat-1', { older: true });

    const state = controller.threads.get('chat-1');
    assert.false(state.hasMore);
    assert.strictEqual(state.oldestId, 'm-5');
    assert.strictEqual(state.loading, null);
  });

  test('load older does nothing while loading, when hasMore is false, or without a thread', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService();
    controller.whatsapp = whatsapp;

    openThread(controller, {
      hasMore: true,
      oldestId: 'm-2',
      loading: 'newer',
    });
    assert.false(await controller.loadEdgePage('chat-1', { older: true }));

    openThread(controller, { hasMore: false, oldestId: 'm-2' });
    assert.false(await controller.loadEdgePage('chat-1', { older: true }));

    controller.threads = new Map();
    assert.false(await controller.loadEdgePage('chat-1', { older: true }));

    assert.strictEqual(whatsapp.calls.length, 0);
  });

  test('scrolling near the bottom loads after=<newestId> once', async function (assert) {
    const controller = makeController(this);
    openThread(controller, {
      messages: [msg('m-3', 300)],
      oldestId: 'm-3',
      newestId: 'm-3',
      hasMoreNewer: true,
    });
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-4', 400), msg('m-5', 500)], hasMore: false }],
    });
    controller.whatsapp = whatsapp;
    const el = { scrollTop: 570, scrollHeight: 1000, clientHeight: 400 };

    const first = controller.onThreadScroll({ target: el });
    controller.onThreadScroll({ target: el });
    await first;
    await settled();

    assert.deepEqual(whatsapp.calls, [
      { chatId: 'chat-1', opts: { after: 'm-3', limit: 50 } },
    ]);
    assert.deepEqual(ids(controller), ['m-3', 'm-4', 'm-5']);
    const state = controller.threads.get('chat-1');
    assert.strictEqual(state.newestId, 'm-5');
    assert.false(state.hasMoreNewer);
  });

  test('a failed newer page shows the retry row and scrolling does not retry', async function (assert) {
    const controller = makeController(this);
    openThread(controller, {
      oldestId: 'm-1',
      newestId: 'm-3',
      hasMoreNewer: true,
    });
    const whatsapp = fakeWhatsappService({ pages: [new Error('down')] });
    controller.whatsapp = whatsapp;
    const el = { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 };
    const originalError = console.error;
    console.error = () => {};
    try {
      await controller.onThreadScroll({ target: el });
      await controller.onThreadScroll({ target: el });
      await settled();
    } finally {
      console.error = originalError;
    }

    assert.strictEqual(whatsapp.calls.length, 1);
    assert.true(controller.currentChatNewerError);
    assert.false(controller.currentChatLoadingNewer);
  });

  test('a live message and a status push during an older load keep the page and clear loading', async function (assert) {
    const controller = makeController(this);
    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-5', 500))],
      oldestId: 'm-5',
      newestId: 'm-5',
      hasMore: true,
    });
    let resolvePage;
    controller.whatsapp = {
      ...fakeWhatsappService(),
      getMessages: () => new Promise((resolve) => (resolvePage = resolve)),
    };

    const load = controller.loadEdgePage('chat-1', { older: true });
    assert.true(controller.currentChatLoadingOlder);
    controller.ingestMessage(msg('m-9', 900));
    controller.applyStatus({ id: 'm-5', status: 'read', statusAt: 950 });
    resolvePage({ data: { messages: [msg('m-1', 100)], hasMore: false } });

    assert.true(await load, 'page accepted');
    assert.deepEqual(ids(controller), ['m-1', 'm-5', 'm-9']);
    assert.strictEqual(controller.currentChatMessages[1].status, 'read');
    const state = controller.threads.get('chat-1');
    assert.strictEqual(state.loading, null);
    assert.strictEqual(state.oldestId, 'm-1');
    assert.strictEqual(state.newestId, 'm-9');
  });

  // ── Window rendering ──

  test('a live message for the open chat is hidden while hasMoreNewer, shown once the window is at the newest', function (assert) {
    const controller = makeController(this);
    controller.whatsapp.chats = [
      { chatId: 'chat-1', chatName: 'Layla', lastTs: 0 },
    ];
    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-1', 100))],
      oldestId: 'm-1',
      newestId: 'm-1',
      hasMoreNewer: true,
    });

    controller.ingestMessage(msg('m-9', 900));
    assert.deepEqual(ids(controller), ['m-1'], 'not in the thread');
    assert.strictEqual(
      controller.whatsapp.chats[0].lastBody,
      'm-9',
      'preview updates',
    );

    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-1', 100))],
      newestId: 'm-1',
      hasMoreNewer: false,
    });
    controller.ingestMessage(msg('m-10', 1000));
    assert.deepEqual(ids(controller), ['m-1', 'm-10']);
    assert.strictEqual(controller.threads.get('chat-1').newestId, 'm-10');
  });

  test('a live message for a chat that is not open is never stored', function (assert) {
    const controller = makeController(this);
    openThread(controller);

    controller.ingestMessage(msg('x-1', 100, 'chat-2'));

    assert.false(controller.threads.has('chat-2'));
    assert.deepEqual(ids(controller), []);
    assert.strictEqual(
      controller.whatsapp.chats[0].chatId,
      'chat-2',
      'list updates',
    );
  });

  test('a live message racing the latest page is appended once when the page lands', async function (assert) {
    const controller = makeController(this);
    controller.whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-1', 100), msg('m-2', 200)], hasMore: false }],
    });

    const open = controller.selectChat('chat-1');
    controller.ingestMessage(msg('m-2', 200));
    controller.ingestMessage(msg('m-3', 300));
    await open;

    assert.deepEqual(ids(controller), ['m-1', 'm-2', 'm-3']);
    assert.strictEqual(controller.threads.get('chat-1').newestId, 'm-3');
  });

  test('a new message sticks to the bottom only when already near it', async function (assert) {
    const controller = makeController(this);
    openThread(controller);
    const el = threadEl(controller, {
      scrollTop: 540,
      scrollHeight: 1000,
      clientHeight: 400,
    });

    controller.ingestMessage(msg('m-1', 100));
    await settled();
    assert.strictEqual(el.scrollTop, 1000, 'near bottom sticks');

    el.scrollTop = 200;
    controller.ingestMessage(msg('m-2', 200));
    await settled();
    assert.strictEqual(el.scrollTop, 200, 'scrolled up does not jump');
  });

  test('sending while the window is behind jumps to the latest page', async function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };
    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-1', 100))],
      newestId: 'm-1',
      hasMoreNewer: true,
    });
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-8', 800), msg('m-9', 900)], hasMore: true }],
    });
    whatsapp.sendMessage = () =>
      Promise.resolve({ data: { ...msg('m-9', 900), fromMe: true } });
    whatsapp.chats = [{ chatId: 'chat-1', lastInboundAt: Date.now() }];
    controller.whatsapp = whatsapp;
    controller.messageText = 'hi';

    await controller.sendMessage();

    assert.deepEqual(whatsapp.calls[0].opts, { limit: 50 });
    assert.deepEqual(ids(controller), ['m-8', 'm-9']);
    assert.false(controller.threads.get('chat-1').hasMoreNewer);
    assert.strictEqual(
      controller.whatsapp.chats.find((c) => c.chatId === 'chat-1')?.lastBody,
      'm-9',
      'chat list reflects the sent message',
    );
  });

  // ── Read tracking ──

  test('visible inbound rows mark read only past the current marker and only from the loaded window', function (assert) {
    const controller = makeController(this);
    const marked = [];
    controller.whatsapp = {
      ...fakeWhatsappService(),
      unread: new Map([
        ['chat-1', { unreadCount: 2, lastReadMessageId: 'm-2' }],
      ]),
      markRead: (chatId, id) => marked.push([chatId, id]),
    };
    openThread(controller);
    ingestAll(controller, [
      msg('m-1', 100),
      msg('m-2', 200),
      msg('m-3', 300),
      { ...msg('m-4', 400), fromMe: true },
    ]);
    let visible = true;
    controller._isDocumentVisible = () => visible;
    const entry = (id, isIntersecting = true) => ({
      isIntersecting,
      target: { dataset: { messageId: id } },
    });

    controller._onRowsVisible([entry('m-1'), entry('m-2')]);
    assert.deepEqual(marked, [], 'nothing past the marker');

    controller._onRowsVisible([entry('m-unloaded')]);
    assert.deepEqual(marked, [], 'an unloaded id is never marked');

    controller._onRowsVisible([entry('m-3'), entry('m-4')]);
    assert.deepEqual(marked, [['chat-1', 'm-3']], 'newest inbound only');

    visible = false;
    controller._visibleReadRows.clear();
    controller._onRowsVisible([entry('m-3')]);
    assert.strictEqual(marked.length, 1, 'hidden tab marks nothing');
  });

  // ── Reconnect ──

  test('a resync reloads the open chat around the first visible row and keeps its offset', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [
        {
          messages: [msg('m-5', 500), msg('m-6', 600), msg('m-7', 700)],
          hasMoreOlder: true,
          hasMoreNewer: true,
        },
      ],
    });
    controller.whatsapp = whatsapp;
    await controller.setup();
    controller.stopClock();
    openThread(controller, {
      messages: [msg('m-5', 500), msg('m-6', 600)].map((m) =>
        controller._normalizeMessage(m),
      ),
    });
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 2000,
      clientHeight: 400,
    });
    el.rows = [
      { id: 'm-5', top: -80 },
      { id: 'm-6', top: 30 },
    ];

    whatsapp.emit('chats');
    el.rows = [{ id: 'm-6', top: 130 }];
    await settled();

    assert.deepEqual(whatsapp.calls, [
      { chatId: 'chat-1', opts: { around: 'm-6', limit: 100 } },
    ]);
    assert.deepEqual(ids(controller), ['m-5', 'm-6', 'm-7']);
    assert.true(controller.threads.get('chat-1').hasMoreNewer);
    assert.strictEqual(el.scrollTop, 100, 'anchor row back at its offset');
    controller.teardown();
  });

  test('a resync at the bottom reloads the latest page', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-9', 900)], hasMore: true }],
    });
    controller.whatsapp = whatsapp;
    await controller.setup();
    controller.stopClock();
    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-8', 800))],
    });
    const el = threadEl(controller, {
      scrollTop: 1600,
      scrollHeight: 2000,
      clientHeight: 400,
    });

    whatsapp.emit('chats');
    await settled();

    assert.deepEqual(whatsapp.calls[0].opts, { limit: 50 });
    assert.strictEqual(el.scrollTop, 2000);
    controller.teardown();
  });

  test('a resync near the bottom of a window with newer pages reloads around the first visible row', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [
        {
          messages: [msg('m-5', 500), msg('m-6', 600)],
          hasMoreOlder: true,
          hasMoreNewer: true,
        },
      ],
    });
    controller.whatsapp = whatsapp;
    await controller.setup();
    controller.stopClock();
    openThread(controller, {
      messages: [msg('m-5', 500), msg('m-6', 600)].map((m) =>
        controller._normalizeMessage(m),
      ),
      hasMoreNewer: true,
    });
    const el = threadEl(controller, {
      scrollTop: 1600,
      scrollHeight: 2000,
      clientHeight: 400,
    });
    el.rows = [{ id: 'm-5', top: 10 }];

    whatsapp.emit('chats');
    await settled();

    assert.deepEqual(
      whatsapp.calls.map((c) => c.opts),
      [{ around: 'm-5', limit: 100 }],
      'no jump to latest',
    );
    controller.teardown();
  });

  test('a resync while the restore window is loading does not reload the chat', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      chats: [{ chatId: 'chat-1' }],
      saved: {
        chatId: 'chat-1',
        anchorMessageId: 'm-5',
        anchorOffset: 40,
        atBottom: false,
      },
    });
    let resolvePage;
    whatsapp.getMessages = (chatId, opts) => {
      whatsapp.calls.push({ chatId, opts });
      return new Promise((resolve) => (resolvePage = resolve));
    };
    controller.whatsapp = whatsapp;
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 400,
    });

    const setup = controller.setup();
    await settled();
    assert.true(controller.currentChatLoadingWindow);
    whatsapp.emit('chats');
    await settled();

    assert.strictEqual(whatsapp.calls.length, 1, 'no reload');

    el.scrollHeight = 3000;
    el.rows = [{ id: 'm-5', top: 240 }];
    resolvePage({ data: { messages: [msg('m-5', 500)], hasMoreNewer: true } });
    await setup;
    await settled();

    assert.strictEqual(el.scrollTop, 200, 'restore offset kept');
    controller.stopClock();
    controller.teardown();
  });

  test('a resync with no open chat loads no messages', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService();
    controller.whatsapp = whatsapp;
    await controller.setup();
    controller.stopClock();

    whatsapp.emit('chats');
    await settled();

    assert.strictEqual(whatsapp.calls.length, 0);
    controller.teardown();
  });

  test('a send resolving after a chat switch leaves the new chat alone', async function (assert) {
    const controller = makeController(this);
    controller.connection = { status: 'connected' };
    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-1', 100))],
      newestId: 'm-1',
    });
    const whatsapp = fakeWhatsappService();
    let resolveSend;
    whatsapp.sendMessage = () => new Promise((r) => (resolveSend = r));
    whatsapp.chats = [{ chatId: 'chat-1', lastInboundAt: Date.now() }];
    controller.whatsapp = whatsapp;
    controller.messageText = 'hi';

    const send = controller.sendMessage();
    openThread(
      controller,
      {
        messages: [controller._normalizeMessage(msg('x-1', 100, 'chat-2'))],
        newestId: 'x-1',
        hasMoreNewer: true,
      },
      'chat-2',
    );
    resolveSend({ data: { ...msg('m-9', 900), fromMe: true } });
    await send;
    await settled();

    assert.strictEqual(whatsapp.calls.length, 0, 'no reload');
    assert.deepEqual(ids(controller), ['x-1']);
    assert.false(controller.threads.has('chat-1'));
    assert.false(controller.isSending);
  });

  test('a resync skipped during the restore load reloads once that load lands', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      chats: [{ chatId: 'chat-1' }],
      saved: {
        chatId: 'chat-1',
        anchorMessageId: 'm-5',
        anchorOffset: 40,
        atBottom: false,
      },
    });
    const resolvers = [];
    whatsapp.getMessages = (chatId, opts) => {
      whatsapp.calls.push({ chatId, opts });
      return new Promise((resolve) => resolvers.push(resolve));
    };
    controller.whatsapp = whatsapp;
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 3000,
      clientHeight: 400,
    });
    el.rows = [{ id: 'm-5', top: 240 }];

    const setup = controller.setup();
    await settled();
    whatsapp.emit('chats');
    await settled();
    assert.strictEqual(whatsapp.calls.length, 1, 'skipped while loading');

    resolvers[0]({
      data: {
        messages: [msg('m-5', 500), msg('m-6', 600)],
        hasMoreNewer: true,
      },
    });
    await setup;
    await settled();
    assert.deepEqual(
      whatsapp.calls.map((c) => c.opts),
      [
        { around: 'm-5', limit: 100 },
        { around: 'm-5', limit: 100 },
      ],
      'owed reload around the first visible row',
    );

    resolvers[1]({
      data: {
        messages: [msg('m-5', 500), msg('m-6', 600), msg('m-7', 700)],
        hasMoreNewer: false,
      },
    });
    await settled();
    assert.deepEqual(ids(controller), ['m-5', 'm-6', 'm-7']);
    assert.strictEqual(whatsapp.calls.length, 2, 'paid once');
    controller.stopClock();
    controller.teardown();
  });

  test('an owed reload is dropped on chat switch and teardown', async function (assert) {
    const controller = makeController(this);
    openThread(controller, { loading: 'window' });
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('x-1', 100, 'chat-2')], hasMore: false }],
    });
    controller.whatsapp = whatsapp;

    await controller.applyResyncChats();
    assert.strictEqual(controller._owedReloadChatId, 'chat-1');

    await controller.selectChat('chat-2');
    await settled();
    assert.strictEqual(controller._owedReloadChatId, null);
    assert.deepEqual(
      whatsapp.calls.map((c) => c.chatId),
      ['chat-2'],
    );

    controller._owedReloadChatId = 'chat-2';
    controller.teardown();
    assert.strictEqual(controller._owedReloadChatId, null);
  });

  test('a failed reconnect reload keeps the window, shows retry, and does not toast', async function (assert) {
    const controller = makeController(this);
    let toasted = false;
    controller.notifications = { error: () => (toasted = true) };
    openThread(controller, {
      messages: [msg('m-5', 500), msg('m-6', 600)].map((m) =>
        controller._normalizeMessage(m),
      ),
      oldestId: 'm-5',
      newestId: 'm-6',
    });
    const whatsapp = fakeWhatsappService();
    let rejectPage;
    whatsapp.getMessages = (chatId, opts) => {
      whatsapp.calls.push({ chatId, opts });
      return new Promise((_, reject) => (rejectPage = reject));
    };
    controller.whatsapp = whatsapp;
    threadEl(controller, {
      scrollTop: 1600,
      scrollHeight: 2000,
      clientHeight: 400,
    });
    const originalError = console.error;
    console.error = () => {};
    try {
      const reload = controller.applyResyncChats();
      controller.ingestMessage(msg('m-7', 700));
      rejectPage(new Error('down'));
      await reload;
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(ids(controller), ['m-5', 'm-6', 'm-7'], 'window kept');
    assert.true(controller.currentChatWindowError);
    assert.false(controller.currentChatLoadingWindow);
    assert.false(toasted);

    whatsapp.getMessages = (chatId, opts) => {
      whatsapp.calls.push({ chatId, opts });
      return Promise.resolve({
        data: { messages: [msg('m-7', 700), msg('m-8', 800)], hasMore: true },
      });
    };
    await controller.retryReload();
    await settled();

    assert.deepEqual(whatsapp.calls.at(-1).opts, { limit: 50 });
    assert.deepEqual(ids(controller), ['m-7', 'm-8']);
    assert.false(controller.currentChatWindowError);
  });

  test('edits, deletes and status pushes for messages outside the window are ignored', function (assert) {
    const controller = makeController(this);
    controller.whatsapp.chats = [
      { chatId: 'chat-1', lastBody: 'm-5', lastTs: 500000 },
    ];
    openThread(controller, {
      messages: [controller._normalizeMessage(msg('m-5', 500))],
      newestId: 'm-5',
    });

    controller.ingestMessage({ ...msg('m-1', 100), editedAt: 950 });
    controller.ingestMessage({ ...msg('m-2', 200), deletedAt: 960 });
    controller.applyStatus({ id: 'm-3', status: 'read', statusAt: 970 });
    assert.deepEqual(ids(controller), ['m-5']);
    assert.strictEqual(controller.threads.get('chat-1').newestId, 'm-5');
    assert.strictEqual(
      controller.whatsapp.chats[0].lastBody,
      'm-5',
      'preview kept',
    );

    openThread(controller, { loading: 'window' });
    controller.ingestMessage({ ...msg('m-1', 100), editedAt: 990 });
    assert.deepEqual(controller._pendingLive, [], 'not queued either');
  });

  test('setup seeds unread with the ticket taken before the chats request', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService();
    const order = [];
    whatsapp.beginUnreadSeed = () => {
      order.push('ticket');
      return { seq: 7, since: 4 };
    };
    whatsapp.getChats = () => {
      order.push('request');
      return Promise.resolve({ data: { chats: [] } });
    };
    let used;
    whatsapp.seedUnread = (list, ticket) => (used = ticket);
    controller.whatsapp = whatsapp;

    await controller.setup();
    controller.teardown();

    assert.deepEqual(order, ['ticket', 'request']);
    assert.deepEqual(used, { seq: 7, since: 4 });
  });

  // ── Last opened chat ──

  test('selecting a chat saves it, and scrolling saves the reading anchor at most every 500ms', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-1', 100), msg('m-2', 200)], hasMore: false }],
    });
    controller.whatsapp = whatsapp;

    await controller.selectChat('chat-1');
    await settled();
    assert.deepEqual(whatsapp.saves, [
      {
        chatId: 'chat-1',
        anchorMessageId: null,
        anchorOffset: 0,
        atBottom: false,
      },
    ]);

    const el = threadEl(controller, {
      scrollTop: 200,
      scrollHeight: 2000,
      clientHeight: 400,
    });
    el.rows = [
      { id: 'm-1', top: -60 },
      { id: 'm-2', top: 20 },
    ];
    controller.onThreadScroll({ target: el });
    controller.onThreadScroll({ target: el });
    controller.onThreadScroll({ target: el });
    await settled();

    assert.strictEqual(whatsapp.saves.length, 2, 'one throttled save');
    assert.deepEqual(whatsapp.saves[1], {
      chatId: 'chat-1',
      anchorMessageId: 'm-2',
      anchorOffset: 20,
      atBottom: false,
    });

    el.scrollTop = 1600;
    controller.teardown();
    assert.deepEqual(
      whatsapp.saves[2],
      {
        chatId: 'chat-1',
        anchorMessageId: 'm-2',
        anchorOffset: 20,
        atBottom: true,
      },
      'teardown saves, never clears',
    );
  });

  test('setup reopens the saved chat around its anchor and restores the offset', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      chats: [{ chatId: 'chat-1' }],
      saved: {
        chatId: 'chat-1',
        anchorMessageId: 'm-5',
        anchorOffset: 40,
        atBottom: false,
      },
      pages: [
        {
          messages: [msg('m-4', 400), msg('m-5', 500)],
          hasMoreOlder: true,
          hasMoreNewer: true,
        },
      ],
    });
    whatsapp.unread.set('chat-1', { unreadCount: 3, lastReadMessageId: 'm-2' });
    controller.whatsapp = whatsapp;
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 3000,
      clientHeight: 400,
    });
    el.rows = [{ id: 'm-5', top: 240 }];

    await controller.setup();
    await settled();

    assert.strictEqual(controller.currentChatId, 'chat-1');
    assert.deepEqual(whatsapp.calls, [
      { chatId: 'chat-1', opts: { around: 'm-5', limit: 100 } },
    ]);
    assert.strictEqual(el.scrollTop, 200, 'anchor 40px from the top');
    assert.strictEqual(
      whatsapp.saves.length,
      0,
      'restore keeps the saved entry',
    );
    controller.teardown();
  });

  test('a saved chat left at the bottom opens the latest page at the bottom, over the unread marker', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      chats: [{ chatId: 'chat-1' }],
      saved: {
        chatId: 'chat-1',
        anchorMessageId: 'm-5',
        anchorOffset: 0,
        atBottom: true,
      },
      pages: [{ messages: [msg('m-9', 900)], hasMore: true }],
    });
    whatsapp.unread.set('chat-1', { unreadCount: 2, lastReadMessageId: 'm-2' });
    controller.whatsapp = whatsapp;
    const el = threadEl(controller, {
      scrollTop: 0,
      scrollHeight: 3000,
      clientHeight: 400,
    });

    await controller.setup();
    await settled();

    assert.deepEqual(
      whatsapp.calls.map((c) => c.opts),
      [{ limit: 50 }],
    );
    assert.strictEqual(el.scrollTop, 3000);
    controller.teardown();
  });

  test('a saved anchor that no longer exists falls back to the normal open', async function (assert) {
    const controller = makeController(this);
    let toasted = false;
    controller.notifications = { error: () => (toasted = true) };
    const whatsapp = fakeWhatsappService({
      chats: [{ chatId: 'chat-1' }],
      saved: {
        chatId: 'chat-1',
        anchorMessageId: 'm-gone',
        anchorOffset: 10,
        atBottom: false,
      },
      pages: [httpError(400), { messages: [msg('m-9', 900)], hasMore: false }],
    });
    controller.whatsapp = whatsapp;

    await controller.setup();

    assert.deepEqual(
      whatsapp.calls.map((c) => c.opts),
      [{ around: 'm-gone', limit: 100 }, { limit: 50 }],
    );
    assert.deepEqual(ids(controller), ['m-9']);
    assert.false(toasted);
    controller.teardown();
  });

  test('a saved chat missing from the chat list is not opened', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      chats: [{ chatId: 'chat-2' }],
      saved: { chatId: 'chat-1', anchorMessageId: 'm-5', atBottom: false },
    });
    controller.whatsapp = whatsapp;

    await controller.setup();

    assert.strictEqual(controller.currentChatId, null);
    assert.strictEqual(whatsapp.calls.length, 0);
    controller.teardown();
  });

  test('setup starts one clock and teardown clears it', function (assert) {
    const controller = makeController(this);
    controller.whatsapp = { off() {}, closeMediaViewer() {} };

    controller.startClock();
    const first = controller._clockTimer;
    controller.startClock();
    assert.notStrictEqual(controller._clockTimer, first, 'replaced, not doubled');
    assert.ok(controller._clockTimer);

    controller.teardown();
    assert.strictEqual(controller._clockTimer, null);
  });

  test('handleKeydown sends on Enter and lets Shift+Enter through for a newline', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
    controller.connection = { status: 'connected' };
    controller.messageText = 'hi';

    // @action getter-binds sendMessage; spy on the service call instead of replacing the bound action.
    let sendCalled = 0;
    controller.whatsapp = {
      chats: [{ chatId: 'chat-1', lastInboundAt: Date.now() }],
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

  test('canToggleAi requires both company admin and a configured AI key', function (assert) {
    const controller = makeController(this);

    controller.auth = { currentUser: { role: 'company_admin' } };
    controller.aiKeyConfigured = true;
    assert.true(controller.canToggleAi);

    controller.aiKeyConfigured = false;
    assert.false(controller.canToggleAi, 'no key configured');

    controller.aiKeyConfigured = true;
    controller.auth = { currentUser: { role: 'agent' } };
    assert.false(controller.canToggleAi, 'not a company admin');
  });

  test('aiToggleTooltip explains why the toggle is disabled, or invites the toggle', function (assert) {
    const controller = makeController(this);

    controller.auth = { currentUser: { role: 'agent' } };
    controller.aiKeyConfigured = true;
    assert.strictEqual(
      controller.aiToggleTooltip,
      'Only Company Admin can toggle AI',
    );

    controller.auth = { currentUser: { role: 'company_admin' } };
    controller.aiKeyConfigured = false;
    assert.strictEqual(controller.aiToggleTooltip, 'No AI key configured');

    controller.aiKeyConfigured = true;
    assert.strictEqual(controller.aiToggleTooltip, 'Toggle AI auto-reply');
  });

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

  test('currentChatName falls back to the raw chatId, not a Baileys-style split', function (assert) {
    const controller = makeController(this);
    controller.whatsapp.chats = [];
    controller.currentChatId = '971500000000';

    assert.strictEqual(controller.currentChatName, '971500000000');
  });

  test('setup surfaces a failure via notifications.error, not just the console', async function (assert) {
    const controller = makeController(this);

    let errorMessage;
    controller.notifications = {
      error(message) {
        errorMessage = message;
      },
    };
    controller.whatsapp = {
      on() {},
      beginUnreadSeed: () => ({ seq: 1, since: 0 }),
      getChats() {
        return Promise.reject(new Error('backend down'));
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
    controller.stopClock();

    assert.strictEqual(errorMessage, 'Could not load WhatsApp data');
  });

  test('historySyncText follows the sync state pushed over the socket', function (assert) {
    const controller = this.owner.lookup('controller:whatsapp');
    controller.connection = { status: 'connected', historySyncStatus: null };
    assert.strictEqual(controller.historySyncText, '');

    controller.applyHistorySync({ status: 'in_progress', progress: 40 });
    assert.strictEqual(
      controller.historySyncText,
      'Syncing chat history... 40%',
    );

    controller.applyHistorySync({ status: 'declined', progress: null });
    assert.strictEqual(
      controller.historySyncText,
      'Chat history sharing is turned off in the WhatsApp Business app',
    );

    controller.applyHistorySync({ status: 'complete', progress: 100 });
    assert.strictEqual(controller.historySyncText, '');
  });

  test('applyHistorySync ignores a push when there is no connection', function (assert) {
    const controller = this.owner.lookup('controller:whatsapp');
    controller.connection = null;
    controller.applyHistorySync({ status: 'in_progress', progress: 10 });
    assert.strictEqual(controller.connection, null);
  });

  test('a chat resync also refreshes the connection card', async function (assert) {
    const controller = this.owner.lookup('controller:whatsapp');
    controller.connection = {
      status: 'connected',
      historySyncStatus: 'requested',
    };
    controller.whatsapp.getConnection = async () => ({
      data: {
        status: 'connected',
        historySyncStatus: 'complete',
        historySyncProgress: 100,
      },
    });

    await controller.applyResyncChats();
    await settled();

    assert.strictEqual(controller.connection.historySyncStatus, 'complete');
    assert.strictEqual(controller.historySyncText, '');
  });

  test('a connection push refreshes the connection card', async function (assert) {
    const controller = this.owner.lookup('controller:whatsapp');
    controller.connection = { status: 'connected' };
    controller.whatsapp.getConnection = async () => ({
      data: { status: 'disconnected' },
    });

    controller._socketHandlers.connection({ status: 'disconnected' });
    await settled();

    assert.strictEqual(controller.connectionStatus, 'disconnected');
    assert.false(controller.isConnected);
  });

  test('a connection refresh never overwrites a newer push that landed first', async function (assert) {
    const controller = this.owner.lookup('controller:whatsapp');
    controller.connection = { status: 'connected', historySyncStatus: null };
    let release;
    controller.whatsapp.getConnection = () =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            data: { status: 'connected', historySyncStatus: 'requested' },
          });
      });

    const refresh = controller.applyResyncChats();
    controller.applyHistorySync({ status: 'complete', progress: 100 });
    release();
    await refresh;
    await settled();

    assert.strictEqual(controller.connection.historySyncStatus, 'complete');
  });

  test('a late pre-edit copy never puts the old text back', function (assert) {
    const controller = this.owner.lookup('controller:whatsapp');
    const edited = { id: 'm-1', body: 'TWO', editedAt: 200 };

    assert.strictEqual(
      controller._mergeExisting(edited, { id: 'm-1', body: 'ONE' }),
      null,
    );
    assert.deepEqual(
      controller._mergeExisting(edited, {
        id: 'm-1',
        body: 'THREE',
        editedAt: 300,
      }),
      { id: 'm-1', body: 'THREE', editedAt: 300 },
    );
  });

  function mediaMsg(overrides = {}) {
    return {
      id: 'm-media',
      uuid: 'row-1',
      chatId: 'chat-1',
      body: '',
      hasMedia: true,
      mediaType: 'image',
      mediaStatus: 'PENDING',
      mediaSizeBytes: null,
      fromMe: false,
      timestamp: 100,
      ...overrides,
    };
  }

  test('a caption-less media row is renderable', function (assert) {
    const controller = makeController(this);
    assert.true(controller._isRenderable(mediaMsg()));
  });

  test('a media update repaints the held message with every media field', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.whatsapp = fakeWhatsappService();
    controller.ingestMessage(mediaMsg());

    controller.ingestMessageUpdate(
      mediaMsg({
        mediaStatus: 'STORED',
        mediaSizeBytes: 2048,
        mediaMime: 'image/jpeg',
        mediaFileName: 'photo.jpg',
        mediaStoredAt: '2026-09-25T10:00:00.000Z',
      }),
    );
    let held = controller.currentChatMessages[0];
    assert.strictEqual(controller.currentChatMessages.length, 1);
    assert.strictEqual(held.mediaStatus, 'STORED');
    assert.strictEqual(held.mediaSizeBytes, 2048);
    assert.strictEqual(held.mediaMime, 'image/jpeg');
    assert.strictEqual(held.mediaFileName, 'photo.jpg');
    assert.strictEqual(held.mediaStoredAt, '2026-09-25T10:00:00.000Z');

    controller.ingestMessageUpdate(
      mediaMsg({
        mediaStatus: 'DELETED',
        mediaDeletedAt: '2026-09-25T11:00:00.000Z',
        mediaDeletedBy: 'user-1',
      }),
    );
    held = controller.currentChatMessages[0];
    assert.strictEqual(held.mediaStatus, 'DELETED');
    assert.strictEqual(held.mediaDeletedAt, '2026-09-25T11:00:00.000Z');
    assert.strictEqual(held.mediaDeletedBy, 'user-1');
  });

  test('an update for a message outside the window is dropped, never appended or prepended', function (assert) {
    const controller = makeController(this);
    controller.whatsapp = fakeWhatsappService();
    openThread(controller, {
      messages: [controller._normalizeMessage(mediaMsg({ id: 'm-5' }))],
      newestId: 'm-5',
    });
    const before = controller.threads;

    controller.ingestMessageUpdate(
      mediaMsg({ id: 'm-1', mediaStatus: 'STORED' }),
    );
    controller.ingestMessageUpdate({ ...msg('m-2', 200), editedAt: 950 });
    controller.ingestMessageUpdate(mediaMsg({ id: 'm-3', chatId: 'chat-2' }));

    assert.deepEqual(ids(controller), ['m-5']);
    assert.strictEqual(controller.threads, before, 'thread untouched');
    assert.deepEqual(controller._pendingLive, [], 'nothing parked');
  });

  test('a first delivery with stored media is appended as new', function (assert) {
    const controller = makeController(this);
    openThread(controller);
    controller.whatsapp = fakeWhatsappService();

    controller.ingestMessage(mediaMsg({ id: 'm-4', mediaStatus: 'STORED' }));

    assert.deepEqual(ids(controller), ['m-4']);
  });

  test('an update for a message parked during a load merges into the parked copy', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService({
      pages: [{ messages: [msg('m-1', 100)], hasMore: false }],
    });
    controller.whatsapp = whatsapp;
    openThread(controller);
    const load = controller.loadWindow('chat-1');

    controller.ingestMessage(mediaMsg({ id: 'm-2', timestamp: 200 }));
    assert.strictEqual(controller._pendingLive.length, 1, 'parked');

    controller.ingestMessageUpdate(
      mediaMsg({
        id: 'm-2',
        timestamp: 200,
        mediaStatus: 'STORED',
        mediaSizeBytes: 10,
      }),
    );
    assert.strictEqual(controller._pendingLive.length, 1, 'not added twice');
    assert.strictEqual(controller._pendingLive[0].mediaStatus, 'STORED');

    await load;
    assert.deepEqual(ids(controller), ['m-1', 'm-2']);
    assert.strictEqual(controller.currentChatMessages[1].mediaStatus, 'STORED');
    assert.strictEqual(controller.currentChatMessages[1].mediaSizeBytes, 10);
  });

  test("an update refreshes the sidebar preview only when it is the chat's last message", function (assert) {
    const controller = makeController(this);
    controller.whatsapp = fakeWhatsappService();
    openThread(controller);
    controller.ingestMessage(msg('m-1', 100));
    controller.ingestMessage(msg('m-2', 200));
    assert.strictEqual(controller.whatsapp.chats[0].lastBody, 'm-2');

    controller.ingestMessageUpdate({
      ...msg('m-1', 100),
      body: 'edited old',
      editedAt: 300,
    });
    assert.strictEqual(
      controller.whatsapp.chats[0].lastBody,
      'm-2',
      'older edit leaves it',
    );
    assert.strictEqual(controller.currentChatMessages[0].body, 'edited old');

    controller.ingestMessageUpdate({
      ...msg('m-2', 200),
      body: 'edited last',
      editedAt: 310,
    });
    assert.strictEqual(controller.whatsapp.chats[0].lastBody, 'edited last');
    assert.strictEqual(controller.currentChatMessages[1].body, 'edited last');

    controller.ingestMessageUpdate({
      ...msg('m-2', 200),
      body: '',
      deletedAt: 320,
    });
    assert.strictEqual(
      controller.whatsapp.chats[0].lastBody,
      'This message was deleted',
    );
    assert.strictEqual(controller.whatsapp.chats.length, 1, 'no chat added');
  });

  test("an update for another chat refreshes only that chat's preview", function (assert) {
    const controller = makeController(this);
    controller.whatsapp = fakeWhatsappService();
    controller.whatsapp.chats = [
      { chatId: 'chat-2', chatName: 'Omar', lastBody: 'old', lastTs: 500000 },
    ];
    openThread(controller);

    controller.ingestMessageUpdate({
      ...msg('x-1', 500, 'chat-2'),
      body: 'new',
    });

    assert.strictEqual(controller.whatsapp.chats[0].lastBody, 'new');
    assert.deepEqual(ids(controller), [], 'open chat untouched');
  });

  test('teardown closes the media viewer and resets the delete-media modal', async function (assert) {
    const controller = makeController(this);
    const whatsapp = fakeWhatsappService();
    controller.whatsapp = whatsapp;
    await controller.setup();
    whatsapp.viewerMessage = mediaMsg();
    controller.openDeleteMedia(mediaMsg({ mediaStatus: 'STORED' }));
    controller.setMediaDeleteReason('Wrong chat');
    controller.mediaReasonError = 'Reason is required.';

    controller.teardown();

    assert.strictEqual(whatsapp.viewerMessage, null);
    assert.strictEqual(controller.mediaToDelete, null);
    assert.strictEqual(controller.mediaDeleteReason, '');
    assert.strictEqual(controller.mediaReasonError, '');
  });

  test('the delete modal names the media with the shared label', function (assert) {
    const controller = makeController(this);
    controller.openDeleteMedia(mediaMsg({ mediaFileName: 'lease.pdf' }));
    assert.strictEqual(controller.mediaToDeleteLabel, 'lease.pdf');
    controller.openDeleteMedia(mediaMsg({ mediaType: 'audio' }));
    assert.strictEqual(controller.mediaToDeleteLabel, 'Voice message');
  });

  test('confirmDeleteMedia requires a reason', async function (assert) {
    const controller = makeController(this);
    let called = false;
    controller.whatsapp = {
      deleteMedia() {
        called = true;
        return Promise.resolve();
      },
    };
    controller.openDeleteMedia(mediaMsg({ mediaStatus: 'STORED' }));
    controller.setMediaDeleteReason('   ');

    await controller.confirmDeleteMedia();

    assert.false(called);
    assert.strictEqual(controller.mediaReasonError, 'Reason is required.');
    assert.ok(controller.mediaToDelete, 'modal stays open');
  });

  test('confirmDeleteMedia deletes, patches the row to DELETED, toasts and closes', async function (assert) {
    const controller = makeController(this);
    controller.whatsapp = {
      ...fakeWhatsappService(),
      deleteCalls: [],
      deleteMedia(uuid, reason) {
        this.deleteCalls.push({ uuid, reason });
        return Promise.resolve();
      },
    };
    const toasts = [];
    controller.notifications = {
      success: (m) => toasts.push(m),
      error() {},
      info() {},
    };
    openThread(controller, {
      messages: [mediaMsg({ mediaStatus: 'STORED' })],
    });

    controller.openDeleteMedia(controller.currentChatMessages[0]);
    controller.setMediaDeleteReason(' Wrong chat ');
    await controller.confirmDeleteMedia();

    assert.deepEqual(controller.whatsapp.deleteCalls, [
      { uuid: 'row-1', reason: 'Wrong chat' },
    ]);
    assert.strictEqual(
      controller.currentChatMessages[0].mediaStatus,
      'DELETED',
    );
    assert.ok(controller.currentChatMessages[0].mediaDeletedAt);
    assert.deepEqual(toasts, ['Media deleted']);
    assert.strictEqual(controller.mediaToDelete, null);
    assert.false(controller.isDeletingMedia);
  });

  test('confirmDeleteMedia surfaces the error and keeps the row stored', async function (assert) {
    const controller = makeController(this);
    controller.whatsapp = {
      ...fakeWhatsappService(),
      deleteMedia() {
        return Promise.reject(new Error('Not allowed'));
      },
    };
    const errors = [];
    controller.notifications = {
      success() {},
      error: (m) => errors.push(m),
      info() {},
    };
    openThread(controller, {
      messages: [mediaMsg({ mediaStatus: 'STORED' })],
    });

    controller.openDeleteMedia(controller.currentChatMessages[0]);
    controller.setMediaDeleteReason('Wrong chat');
    await controller.confirmDeleteMedia();

    assert.deepEqual(errors, ['Not allowed']);
    assert.strictEqual(controller.currentChatMessages[0].mediaStatus, 'STORED');
    assert.ok(controller.mediaToDelete, 'modal stays open for a retry');
    assert.false(controller.isDeletingMedia);
  });
});
