import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  click,
  fillIn,
  render,
  triggerEvent,
  waitFor,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import {
  httpError,
  stubAuth,
  stubNotifications,
} from 'land/tests/helpers/stub-auth';

module('Integration | Component | team/invite-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.toasts = stubNotifications(this.owner);
    this.open = true;
    this.seatInfo = { tier: 'FREE', purchasedSeats: 1 };
    this.isReactivating = false;
    this.saved = 0;
    this.closed = 0;
    this.reactivated = [];
    this.onSaved = () => this.saved++;
    this.onClose = () => this.closed++;
    this.onReactivate = async (user) => {
      this.reactivated.push(user);
      return true;
    };
  });

  async function renderDrawer() {
    await render(
      hbs`<Team::InviteDrawer @open={{this.open}} @seatInfo={{this.seatInfo}} @isReactivating={{this.isReactivating}} @onReactivate={{this.onReactivate}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
    );
    await waitFor('#i-fname');
  }

  async function fillForm() {
    await fillIn('#i-fname', 'Jane');
    await fillIn('#i-lname', 'Smith');
    await fillIn('#i-email', 'jane@example.com');
  }

  test('sending posts the invite and closes', async function (assert) {
    const calls = stubAuth(this.owner, {
      role: 'company_admin',
      respond: () => ({ data: {} }),
    });
    await renderDrawer();
    assert.dom('[data-test-seat-note-free]').exists();
    await fillForm();
    await click('[data-test-send-invite]');

    assert.deepEqual(calls, [
      {
        path: '/users/invite',
        method: 'POST',
        body: {
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'agent',
        },
      },
    ]);
    assert.strictEqual(this.saved, 1);
    assert.strictEqual(this.closed, 1);
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Invitation sent successfully' },
    ]);
  });

  test('roles offered are strictly below the current user', async function (assert) {
    stubAuth(this.owner, { role: 'manager' });
    await renderDrawer();
    await click('#i-role [data-test-wu-dropdown-trigger]');
    const labels = [
      ...document.querySelectorAll('[data-test-wu-dropdown-item]'),
    ].map((el) => el.textContent.trim());
    assert.deepEqual(labels, ['Agent', 'Accountant']);
  });

  test('an inactive email offers reactivation instead', async function (assert) {
    stubAuth(this.owner, {
      role: 'company_admin',
      respond: () =>
        httpError(409, {
          message: 'This email belongs to an inactive user',
          code: 'EMAIL_INACTIVE_USER',
          existingUserId: 'user-9',
          existingUserName: 'Old Member',
        }),
    });
    await renderDrawer();
    await fillForm();
    await click('[data-test-send-invite]');

    assert
      .dom('[data-test-invite-error]')
      .hasText('This email belongs to an inactive user');
    assert.strictEqual(this.saved, 0);
    await click('[data-test-invite-reactivate]');
    assert.deepEqual(this.reactivated, [{ id: 'user-9', name: 'Old Member' }]);
    assert.strictEqual(this.closed, 1, 'closes after a reactivation');
  });

  test('a failed reactivation keeps the drawer open', async function (assert) {
    stubAuth(this.owner, {
      respond: () =>
        httpError(409, {
          message: 'Inactive',
          code: 'EMAIL_INACTIVE_USER',
          existingUserId: 'user-9',
          existingUserName: 'Old Member',
        }),
    });
    this.onReactivate = async () => false;
    await renderDrawer();
    await fillForm();
    await click('[data-test-send-invite]');
    await click('[data-test-invite-reactivate]');
    assert.strictEqual(this.closed, 0);
  });

  test('other errors do not offer reactivation', async function (assert) {
    stubAuth(this.owner, {
      respond: () => httpError(400, { message: 'Seat limit reached' }),
    });
    await renderDrawer();
    await fillForm();
    await click('[data-test-send-invite]');
    assert.dom('[data-test-invite-error]').hasText('Seat limit reached');
    assert.dom('[data-test-invite-reactivate]').doesNotExist();
  });

  test('a running reactivation blocks sending', async function (assert) {
    const calls = stubAuth(this.owner, { respond: () => ({ data: {} }) });
    this.isReactivating = true;
    await renderDrawer();
    assert.dom('[data-test-send-invite]').isDisabled();
    await fillForm();
    await triggerEvent('#team-invite-form', 'submit');
    assert.strictEqual(calls.length, 0);
  });
});
