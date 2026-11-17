import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, fillIn, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

class MockRouterService extends Service {
  transitionTo() {}
}

async function fillEmailForm() {
  await fillIn('[data-test-user-name]', 'Jane Doe');
  await fillIn('[data-test-email-input]', 'jane@acme.test');
  await fillIn('[data-test-password-input]', 'Password123!');
  await fillIn('[data-test-confirm-password]', 'Password123!');
}

module('Integration | Component | signup-form', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:router', MockRouterService);
    this.owner.register(
      'service:google-auth',
      class extends Service {
        isConfigured = false;
        renderButton() {}
      },
    );
  });

  test('email signup payload includes marketerCode when present', async function (assert) {
    let payload = null;
    this.owner.register(
      'service:auth',
      class extends Service {
        async register(data) {
          payload = data;
        }
      },
    );
    await render(hbs`<SignupForm @marketerCode="MKT-TEST" />`);
    await fillEmailForm();
    await click('[data-test-submit-button]');

    assert.strictEqual(payload.marketerCode, 'MKT-TEST');
    assert.strictEqual(payload.email, 'jane@acme.test');
    assert.deepEqual(
      Object.keys(payload).sort(),
      ['email', 'marketerCode', 'password', 'userName'],
      'no company or region fields',
    );
  });

  test('asks only for name, email and password', async function (assert) {
    this.owner.register('service:auth', class extends Service {});
    await render(hbs`<SignupForm />`);

    assert.dom('[data-test-company-name]').doesNotExist();
    assert.dom('[data-test-company-slug]').doesNotExist();
    assert.dom('[data-test-region-select]').doesNotExist();
    assert.dom('[data-test-user-name]').exists();
    assert.dom('[data-test-email-input]').exists();
    assert.dom('[data-test-password-input]').exists();
  });

  test('email signup payload omits marketerCode when absent', async function (assert) {
    let payload = null;
    this.owner.register(
      'service:auth',
      class extends Service {
        async register(data) {
          payload = data;
        }
      },
    );
    await render(hbs`<SignupForm />`);
    await fillEmailForm();
    await click('[data-test-submit-button]');

    assert.strictEqual(payload.marketerCode, undefined);
    assert.notOk(
      Object.keys(JSON.parse(JSON.stringify(payload))).includes('marketerCode'),
      'undefined drops from the JSON body',
    );
  });

  test('google signup payload includes marketerCode when present', async function (assert) {
    let payload = null;
    this.owner.register(
      'service:auth',
      class extends Service {
        async signupWithGoogle(data) {
          payload = data;
        }
      },
    );
    // Configured google-auth that hands us the token callback
    let tokenCallback = null;
    this.owner.register(
      'service:google-auth',
      class extends Service {
        isConfigured = true;
        async renderButton(_el, cb) {
          tokenCallback = cb;
        }
      },
    );
    await render(hbs`<SignupForm @marketerCode="MKT-TEST" />`);
    // The Google button renders without any other field filled in.
    assert.ok(tokenCallback, 'google button rendered with a token callback');
    await tokenCallback('fake-id-token');

    assert.strictEqual(payload.marketerCode, 'MKT-TEST');
    assert.deepEqual(payload, {
      idToken: 'fake-id-token',
      marketerCode: 'MKT-TEST',
    });
  });
});
