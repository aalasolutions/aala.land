import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

class MockRouterService extends Service {
  transitions = [];
  urlFor(name) {
    return `/${name.replace('.', '/')}`;
  }
  replaceWith(...args) {
    this.transitions.push(args);
  }
  transitionTo() {
    throw new Error('checkout must replace history, not push it');
  }
}

class MockPaddleService extends Service {
  opensItself = true;
  opened = [];
  handler = null;
  failure = null;
  async setup(onEvent) {
    if (this.failure) throw this.failure;
    this.handler = onEvent;
    return this.opensItself;
  }
  open(transactionId) {
    this.opened.push(transactionId);
  }
  teardown() {
    this.handler = null;
  }
}

module('Unit | Controller | checkout', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:paddle', MockPaddleService);
  });

  function makeController(ctx, assigns = {}) {
    const controller = ctx.owner.lookup('controller:checkout');
    Object.assign(controller, { transactionId: 'txn_1', ...assigns });
    return controller;
  }

  function transitions(ctx) {
    return ctx.owner.lookup('service:router').transitions;
  }

  test('completion goes to the same-origin success URL', async function (assert) {
    const origin = window.location.origin;
    const controller = makeController(this, {
      success: `${origin}/billing/success`,
      cancel: `${origin}/billing/cancel`,
    });
    await controller.start();
    controller.handleEvent({ name: 'checkout.completed' });
    controller.handleEvent({ name: 'checkout.closed' });
    assert.deepEqual(transitions(this), [['/billing/success']]);
  });

  test('closing without completing goes to the cancel URL', async function (assert) {
    const origin = window.location.origin;
    const controller = makeController(this, {
      success: `${origin}/billing/success`,
      cancel: `${origin}/billing/cancel?from=checkout`,
    });
    await controller.start();
    controller.handleEvent({ name: 'checkout.closed' });
    assert.deepEqual(transitions(this), [['/billing/cancel?from=checkout']]);
  });

  test('a foreign return URL falls back to the billing routes', async function (assert) {
    const controller = makeController(this, {
      success: 'https://evil.example/phish',
      cancel: '//evil.example/phish',
    });
    await controller.start();
    controller.handleEvent({ name: 'checkout.completed' });
    controller.isCompleted = false;
    controller.handleEvent({ name: 'checkout.closed' });
    assert.deepEqual(transitions(this), [
      ['/billing/success'],
      ['/billing/cancel'],
    ]);
  });

  test('other events do not navigate', async function (assert) {
    const controller = makeController(this);
    await controller.start();
    controller.handleEvent({ name: 'checkout.loaded' });
    controller.handleEvent(null);
    assert.deepEqual(transitions(this), []);
  });

  test('opens the transaction itself when Paddle was already initialized', async function (assert) {
    const paddle = this.owner.lookup('service:paddle');
    paddle.opensItself = false;
    await makeController(this).start();
    assert.deepEqual(paddle.opened, ['txn_1']);
  });

  test('leaves the first open to Paddle on a fresh initialize', async function (assert) {
    const paddle = this.owner.lookup('service:paddle');
    await makeController(this).start();
    assert.deepEqual(paddle.opened, []);
  });

  test('shows an error when the link has no transaction', async function (assert) {
    const paddle = this.owner.lookup('service:paddle');
    const controller = makeController(this, { transactionId: null });
    await controller.start();
    assert.true(controller.errorMsg.length > 0);
    assert.strictEqual(paddle.handler, null);
  });

  test('shows the setup error when Paddle cannot load', async function (assert) {
    const paddle = this.owner.lookup('service:paddle');
    paddle.failure = new Error('Failed to load the checkout library');
    const controller = makeController(this);
    await controller.start();
    assert.strictEqual(
      controller.errorMsg,
      'Failed to load the checkout library',
    );
  });
});
