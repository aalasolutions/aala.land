import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

module('Unit | Service | whatsapp', function (hooks) {
  setupTest(hooks);

  test('signup calls hit the right paths and methods', async function (assert) {
    const calls = [];
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path, options) {
          calls.push({ path, options });
          return Promise.resolve({ success: true, data: null });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    await service.getSignupConfig();
    await service.connect({ code: 'c', wabaId: '1', phoneNumberId: '2' });
    await service.disconnect();

    assert.strictEqual(calls[0].path, '/whatsapp/signup-config');
    assert.strictEqual(calls[0].options, undefined);

    assert.strictEqual(calls[1].path, '/whatsapp/connect');
    assert.strictEqual(calls[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      code: 'c',
      wabaId: '1',
      phoneNumberId: '2',
    });

    assert.strictEqual(calls[2].path, '/whatsapp/connection');
    assert.strictEqual(calls[2].options.method, 'DELETE');
  });

  test('getConnection reads /whatsapp/connection', async function (assert) {
    let capturedPath;
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path) {
          capturedPath = path;
          return Promise.resolve({ success: true, data: null });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    const result = await service.getConnection();

    assert.strictEqual(capturedPath, '/whatsapp/connection');
    assert.deepEqual(result, { success: true, data: null });
  });

  test('getMessages encodes the chat id into the path', async function (assert) {
    let capturedPath;
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path) {
          capturedPath = path;
          return Promise.resolve({ success: true, data: { messages: [] } });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    await service.getMessages('971500000001@s.whatsapp.net');

    assert.strictEqual(
      capturedPath,
      '/whatsapp/messages/971500000001%40s.whatsapp.net',
    );
  });

  test('sendMessage posts chatId and body to /whatsapp/send', async function (assert) {
    let capturedPath;
    let capturedOptions;
    this.owner.register(
      'service:auth',
      class extends Service {
        token = 'test-token';
        fetchJson(path, options) {
          capturedPath = path;
          capturedOptions = options;
          return Promise.resolve({ success: true, data: { id: 'm1' } });
        }
      },
    );

    const service = this.owner.lookup('service:whatsapp');
    const result = await service.sendMessage('123@c.us', 'hello');

    assert.strictEqual(capturedPath, '/whatsapp/send');
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.deepEqual(JSON.parse(capturedOptions.body), {
      chatId: '123@c.us',
      body: 'hello',
    });
    assert.deepEqual(result, { success: true, data: { id: 'm1' } });
  });
});
