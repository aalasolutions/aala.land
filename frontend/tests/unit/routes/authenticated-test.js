import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

module('Unit | Route | authenticated', function (hooks) {
  setupTest(hooks);

  function setup(owner, session) {
    const calls = [];
    owner.register(
      'service:session',
      class extends Service {
        isAuthenticated = session.isAuthenticated;
        needsOnboarding = session.needsOnboarding;
        requireAuthentication(_transition, routeName) {
          calls.push(routeName);
        }
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

  test('sends an unauthenticated visitor to login', function (assert) {
    const calls = setup(this.owner, {
      isAuthenticated: false,
      needsOnboarding: false,
    });
    this.owner.lookup('route:authenticated').beforeModel({});
    assert.deepEqual(calls, ['login']);
  });

  test('sends a company that needs onboarding to onboarding', function (assert) {
    const calls = setup(this.owner, {
      isAuthenticated: true,
      needsOnboarding: true,
    });
    this.owner.lookup('route:authenticated').beforeModel({});
    assert.deepEqual(calls, ['onboarding']);
  });

  test('lets an onboarded company through', function (assert) {
    const calls = setup(this.owner, {
      isAuthenticated: true,
      needsOnboarding: false,
    });
    this.owner.lookup('route:authenticated').beforeModel({});
    assert.deepEqual(calls, []);
  });
});
