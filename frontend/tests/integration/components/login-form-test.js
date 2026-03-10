import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, fillIn, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

class MockRouterService extends Service {
  transitionTo() {}
}

class MockNotificationsService extends Service {
  error() {}
}

module('Integration | Component | login-form', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:notifications', MockNotificationsService);
  });

  test('it renders email and password inputs', async function (assert) {
    this.owner.register('service:auth', class extends Service {
      async login() {}
    });

    await render(hbs`<LoginForm />`);

    assert.dom('[data-test-login-form]').exists();
    assert.dom('[data-test-email-input]').exists();
    assert.dom('[data-test-password-input]').exists();
    assert.dom('[data-test-submit-button]').exists();
  });

  test('no error message shown initially', async function (assert) {
    this.owner.register('service:auth', class extends Service {
      async login() {}
    });

    await render(hbs`<LoginForm />`);
    assert.dom('[data-test-error-message]').doesNotExist();
  });

  test('shows error message on failed login', async function (assert) {
    this.owner.register('service:auth', class extends Service {
      async login() {
        throw new Error('Invalid credentials');
      }
    });

    await render(hbs`<LoginForm />`);
    await fillIn('[data-test-email-input]', 'wrong@test.com');
    await fillIn('[data-test-password-input]', 'wrongpass');
    await click('[data-test-submit-button]');

    assert.dom('[data-test-error-message]').exists();
    assert.dom('[data-test-error-message]').hasText('Invalid credentials');
  });
});
