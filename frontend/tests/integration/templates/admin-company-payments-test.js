import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/admin/companies/company';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const squash = (text) => text.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ');

const CARD = {
  occurredAt: '2026-09-01T10:00:00.000Z',
  currency: 'usd',
  periodStart: null,
  periodEnd: null,
  hostedInvoiceUrl: null,
};

module('Integration | Template | admin company payments', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(async function () {
    stubNotifications(this.owner);
    stubAuth(this.owner, {
      role: 'super_admin',
      respond: (path) =>
        path.startsWith('/billing/history')
          ? {
              data: {
                data: [
                  {
                    ...CARD,
                    id: 'h-paid',
                    type: 'payment_succeeded',
                    amount: 2500,
                  },
                  {
                    ...CARD,
                    id: 'h-failed',
                    type: 'payment_failed',
                    amount: 2500,
                  },
                  {
                    ...CARD,
                    id: 'h-credit',
                    type: 'settled_without_charge',
                    amount: 0,
                    creditApplied: 2498,
                    creditIssued: 0,
                  },
                  {
                    ...CARD,
                    id: 'h-issued',
                    type: 'settled_without_charge',
                    amount: 0,
                    creditApplied: 0,
                    creditIssued: 2500,
                  },
                  {
                    ...CARD,
                    id: 'h-none',
                    type: 'settled_without_charge',
                    amount: 0,
                    creditApplied: 0,
                    creditIssued: 0,
                  },
                  {
                    ...CARD,
                    id: 'h-refund-pending',
                    type: 'refund',
                    refundStatus: 'pending',
                    amount: 1200,
                  },
                  {
                    ...CARD,
                    id: 'h-refund-approved',
                    type: 'refund',
                    refundStatus: 'approved',
                    amount: 1200,
                  },
                  {
                    ...CARD,
                    id: 'h-refund-rejected',
                    type: 'refund',
                    refundStatus: 'rejected',
                    amount: 1200,
                  },
                ],
              },
            }
          : { data: { data: [] } },
    });
    this.owner.lookup('service:region').activeRegion = {
      code: 'nyc',
      country: 'US',
      currency: 'USD',
    };
    const controller = this.owner.lookup('controller:admin/companies/company');
    controller.resetForCompany({ id: 'c-1', name: 'Test Co', tier: 'PRO' });
    controller.activeTab = 'payments';
    await controller.loadPayments();
    await renderRouteTemplate(this, template, {
      name: 'admin.companies.company',
      controller,
      model: controller.detail,
    });
  });

  const row = (id) => `[data-test-data-table-row="${id}"]`;

  test('rows show Paid, Failed and the three zero-charge labels', function (assert) {
    assert.dom(`${row('h-paid')} [data-test-payment-status]`).hasText('Paid');
    assert
      .dom(`${row('h-failed')} [data-test-payment-status]`)
      .hasText('Failed');
    assert
      .dom(`${row('h-credit')} [data-test-payment-status]`)
      .hasText('Paid with credit');
    assert
      .dom(`${row('h-issued')} [data-test-payment-status]`)
      .hasText('Credit issued');
    assert
      .dom(`${row('h-none')} [data-test-payment-status]`)
      .hasText('No charge');
  });

  test('zero-charge rows show the credit figure', function (assert) {
    const credit = (id) =>
      squash(
        document.querySelector(`${row(id)} [data-test-payment-credit]`)
          .textContent,
      ).trim();
    assert.strictEqual(credit('h-credit'), '$24.98');
    assert.strictEqual(credit('h-issued'), '$25.00');
    assert.dom(`${row('h-none')} [data-test-payment-credit]`).doesNotExist();
  });

  test('only the paid row offers Refund or discount', function (assert) {
    assert.dom('[data-test-company-make-right="h-paid"]').exists();
    assert.dom('[data-test-company-make-right="h-failed"]').doesNotExist();
    assert.dom('[data-test-company-make-right="h-credit"]').doesNotExist();
    assert.dom('[data-test-company-make-right="h-issued"]').doesNotExist();
    assert.dom('[data-test-company-make-right="h-none"]').doesNotExist();
  });

  test('refund rows show their three labels and the refunded amount', function (assert) {
    assert
      .dom(`${row('h-refund-pending')} [data-test-payment-status]`)
      .hasText('Refund requested');
    assert
      .dom(`${row('h-refund-approved')} [data-test-payment-status]`)
      .hasText('Refunded');
    assert
      .dom(`${row('h-refund-rejected')} [data-test-payment-status]`)
      .hasText('Refund rejected');
    assert.dom(row('h-refund-approved')).containsText('$12.00');
    assert
      .dom(`${row('h-refund-approved')} [data-test-payment-credit]`)
      .doesNotExist();
  });

  test('a refund row never offers Refund or discount', function (assert) {
    assert
      .dom('[data-test-company-make-right="h-refund-pending"]')
      .doesNotExist();
    assert
      .dom('[data-test-company-make-right="h-refund-approved"]')
      .doesNotExist();
    assert
      .dom('[data-test-company-make-right="h-refund-rejected"]')
      .doesNotExist();
  });
});
