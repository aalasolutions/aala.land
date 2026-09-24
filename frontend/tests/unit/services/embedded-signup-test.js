import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const META_ORIGIN = 'https://www.facebook.com';

function metaMessage(payload) {
  return new MessageEvent('message', {
    origin: META_ORIGIN,
    data: JSON.stringify(payload),
  });
}

module('Unit | Service | embedded-signup', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.originalFB = window.FB;
    this.service = this.owner.lookup('service:embedded-signup');
    this.service.loadSdk = async () => {};
    this.stubLogin = (message, code = 'test-code') => {
      window.FB = {
        login(callback) {
          callback({ authResponse: { code } });
          window.dispatchEvent(metaMessage(message));
        },
      };
    };
  });

  hooks.afterEach(function () {
    window.FB = this.originalFB;
  });

  test('resolves on the Coexistence finish event sent top-level', async function (assert) {
    this.stubLogin({
      data: {
        phone_number_id: '100000000000001',
        waba_id: '200000000000002',
        page_ids: [],
        catalog_ids: [],
        dataset_ids: [],
        business_id: '300000000000003',
        instagram_account_ids: [],
      },
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    });

    const result = await this.service.launch({
      appId: 'app',
      configId: 'config',
      graphVersion: 'v23.0',
    });

    assert.deepEqual(result, {
      code: 'test-code',
      wabaId: '200000000000002',
      phoneNumberId: '100000000000001',
    });
  });

  test('rejects as cancelled on a top-level CANCEL event', async function (assert) {
    this.stubLogin({
      data: { current_step: 'PHONE_NUMBER_SETUP' },
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'CANCEL',
    });

    try {
      await this.service.launch({
        appId: 'app',
        configId: 'config',
        graphVersion: 'v23.0',
      });
      assert.ok(false, 'launch should reject');
    } catch (error) {
      assert.true(error.cancelled);
      assert.true(error.message.includes('PHONE_NUMBER_SETUP'));
    }
  });

  test('rejects with the Meta message on a top-level ERROR event', async function (assert) {
    this.stubLogin({
      data: { error_message: 'Number already registered' },
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'ERROR',
    });

    try {
      await this.service.launch({
        appId: 'app',
        configId: 'config',
        graphVersion: 'v23.0',
      });
      assert.ok(false, 'launch should reject');
    } catch (error) {
      assert.strictEqual(error.message, 'Number already registered');
    }
  });
});
