import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

function stubPaddle() {
  const calls = { environment: [], initialize: [] };
  return {
    calls,
    Environment: {
      set(value) {
        calls.environment.push(value);
      },
    },
    Initialize(options) {
      calls.initialize.push(options);
    },
    Checkout: { open() {}, close() {} },
  };
}

module('Unit | Service | paddle', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.paddle = stubPaddle();
    this.service = this.owner.lookup('service:paddle');
    this.service.clientToken = 'test_token';
    this.service.load = async () => this.paddle;
  });

  test('throws when no client token is configured', async function (assert) {
    this.service.clientToken = '';
    await assert.rejects(
      this.service.setup(() => {}),
      /Checkout is not configured/,
    );
    assert.strictEqual(this.paddle.calls.initialize.length, 0);
  });

  test('a second setup does not initialize again and swaps the handler', async function (assert) {
    const received = [];
    assert.true(await this.service.setup((e) => received.push(['first', e])));
    assert.false(await this.service.setup((e) => received.push(['second', e])));
    assert.strictEqual(this.paddle.calls.initialize.length, 1);

    this.paddle.calls.initialize[0].eventCallback({ name: 'checkout.loaded' });
    assert.deepEqual(received, [['second', { name: 'checkout.loaded' }]]);
  });

  test('switches to sandbox unless the environment is production', async function (assert) {
    for (const value of ['sandbox', '', undefined]) {
      const paddle = stubPaddle();
      const service = this.owner.factoryFor('service:paddle').create();
      service.clientToken = 'test_token';
      service.environment = value;
      service.load = async () => paddle;
      await service.setup(() => {});
      assert.deepEqual(paddle.calls.environment, ['sandbox'], `${value}`);
    }

    this.service.environment = 'production';
    await this.service.setup(() => {});
    assert.deepEqual(this.paddle.calls.environment, []);
  });
});
