import { module, test } from 'qunit';
import { click, find, settled } from '@ember/test-helpers';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/team';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import {
  stubAuth,
  stubNotifications,
  httpError,
} from 'land/tests/helpers/stub-auth';

const MEMBER = { id: 'user-2', name: 'Test Member', isActive: true };

module('Integration | Template | team', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    stubNotifications(this.owner);
    stubAuth(this.owner, { respond: () => ({ data: [] }) });
  });

  async function renderRemoveDialog(ctx, seatInfo) {
    const controller = ctx.owner.lookup('controller:team');
    controller.userToRemove = MEMBER;
    controller.removeStep = 1;
    controller.showRemoveModal = true;
    await renderRouteTemplate(ctx, template, {
      name: 'team',
      controller,
      model: { users: [MEMBER], total: 2, page: 1, seatInfo },
    });
  }

  test('a paid plan tells the owner the freed seat is credited', async function (assert) {
    await renderRemoveDialog(this, {
      tier: 'PRO',
      purchasedSeats: 2,
      hasSubscription: true,
    });
    assert
      .dom('[data-test-seat-removal-note]')
      .hasText(
        'This frees one seat. The unused part of this billing period is credited on your next bill.',
      );
    assert
      .dom('[data-test-remove-mode-deactivate]')
      .exists('the remove dialog is open');
  });

  test('the Free plan does not show the credit note', async function (assert) {
    await renderRemoveDialog(this, { tier: 'FREE', purchasedSeats: 1 });
    assert.dom('[data-test-remove-step-1]').exists();
    assert.dom('[data-test-seat-removal-note]').doesNotExist();
  });

  test('a paid plan with a subscription drops "frees the seat" from the deactivate line', async function (assert) {
    await renderRemoveDialog(this, {
      tier: 'PRO',
      purchasedSeats: 2,
      hasSubscription: true,
    });
    const label = find('[data-test-remove-mode-deactivate]').closest('label');
    assert.notOk(label.textContent.includes('frees the seat'));
  });

  test('a paid plan without a subscription reads like the Free plan', async function (assert) {
    await renderRemoveDialog(this, {
      tier: 'PRO',
      purchasedSeats: 1,
      hasSubscription: false,
    });
    assert.dom('[data-test-seat-removal-note]').doesNotExist();
    const label = find('[data-test-remove-mode-deactivate]').closest('label');
    assert.ok(label.textContent.includes('and frees the seat'));
  });

  test('the Free plan deactivate line frees the seat', async function (assert) {
    await renderRemoveDialog(this, {
      tier: 'FREE',
      purchasedSeats: 1,
      hasSubscription: false,
    });
    const label = find('[data-test-remove-mode-deactivate]').closest('label');
    assert.ok(label.textContent.includes('and frees the seat'));
  });

  module('seat note refresh on open', function () {
    const PAID = { tier: 'PRO', purchasedSeats: 1, hasSubscription: true };

    async function renderTeam(ctx, seatInfo) {
      const controller = ctx.owner.lookup('controller:team');
      await renderRouteTemplate(ctx, template, {
        name: 'team',
        controller,
        model: { users: [MEMBER], total: 2, page: 1, seatInfo },
      });
    }

    test('opening Add Member after the server count changed shows the new count', async function (assert) {
      let seats = 1;
      const calls = stubAuth(this.owner, {
        role: 'company_admin',
        companyId: 'co-1',
        respond: () => ({
          data: { tier: 'PRO', purchasedSeats: seats, hasSubscription: true },
        }),
      });
      await renderTeam(this, PAID);

      await click('[data-test-add-member]');
      assert.dom('[data-test-seat-count]').hasText('1');

      seats = 2;
      this.owner.lookup('controller:team').showModal = false;
      await settled();
      await click('[data-test-add-member]');
      assert.dom('[data-test-seat-count]').hasText('2');
      assert.ok(
        calls.some((c) => c.path === '/companies/co-1/storage-usage'),
        'seat usage is fetched on open',
      );
    });

    test('opening Invite refreshes the count', async function (assert) {
      stubAuth(this.owner, {
        role: 'company_admin',
        companyId: 'co-1',
        respond: () => ({
          data: { tier: 'PRO', purchasedSeats: 3, hasSubscription: true },
        }),
      });
      await renderTeam(this, PAID);
      await click('[data-test-invite-member]');
      assert.dom('[data-test-seat-count]').hasText('3');
    });

    test('a failed refresh keeps the previous count and still opens the drawer', async function (assert) {
      stubAuth(this.owner, {
        role: 'company_admin',
        companyId: 'co-1',
        respond: () => httpError(500, { message: 'down' }),
      });
      await renderTeam(this, { ...PAID, purchasedSeats: 4 });
      await click('[data-test-add-member]');
      assert.dom('[data-test-seat-count]').hasText('4');
      assert.true(this.owner.lookup('controller:team').showModal);
    });

    test('a new route setup shows the new model seat info before any dialog opens', async function (assert) {
      stubAuth(this.owner, {
        role: 'company_admin',
        companyId: 'co-1',
        respond: () => ({
          data: { tier: 'PRO', purchasedSeats: 3, hasSubscription: true },
        }),
      });
      await renderTeam(this, PAID);
      await click('[data-test-invite-member]');
      const controller = this.owner.lookup('controller:team');
      assert.strictEqual(controller.seatInfo.purchasedSeats, 3);

      controller.resetSeatInfo();
      controller.showInviteModal = false;
      controller.model = {
        users: [MEMBER],
        total: 2,
        page: 1,
        seatInfo: { tier: 'FREE', purchasedSeats: 1, hasSubscription: false },
      };
      assert.strictEqual(controller.seatInfo.tier, 'FREE');
      assert.false(controller.canTrim);
    });

    test('a refresh that resolves after the reset does not overwrite it', async function (assert) {
      let release;
      stubAuth(this.owner, {
        role: 'company_admin',
        companyId: 'co-1',
        respond: () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                data: { tier: 'PRO', purchasedSeats: 9, hasSubscription: true },
              });
          }),
      });
      await renderTeam(this, PAID);
      const controller = this.owner.lookup('controller:team');
      const pending = controller.refreshSeatInfo();
      controller.resetSeatInfo();
      release();
      await pending;
      assert.strictEqual(controller.refreshedSeatInfo, null);
      assert.strictEqual(controller.seatInfo.purchasedSeats, 1);
    });
  });
});
