import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import Service from '@ember/service';

class MockSessionService extends Service {
  isAuthenticated = false;
  data = { authenticated: null };
  async authenticate() {}
  async invalidate() {}
  requireAuthentication() {}
}

module('Unit | Service | auth', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:session', MockSessionService);
  });

  test('it exists', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.ok(service);
  });

  test('isAuthenticated delegates to session service', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.isAuthenticated, false);
  });

  test('token returns null when not authenticated', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.token, null);
  });

  test('currentUser returns null when not authenticated', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.currentUser, null);
  });

  test('refreshToken returns null when not authenticated', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.refreshToken, null);
  });

  test('authorizedFetch adds Authorization header', async function (assert) {
    const service = this.owner.lookup('service:auth');
    let capturedOptions = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (_url, options) => {
      capturedOptions = options;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };

    try {
      await service.authorizedFetch('/test', { method: 'GET' });
      assert.ok(capturedOptions.headers.Authorization.startsWith('Bearer'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
