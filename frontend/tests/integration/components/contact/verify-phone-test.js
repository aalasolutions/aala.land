import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click, fillIn } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { httpError, stubAuth } from 'land/tests/helpers/stub-auth';

// A miss must reveal nothing about the stored number; only the fixed message is shown.
module('Integration | Component | contact/verify-phone', function (hooks) {
  setupRenderingTest(hooks);

  async function submit(ctx, respond) {
    ctx.calls = stubAuth(ctx.owner, { respond });
    ctx.onVerified = (contact) => (ctx.verifiedWith = contact);
    await render(
      hbs`<Contact::VerifyPhone @contactId="c-1" @onVerified={{this.onVerified}} />`,
    );
    await fillIn('[data-test-verify-phone-input]', ' 0501234567 ');
    await click('[data-test-verify-phone-submit]');
  }

  test('a match posts the trimmed number and hands back the new view', async function (assert) {
    const full = { id: 'c-1', accessLevel: 'FULL' };
    await submit(this, () => ({ data: { verified: true, contact: full } }));

    assert.deepEqual(this.calls, [
      {
        path: '/contacts/c-1/verify-phone',
        method: 'POST',
        body: { phone: '0501234567' },
      },
    ]);
    assert.strictEqual(this.verifiedWith, full);
    assert.dom('[data-test-nu-field-error]').doesNotExist();
  });

  test('a miss shows the fixed message and nothing else', async function (assert) {
    await submit(this, () => ({
      data: { verified: false, contact: { id: 'c-1', accessLevel: 'LIMITED' } },
    }));

    assert.strictEqual(this.verifiedWith, undefined);
    assert
      .dom('[data-test-nu-field-error]')
      .hasText('The number does not match');
  });

  test('the rate limit shows the server message', async function (assert) {
    await submit(this, () =>
      httpError(429, {
        statusCode: 429,
        message: 'Too many attempts, try again later',
      }),
    );

    assert.strictEqual(this.verifiedWith, undefined);
    assert
      .dom('[data-test-nu-field-error]')
      .hasText('Too many attempts, try again later');
  });

  test('an empty number cannot be submitted', async function (assert) {
    const calls = stubAuth(this.owner);
    await render(hbs`<Contact::VerifyPhone @contactId="c-1" />`);

    assert.dom('[data-test-verify-phone-submit]').isDisabled();
    assert.strictEqual(calls.length, 0);
  });
});
