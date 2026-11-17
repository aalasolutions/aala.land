import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

module('Unit | Route | onboarding', function (hooks) {
  setupTest(hooks);

  function setup(owner, session) {
    const calls = [];
    owner.register(
      'service:session',
      class extends Service {
        isAuthenticated = session.isAuthenticated;
        needsOnboarding = session.needsOnboarding;
      },
    );
    owner.register(
      'service:router',
      class extends Service {
        transitionTo(routeName) {
          calls.push(routeName);
        }
      },
    );
    return calls;
  }

  test('redirects to login without a session', function (assert) {
    const calls = setup(this.owner, {
      isAuthenticated: false,
      needsOnboarding: false,
    });
    this.owner.lookup('route:onboarding').beforeModel();
    assert.deepEqual(calls, ['login']);
  });

  test('redirects to dashboard once the company has a name and region', function (assert) {
    const calls = setup(this.owner, {
      isAuthenticated: true,
      needsOnboarding: false,
    });
    this.owner.lookup('route:onboarding').beforeModel();
    assert.deepEqual(calls, ['dashboard']);
  });

  test('stays on onboarding while setup is incomplete', function (assert) {
    const calls = setup(this.owner, {
      isAuthenticated: true,
      needsOnboarding: true,
    });
    this.owner.lookup('route:onboarding').beforeModel();
    assert.deepEqual(calls, []);
  });

  module('model', function (hooks) {
    let originalFetch;

    hooks.beforeEach(function () {
      originalFetch = window.fetch;
    });

    hooks.afterEach(function () {
      window.fetch = originalFetch;
    });

    test('flags loadFailed when fetch throws', async function (assert) {
      window.fetch = async () => {
        throw new Error('network');
      };
      const model = await this.owner.lookup('route:onboarding').model();
      assert.deepEqual(model, { grouped: [], loadFailed: true });
    });

    test('flags loadFailed on a non-OK response', async function (assert) {
      window.fetch = async () => ({ ok: false, json: async () => ({}) });
      const model = await this.owner.lookup('route:onboarding').model();
      assert.deepEqual(model, { grouped: [], loadFailed: true });
    });

    test('flags loadFailed when grouped is missing', async function (assert) {
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ data: {} }),
      });
      const model = await this.owner.lookup('route:onboarding').model();
      assert.deepEqual(model, { grouped: [], loadFailed: true });
    });

    test('returns the grouped regions on success', async function (assert) {
      const grouped = [{ countryName: 'UAE', regions: [] }];
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ data: { grouped } }),
      });
      const model = await this.owner.lookup('route:onboarding').model();
      assert.deepEqual(model, { grouped, loadFailed: false });
    });
  });
});
