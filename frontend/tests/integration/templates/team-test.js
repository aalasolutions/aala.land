import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/team';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

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
    await renderRemoveDialog(this, { tier: 'PRO', purchasedSeats: 2 });
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
});
