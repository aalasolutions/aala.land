import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/admin/companies/company';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';
import { formatLongInstant } from 'land/utils/local-date';

const squash = (text) => text.replaceAll(' ', ' ').replace(/\s+/g, ' ');

module('Integration | Template | admin company overview', function (hooks) {
  setupRenderingTest(hooks);

  async function renderOverview(context, billing) {
    stubNotifications(context.owner);
    stubAuth(context.owner, { role: 'super_admin' });
    context.owner.lookup('service:region').activeRegion = {
      code: 'nyc',
      country: 'US',
      currency: 'USD',
    };
    const controller = context.owner.lookup(
      'controller:admin/companies/company',
    );
    controller.resetForCompany({
      id: 'c-1',
      name: 'Test Co',
      tier: 'PRO',
      billing: { tier: 'PRO', ...billing },
    });
    await renderRouteTemplate(context, template, {
      name: 'admin.companies.company',
      controller,
      model: controller.detail,
    });
  }

  const effective = '2026-10-06T12:00:00.000Z';

  test('a pending downgrade reads the plan end date and time', async function (assert) {
    await renderOverview(this, {
      downgradeRequestedAt: '2026-10-04T12:00:00.000Z',
      downgradeEffectiveAt: effective,
    });
    assert.strictEqual(
      squash(
        document.querySelector('[data-test-company-downgrade-pending]')
          .textContent,
      ).trim(),
      `Downgrade requested, plan ends ${formatLongInstant(effective)}`,
    );
  });

  test('the period-end shape keeps its line', async function (assert) {
    await renderOverview(this, {
      cancelAtPeriodEnd: true,
      cancelAt: '2026-10-30T12:00:00.000Z',
      downgradeEffectiveAt: null,
    });
    assert.dom('[data-test-company-downgrade-pending]').doesNotExist();
    assert.dom('[data-test-company-plan-card]').containsText('Cancels');
  });

  test('the pending downgrade wins when both are set', async function (assert) {
    await renderOverview(this, {
      cancelAtPeriodEnd: true,
      cancelAt: '2026-10-30T12:00:00.000Z',
      downgradeEffectiveAt: effective,
    });
    assert.dom('[data-test-company-downgrade-pending]').exists();
    assert.dom('[data-test-company-plan-card]').doesNotContainText('Cancels');
  });
});
