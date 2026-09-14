import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

class MockSessionService extends Service {
  isAuthenticated = false;
  whatsappConfigured = false;
}

class MockRouterService extends Service {
  currentRouteName = null;
  on() {}
  off() {}
  transitionTo() {}
}

module('Unit | Controller | application', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:session', MockSessionService);
    this.owner.register('service:router', MockRouterService);
  });

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:application');
    // Pins isNarrow directly instead of relying on matchMedia, which depends on the test viewport.
    controller.isNarrow = false;
    return controller;
  }

  test('whatsappDisabled tracks session.whatsappConfigured only', function (assert) {
    const controller = makeController(this);

    controller.session.whatsappConfigured = false;
    assert.true(controller.whatsappDisabled);

    controller.session.whatsappConfigured = true;
    assert.false(controller.whatsappDisabled);
  });

  test('whatsappTooltip carries the ruling message when disabled, collapsed or not', function (assert) {
    const controller = makeController(this);
    controller.session.whatsappConfigured = false;

    controller.uiSettings.sidebarCollapsed = false;
    assert.strictEqual(
      controller.whatsappTooltip,
      'WhatsApp is not configured. Check system variables or contact your admin.',
    );

    controller.uiSettings.sidebarCollapsed = true;
    assert.strictEqual(
      controller.whatsappTooltip,
      'WhatsApp is not configured. Check system variables or contact your admin.',
      'disabled message wins even collapsed',
    );
  });

  test('whatsappTooltip falls back to the collapsed-rail label once configured', function (assert) {
    const controller = makeController(this);
    controller.session.whatsappConfigured = true;

    controller.uiSettings.sidebarCollapsed = true;
    assert.strictEqual(controller.whatsappTooltip, 'WhatsApp');

    controller.uiSettings.sidebarCollapsed = false;
    assert.strictEqual(controller.whatsappTooltip, null);
  });

  module('whatsapp socket', function (nested) {
    nested.beforeEach(function () {
      this.owner.register(
        'service:whatsapp',
        class extends Service {
          connects = 0;
          disconnects = 0;
          totalUnread = 0;
          connectSocket() {
            this.connects++;
          }
          disconnectSocket() {
            this.disconnects++;
          }
        },
      );
      this.owner.register(
        'service:socket',
        class extends Service {
          socket = null;
          setup() {}
          on() {}
          off() {}
          disconnect() {}
        },
      );
      this.owner.register(
        'service:auth',
        class extends Service {
          currentUser = { role: 'agent' };
          logout() {
            return Promise.resolve();
          }
        },
      );
    });

    function makeGated(ctx) {
      const controller = makeController(ctx);
      controller.session.isAuthenticated = true;
      controller.session.whatsappConfigured = true;
      controller.whatsapp.connects = 0;
      controller.whatsapp.disconnects = 0;
      return controller;
    }

    test('connects on route change only when authenticated, configured and role allowed', function (assert) {
      const controller = makeGated(this);

      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 1);
      assert.strictEqual(controller.whatsapp.disconnects, 0);
    });

    test('disconnects when any one gate fails', function (assert) {
      const controller = makeGated(this);

      controller.session.whatsappConfigured = false;
      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 0, 'not configured');

      controller.session.whatsappConfigured = true;
      controller.auth.currentUser = { role: 'super_admin' };
      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 0, 'role denied');

      controller.auth.currentUser = { role: 'agent' };
      controller.session.isAuthenticated = false;
      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 0, 'signed out');
      assert.true(controller.whatsapp.disconnects >= 3);
    });

    test('the constructor applies the same gate', function (assert) {
      this.owner.lookup('service:session').isAuthenticated = true;
      this.owner.lookup('service:session').whatsappConfigured = true;

      const controller = makeController(this);
      assert.strictEqual(controller.whatsapp.connects, 1);
    });

    test('whatsappUnreadCount reads the service total', function (assert) {
      const controller = makeController(this);
      controller.whatsapp.totalUnread = 7;
      assert.strictEqual(controller.whatsappUnreadCount, 7);
    });

    test('confirmLogout disconnects the whatsapp socket', async function (assert) {
      const controller = makeGated(this);

      await controller.confirmLogout();
      assert.true(controller.whatsapp.disconnects >= 1);
    });
  });
});
