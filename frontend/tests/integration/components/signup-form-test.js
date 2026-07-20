import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, fillIn, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

class MockRouterService extends Service {
  transitionTo() {}
}

const GROUPED = [
  {
    countryName: 'Saudi Arabia',
    regions: [{ code: 'makkah', name: 'Makkah', currency: 'SAR' }],
  },
];

async function fillEmailForm() {
  await fillIn('[data-test-company-name]', 'Acme Realty');
  await fillIn('[data-test-user-name]', 'Jane Doe');
  await fillIn('[data-test-email-input]', 'jane@acme.test');
  await fillIn('[data-test-password-input]', 'Password123!');
  await fillIn('[data-test-confirm-password]', 'Password123!');
  // Ui::FormDropdown: open the trigger, pick the option
  await click('[data-test-region-select] .dropdown-trigger');
  await click('[data-test-region-select] .dropdown-option');
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
    this.set('grouped', GROUPED);

    await render(
      hbs`<SignupForm @grouped={{this.grouped}} @marketerCode="MKT-TEST" />`,
    );
    await fillEmailForm();
    await click('[data-test-submit-button]');

    assert.strictEqual(payload.marketerCode, 'MKT-TEST');
    assert.strictEqual(payload.email, 'jane@acme.test');
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
    this.set('grouped', GROUPED);

    await render(hbs`<SignupForm @grouped={{this.grouped}} />`);
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
    this.set('grouped', GROUPED);

    await render(
      hbs`<SignupForm @grouped={{this.grouped}} @marketerCode="MKT-TEST" />`,
    );
    // Google signup needs company name + region only
    await fillIn('[data-test-company-name]', 'Acme Realty');
    await click('[data-test-region-select] .dropdown-trigger');
    await click('[data-test-region-select] .dropdown-option');

    assert.ok(tokenCallback, 'google button rendered with a token callback');
    await tokenCallback('fake-id-token');

    assert.strictEqual(payload.marketerCode, 'MKT-TEST');
    assert.strictEqual(payload.idToken, 'fake-id-token');
    assert.strictEqual(payload.regionCode, 'makkah');
  });
});
