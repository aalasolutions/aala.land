import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, fillIn, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

module('Integration | Component | reset-password-form', function (hooks) {
  setupRenderingTest(hooks);

  test('it shows a validation error and does not submit invalid passwords', async function (assert) {
    this.owner.register('service:auth', class extends Service {
      async resetPassword() {
        assert.step('resetPassword called');
      }
    });

    await render(hbs`<ResetPasswordForm @token="valid-token" />`);

    await fillIn('[data-test-reset-password-input]', 'password123');
    await fillIn('[data-test-reset-password-confirm-input]', 'different123');
    await click('[data-test-reset-password-submit]');

    assert.verifySteps([], 'auth.resetPassword is not called for invalid input');
    assert.dom('[data-test-reset-password-error]').exists();
    assert.dom('[data-test-reset-password-error]').hasText('Passwords do not match.');
  });

  test('it submits successfully and shows the success state', async function (assert) {
    this.owner.register('service:auth', class extends Service {
      async resetPassword(payload) {
        assert.step('resetPassword called');
        assert.deepEqual(payload, {
          token: 'valid-token',
          newPassword: 'password123',
        });

        return { success: true };
      }
    });

    await render(hbs`<ResetPasswordForm @token="  valid-token  " />`);

    await fillIn('[data-test-reset-password-input]', 'password123');
    await fillIn('[data-test-reset-password-confirm-input]', 'password123');
    await click('[data-test-reset-password-submit]');

    assert.verifySteps(['resetPassword called']);
    assert.dom('[data-test-reset-password-success]').exists();
    assert.dom('[data-test-reset-password-form]').doesNotExist();
    assert.dom('[data-test-reset-password-error]').doesNotExist();
    assert.dom('[data-test-reset-password-login-link]').exists();
  });
});
