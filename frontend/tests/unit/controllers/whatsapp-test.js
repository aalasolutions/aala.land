import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

// The send path relies on ingestMessage to append the server's response, the
// same code path the whatsapp:message socket handler uses. That is what keeps
// a later socket echo of the same id from being appended twice.
module('Unit | Controller | whatsapp', function (hooks) {
  setupTest(hooks);

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:whatsapp');
    controller.notifications = { error() {}, success() {} };
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
    assert.strictEqual(controller.messages.length, 0, 'nothing ingested on failure');
    assert.false(controller.isSending, 'isSending reset');
  });

  test('composerDisabled is true with no chat selected or while sending', function (assert) {
    const controller = makeController(this);
    controller.currentChatId = null;
    assert.true(controller.composerDisabled);

    controller.currentChatId = 'chat-1';
    controller.isSending = false;
    assert.false(controller.composerDisabled);

    controller.isSending = true;
    assert.true(controller.composerDisabled);
  });

  test('handleKeydown sends on Enter and lets Shift+Enter through for a newline', async function (assert) {
    const controller = makeController(this);
    controller.currentChatId = 'chat-1';
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
    assert.strictEqual(sendCalled, 1, 'Shift+Enter does not trigger another send');
  });
});
