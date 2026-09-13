import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

// The sidebar link carries one data-tooltip attribute for two jobs: the
// collapsed-rail label it always had, and the new disabled explanation.
// Disabled has to win outright regardless of collapse state.
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
    // Pin desktop-collapse to the setting under test rather than the real
    // matchMedia breakpoint, which depends on the test runner's viewport.
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
});
