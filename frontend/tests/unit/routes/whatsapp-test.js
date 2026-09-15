import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

class MockSessionService extends Service {
  isAuthenticated = true;
  whatsappConfigured = true;
  requireAuthentication() {}
}

class MockAuthService extends Service {
  currentUser = { role: 'agent' };
}

class MockRouterService extends Service {
  transitions = [];
  transitionTo(routeName) {
    this.transitions.push(routeName);
  }
}

class MockWhatsappService extends Service {}

module('Unit | Route | whatsapp', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:session', MockSessionService);
    this.owner.register('service:auth', MockAuthService);
    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:whatsapp', MockWhatsappService);
  });

  test('beforeModel redirects to dashboard when the role lacks WhatsApp access', async function (assert) {
    const route = this.owner.lookup('route:whatsapp');
    route.auth.currentUser = { role: 'accountant' };
    route.session.whatsappConfigured = true;

    await route.beforeModel({});

    assert.deepEqual(route.router.transitions, ['dashboard']);
  });

  test('beforeModel redirects to dashboard when the server has not configured WhatsApp', async function (assert) {
    const route = this.owner.lookup('route:whatsapp');
    route.auth.currentUser = { role: 'agent' };
    route.session.whatsappConfigured = false;

    await route.beforeModel({});

    assert.deepEqual(route.router.transitions, ['dashboard']);
  });

  test('beforeModel lets an allowed role through once the server confirms configuration', async function (assert) {
    const route = this.owner.lookup('route:whatsapp');
    route.auth.currentUser = { role: 'agent' };
    route.session.whatsappConfigured = true;

    await route.beforeModel({});

    assert.deepEqual(route.router.transitions, []);
  });
});
