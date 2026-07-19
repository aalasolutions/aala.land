import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

class MockSessionService extends Service {
  isAuthenticated = true;
  isImpersonating = false;
  data = {
    authenticated: {
      accessToken: 'test-token',
      refreshToken: null,
      user: null,
      regions: [],
      defaultRegionCode: null,
    },
  };
  async authenticate() {}
  async invalidate() {}
  requireAuthentication() {}
  impersonate() {}
  exitImpersonation() {}
}

class MockRouterService extends Service {
  transitionTo() {}
}

module('Unit | Service | auth', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:session', MockSessionService);
    this.owner.register('service:router', MockRouterService);
  });

  test('it exists', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.ok(service);
  });

  test('isAuthenticated delegates to session service', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.isAuthenticated, true);
  });

  test('token returns accessToken from session data', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.token, 'test-token');
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

  test('isImpersonating delegates to session service', function (assert) {
    const service = this.owner.lookup('service:auth');
    assert.strictEqual(service.isImpersonating, false);
  });

  test('impersonate calls POST /auth/impersonate and calls session.impersonate with response data', async function (assert) {
    const service = this.owner.lookup('service:auth');
    const session = this.owner.lookup('service:session');

    let impersonateCalled = false;
    let capturedAuthData = null;
    session.impersonate = (data) => {
      impersonateCalled = true;
      capturedAuthData = data;
    };

    const mockResponse = {
      accessToken: 'imp-token',
      refreshToken: 'imp-refresh',
      user: {
        id: 'u1',
        name: 'Jane',
        email: 'jane@co.com',
        role: 'agent',
        companyId: 'c1',
      },
      regions: [],
      defaultRegionCode: 'dubai',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockResponse }),
      });

    try {
      await service.impersonate('user-uuid-1');
      assert.true(impersonateCalled, 'session.impersonate was called');
      assert.deepEqual(
        capturedAuthData,
        mockResponse,
        'session.impersonate received response data',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('exitImpersonation calls session.exitImpersonation', async function (assert) {
    const service = this.owner.lookup('service:auth');
    const session = this.owner.lookup('service:session');

    let exitCalled = false;
    session.exitImpersonation = () => {
      exitCalled = true;
    };

    await service.exitImpersonation();
    assert.true(exitCalled, 'session.exitImpersonation was called');
  });

  test('fetchJson 423 toasts the lock message and refreshes lock state', async function (assert) {
    let toasted = null;
    this.owner.register(
      'service:notifications',
      class extends Service {
        error(message) {
          toasted = message;
        }
      },
    );
    const service = this.owner.lookup('service:auth');

    let refreshed = 0;
    service.refreshLockState = async () => {
      refreshed++;
    };
    service.authorizedFetch = async () =>
      new Response(
        JSON.stringify({
          message: 'You are over your limits. Reduce or pay to continue.',
          code: 'COMPANY_LOCKED',
        }),
        { status: 423, headers: { 'Content-Type': 'application/json' } },
      );

    await assert.rejects(
      service.fetchJson('/contacts', { method: 'POST', body: '{}' }),
      /over your limits/,
      'the lock message is thrown to the caller',
    );
    assert.strictEqual(
      toasted,
      'You are over your limits. Reduce or pay to continue.',
      'the lock message is toasted',
    );
    assert.strictEqual(refreshed, 1, 'lock state refresh triggered');
  });

  test('fetchJson non-423 errors do not touch lock state', async function (assert) {
    let toasted = 0;
    this.owner.register(
      'service:notifications',
      class extends Service {
        error() {
          toasted++;
        }
      },
    );
    const service = this.owner.lookup('service:auth');
    let refreshed = 0;
    service.refreshLockState = async () => {
      refreshed++;
    };
    service.authorizedFetch = async () =>
      new Response(JSON.stringify({ message: 'nope' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(service.fetchJson('/contacts', { method: 'POST' }));
    assert.strictEqual(toasted, 0, 'no auto-toast for ordinary errors');
    assert.strictEqual(refreshed, 0, 'no lock refresh for ordinary errors');
  });
});
