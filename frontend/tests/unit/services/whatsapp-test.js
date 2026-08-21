import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

module('Unit | Service | whatsapp', function (hooks) {
  setupTest(hooks);

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
