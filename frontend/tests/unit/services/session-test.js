import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import Service from '@ember/service';

class MockRegionService extends Service {
  initialize() {}
  clear() {}
}

module('Unit | Service | session', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:region', MockRegionService);
    localStorage.removeItem('aala-session');
    localStorage.removeItem('aala-impersonator-session');
  });

  hooks.afterEach(function () {
    localStorage.removeItem('aala-session');
    localStorage.removeItem('aala-impersonator-session');
  });

  test('isImpersonating returns false when no impersonator session exists', function (assert) {
    const service = this.owner.lookup('service:session');
    service.isAuthenticated = true;
    assert.strictEqual(service.isImpersonating, false);
  });

  test('isImpersonating returns true when impersonator session exists and authenticated', function (assert) {
    const service = this.owner.lookup('service:session');
    service.isAuthenticated = true;
    localStorage.setItem('aala-impersonator-session', JSON.stringify({ data: { authenticated: {} }, isAuthenticated: true }));
    assert.strictEqual(service.isImpersonating, true);
  });

  test('isImpersonating returns false when impersonator session exists but not authenticated', function (assert) {
    const service = this.owner.lookup('service:session');
    service.isAuthenticated = false;
    localStorage.setItem('aala-impersonator-session', JSON.stringify({ data: { authenticated: {} }, isAuthenticated: true }));
    assert.strictEqual(service.isImpersonating, false);
  });

  test('impersonate saves current session to impersonator slot and establishes new session', function (assert) {
    const service = this.owner.lookup('service:session');
    const originalSession = JSON.stringify({
      data: { authenticated: { user: { name: 'Admin' }, accessToken: 'admin-token', refreshToken: 'admin-refresh', regions: [], defaultRegionCode: null } },
      isAuthenticated: true,
    });
    localStorage.setItem('aala-session', originalSession);

    const newAuthData = {
      user: { name: 'Jane Agent', email: 'jane@co.com' },
      accessToken: 'agent-token',
      refreshToken: 'agent-refresh',
      regions: [],
      defaultRegionCode: null,
    };

    service.impersonate(newAuthData);

    assert.strictEqual(localStorage.getItem('aala-impersonator-session'), originalSession, 'original session saved to impersonator slot');
    assert.strictEqual(service.data.authenticated.accessToken, 'agent-token', 'active session updated to impersonated user');
    assert.true(service.isAuthenticated);
  });

  test('exitImpersonation restores admin session and clears impersonator slot', function (assert) {
    const service = this.owner.lookup('service:session');
    const adminAuthData = {
      user: { name: 'Super Admin', email: 'super@admin.com' },
      accessToken: 'admin-token',
      refreshToken: 'admin-refresh',
      regions: [],
      defaultRegionCode: null,
    };
    const savedAdminSession = JSON.stringify({
      data: { authenticated: adminAuthData },
      isAuthenticated: true,
    });
    localStorage.setItem('aala-impersonator-session', savedAdminSession);
    service.isAuthenticated = true;

    service.exitImpersonation();

    assert.strictEqual(service.data.authenticated.accessToken, 'admin-token', 'admin token restored');
    assert.strictEqual(localStorage.getItem('aala-impersonator-session'), null, 'impersonator slot cleared');
  });

  test('invalidate clears both session slots', async function (assert) {
    const service = this.owner.lookup('service:session');
    localStorage.setItem('aala-session', 'something');
    localStorage.setItem('aala-impersonator-session', 'something-else');

    service.isAuthenticated = true;
    service.data.authenticated.refreshToken = null;

    await service.invalidate();

    assert.strictEqual(localStorage.getItem('aala-session'), null);
    assert.strictEqual(localStorage.getItem('aala-impersonator-session'), null);
  });
});
