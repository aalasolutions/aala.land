import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/company';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { click } from '@ember/test-helpers';
import { formatLongInstant } from 'land/utils/local-date';
import {
  httpError,
  stubAuth,
  stubNotifications,
} from 'land/tests/helpers/stub-auth';

const squash = (text) => text.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ');

const HISTORY_ROW = {
  occurredAt: '2026-09-01T10:00:00.000Z',
  currency: 'usd',
  hostedInvoiceUrl: null,
  creditApplied: 0,
  creditIssued: 0,
};

module('Integration | Template | company billing', function (hooks) {
  setupRenderingTest(hooks);

  async function renderBilling(
    context,
    { tier, billing, history = [], respond },
  ) {
    const toasts = stubNotifications(context.owner);
    const calls = stubAuth(context.owner, { role: 'company_admin', respond });
    context.owner.lookup('service:router').urlFor = (name) => `/${name}`;
    context.owner.lookup('service:region').activeRegion = {
      code: 'nyc',
      country: 'US',
      currency: 'USD',
    };
    const controller = context.owner.lookup('controller:company');
    controller.tab = 'billing';
    controller.billing = billing;
    controller.billingHistory = history;
    controller.billingHistoryTotal = history.length;
    await renderRouteTemplate(context, template, {
      name: 'company',
      controller,
      model: { company: { id: 'c-1', subscriptionTier: tier }, regions: [] },
    });
    return { calls, toasts, controller };
  }

  const priceText = () =>
    squash(document.querySelector('[data-test-seat-price]').textContent).trim();

  test('FREE shows no price line and the Pro seat note', async function (assert) {
    await renderBilling(this, {
      tier: 'FREE',
      billing: { tier: 'FREE', seatAmount: 2500, currency: 'usd' },
    });
    assert.dom('[data-test-seat-price]').doesNotExist();
    assert
      .dom('[data-test-pro-seat-note]')
      .hasText(
        'Pro starts with your current team. Add members later under Team.',
      );
  });

  test('PRO in USD renders the charged amount through the formatter', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        hasSubscription: true,
        seatAmount: 2500,
        currency: 'usd',
      },
    });
    assert.dom('[data-test-seat-price]').exists();
    assert.strictEqual(priceText(), '$25.00 per seat per month');
    assert.dom('[data-test-pro-seat-note]').doesNotExist();
  });

  test('PRO in a zero-decimal currency is not divided by 100', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        hasSubscription: true,
        seatAmount: 3800,
        currency: 'jpy',
      },
    });
    const text = priceText();
    assert.true(text.includes('3,800'), text);
    assert.false(text.includes('38.00'), text);
    assert.true(text.endsWith('per seat per month'), text);
  });

  test('ENTERPRISE keeps the custom pricing text', async function (assert) {
    await renderBilling(this, {
      tier: 'ENTERPRISE',
      billing: {
        tier: 'ENTERPRISE',
        hasSubscription: true,
        seatAmount: 5000,
        currency: 'usd',
      },
    });
    assert.strictEqual(priceText(), 'Custom Enterprise pricing');
  });

  test('a missing amount shows no price line', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        hasSubscription: true,
        seatAmount: null,
        currency: 'usd',
      },
    });
    assert.dom('[data-test-seat-price]').doesNotExist();
  });

  test('history rows label Paid, Failed and the three zero-charge cases', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: { tier: 'PRO', hasSubscription: true },
      history: [
        {
          ...HISTORY_ROW,
          id: 'h-paid',
          type: 'payment_succeeded',
          amount: 2500,
        },
        {
          ...HISTORY_ROW,
          id: 'h-failed',
          type: 'payment_failed',
          amount: 2500,
        },
        {
          ...HISTORY_ROW,
          id: 'h-credit',
          type: 'settled_without_charge',
          amount: 0,
          creditApplied: 2498,
        },
        {
          ...HISTORY_ROW,
          id: 'h-issued',
          type: 'settled_without_charge',
          amount: 0,
          creditIssued: 2500,
        },
        {
          ...HISTORY_ROW,
          id: 'h-none',
          type: 'settled_without_charge',
          amount: 0,
        },
      ],
    });
    const row = (id) => `[data-test-data-table-row="${id}"]`;
    assert.dom(`${row('h-paid')} [data-test-history-status]`).hasText('Paid');
    assert
      .dom(`${row('h-failed')} [data-test-history-status]`)
      .hasText('Failed');
    assert
      .dom(`${row('h-credit')} [data-test-history-status]`)
      .hasText('Paid with credit');
    assert
      .dom(`${row('h-issued')} [data-test-history-status]`)
      .hasText('Credit issued');
    assert
      .dom(`${row('h-none')} [data-test-history-status]`)
      .hasText('No charge');
    assert.dom(`${row('h-none')} [data-test-history-credit]`).doesNotExist();
    assert.dom(`${row('h-paid')} [data-test-history-credit]`).doesNotExist();
  });

  test('zero-charge rows show the credit figure in the row currency', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: { tier: 'PRO', hasSubscription: true },
      history: [
        {
          ...HISTORY_ROW,
          id: 'h-credit',
          type: 'settled_without_charge',
          amount: 0,
          creditApplied: 2498,
        },
        {
          ...HISTORY_ROW,
          id: 'h-issued',
          type: 'settled_without_charge',
          amount: 0,
          creditIssued: 2500,
        },
      ],
    });
    const credit = (id) =>
      squash(
        document.querySelector(
          `[data-test-data-table-row="${id}"] [data-test-history-credit]`,
        ).textContent,
      ).trim();
    assert.strictEqual(credit('h-credit'), '$24.98');
    assert.strictEqual(credit('h-issued'), '$25.00');
    assert.dom('[data-test-data-table-row="h-credit"]').containsText('used');
    assert
      .dom('[data-test-data-table-row="h-issued"]')
      .containsText('added to balance');
  });

  test('the refund-terms box starts unticked and gates the upgrade button', async function (assert) {
    await renderBilling(this, {
      tier: 'FREE',
      billing: { tier: 'FREE', cancelMode: 'delayed_refund' },
    });
    assert.dom('[data-test-refund-terms]').exists();
    assert
      .dom('[data-test-refund-terms] [data-test-nu-checkbox-input]')
      .isNotChecked();
    assert
      .dom('[data-test-refund-terms] [data-test-nu-checkbox-label]')
      .hasText(
        'I agree that the days I have already used are not refunded. If I leave, only the unused part of my billing period is returned.',
      );
    assert.dom('[data-test-upgrade-pro]').isDisabled();
    await click('[data-test-refund-terms] [data-test-nu-checkbox-input]');
    assert.dom('[data-test-upgrade-pro]').isNotDisabled();
    await click('[data-test-refund-terms] [data-test-nu-checkbox-input]');
    assert.dom('[data-test-upgrade-pro]').isDisabled();
  });

  test('upgrading sends refundTermsAccepted true', async function (assert) {
    const { calls } = await renderBilling(this, {
      tier: 'FREE',
      billing: { tier: 'FREE' },
      respond: () => ({ data: {} }),
    });
    await click('[data-test-refund-terms] [data-test-nu-checkbox-input]');
    await click('[data-test-upgrade-pro]');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].path, '/billing/checkout');
    assert.true(calls[0].body.refundTermsAccepted);
    assert.true(calls[0].body.successUrl.endsWith('/billing.success'));
  });

  test('a 400 from checkout is shown as an error toast', async function (assert) {
    const { toasts } = await renderBilling(this, {
      tier: 'FREE',
      billing: { tier: 'FREE' },
      respond: () =>
        httpError(400, { message: 'Refund terms must be accepted' }),
    });
    await click('[data-test-refund-terms] [data-test-nu-checkbox-input]');
    await click('[data-test-upgrade-pro]');
    assert.deepEqual(toasts, [
      { type: 'error', message: 'Refund terms must be accepted' },
    ]);
  });

  test('the downgrade dialog explains the 48 hour window', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        cancelMode: 'delayed_refund',
        hasSubscription: true,
        canDowngradeToFree: true,
      },
    });
    await click('[data-test-downgrade-free]');
    assert
      .dom('[data-test-confirm-modal-message]')
      .hasText(
        'Your plan ends 48 hours after you confirm. Until then you keep Pro, you can undo this, and you can export your data. After that, the unused part of your billing period is refunded to your payment method. Uploads beyond the Free 2 GB quota will be blocked.',
      );
  });

  test('confirming a downgrade toasts the returned end time', async function (assert) {
    const effective = '2026-10-06T12:00:00.000Z';
    const { calls, toasts, controller } = await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        cancelMode: 'delayed_refund',
        hasSubscription: true,
        canDowngradeToFree: true,
      },
      respond: () => ({
        data: {
          downgradeRequestedAt: '2026-10-04T12:00:00.000Z',
          downgradeEffectiveAt: effective,
        },
      }),
    });
    controller.router.refresh = () => {};
    await click('[data-test-downgrade-free]');
    await click('[data-test-confirm-modal-confirm]');
    assert.strictEqual(calls[0].path, '/billing/cancel');
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(
      toasts[0].message,
      `Your plan will end on ${formatLongInstant(effective)}. You can undo this until then.`,
    );
    assert.true(toasts[0].message.includes('2026'));
  });

  test('a pending downgrade shows the notice and Keep my plan, not Downgrade', async function (assert) {
    const effective = '2026-10-06T12:00:00.000Z';
    const { calls, toasts, controller } = await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        cancelMode: 'delayed_refund',
        hasSubscription: true,
        canDowngradeToFree: true,
        downgradeRequestedAt: '2026-10-04T12:00:00.000Z',
        downgradeEffectiveAt: effective,
      },
      respond: () => ({ data: {} }),
    });
    controller.router.refresh = () => {};
    assert.dom('[data-test-cancel-scheduled]').doesNotExist();
    assert.dom('[data-test-downgrade-free]').doesNotExist();
    assert
      .dom('[data-test-downgrade-pending] .font-bold')
      .hasText(`Your plan ends on ${formatLongInstant(effective)}`);
    assert
      .dom('[data-test-downgrade-pending] p')
      .hasText(
        'You keep Pro until then. Export anything you need. After that the unused part of your billing period is refunded to your payment method.',
      );
    assert.dom('[data-test-reactivate-pro]').hasText('Keep my plan');
    await click('[data-test-reactivate-pro]');
    assert.strictEqual(calls[0].path, '/billing/resume');
    assert.deepEqual(toasts, [
      { type: 'success', message: 'Your plan stays active.' },
    ]);
  });

  test('the period-end shape keeps its alert, button and message', async function (assert) {
    const { calls, toasts, controller } = await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        hasSubscription: true,
        canDowngradeToFree: true,
        cancelAtPeriodEnd: true,
        cancelAt: '2026-10-30T12:00:00.000Z',
        downgradeEffectiveAt: null,
      },
      respond: () => ({ data: {} }),
    });
    controller.router.refresh = () => {};
    assert.dom('[data-test-downgrade-pending]').doesNotExist();
    assert
      .dom('[data-test-cancel-scheduled] .font-bold')
      .hasText('Scheduled to move to the Free plan');
    assert.dom('[data-test-cancel-scheduled]').containsText('October 30, 2026');
    assert.dom('[data-test-downgrade-free]').doesNotExist();
    assert.dom('[data-test-reactivate-pro]').hasText('Reactivate plan');
    await click('[data-test-reactivate-pro]');
    assert.strictEqual(calls[0].path, '/billing/resume');
    assert.strictEqual(
      toasts[0].message,
      'Your subscription will keep renewing. The scheduled downgrade is canceled.',
    );
  });

  test('refund rows show their three labels, the amount and no credit', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: { tier: 'PRO', hasSubscription: true },
      history: [
        {
          ...HISTORY_ROW,
          id: 'r-pending',
          type: 'refund',
          refundStatus: 'pending',
          amount: 1200,
        },
        {
          ...HISTORY_ROW,
          id: 'r-approved',
          type: 'refund',
          refundStatus: 'approved',
          amount: 1200,
        },
        {
          ...HISTORY_ROW,
          id: 'r-rejected',
          type: 'refund',
          refundStatus: 'rejected',
          amount: 1200,
        },
      ],
    });
    const row = (id) => `[data-test-data-table-row="${id}"]`;
    assert
      .dom(`${row('r-pending')} [data-test-history-status]`)
      .hasText('Refund requested');
    assert
      .dom(`${row('r-approved')} [data-test-history-status]`)
      .hasText('Refunded');
    assert
      .dom(`${row('r-rejected')} [data-test-history-status]`)
      .hasText('Refund rejected');
    assert.dom(row('r-approved')).containsText('$12.00');
    assert
      .dom(`${row('r-approved')} [data-test-history-credit]`)
      .doesNotExist();
  });

  const PERIOD_END_DIALOG =
    'Your subscription will be canceled at the end of the current billing period. Paid features, extra seats, and per-seat storage go away when it ends. Nothing is deleted, but uploads beyond the Free 2 GB quota will be blocked.';

  test('period_end mode keeps the old dialog and toast', async function (assert) {
    const { toasts, controller } = await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        cancelMode: 'period_end',
        hasSubscription: true,
        canDowngradeToFree: true,
      },
      respond: () => ({ data: {} }),
    });
    controller.router.refresh = () => {};
    await click('[data-test-downgrade-free]');
    assert.dom('[data-test-confirm-modal-message]').hasText(PERIOD_END_DIALOG);
    await click('[data-test-confirm-modal-confirm]');
    assert.deepEqual(toasts, [
      {
        type: 'success',
        message:
          'Subscription will end at the close of the current billing period.',
      },
    ]);
  });

  test('a missing cancelMode is treated as period_end', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        hasSubscription: true,
        canDowngradeToFree: true,
      },
    });
    await click('[data-test-downgrade-free]');
    assert.dom('[data-test-confirm-modal-message]').hasText(PERIOD_END_DIALOG);
  });

  test('period_end mode ignores downgrade fields and shows the period-end notice', async function (assert) {
    await renderBilling(this, {
      tier: 'PRO',
      billing: {
        tier: 'PRO',
        cancelMode: 'period_end',
        hasSubscription: true,
        canDowngradeToFree: true,
        cancelAtPeriodEnd: true,
        cancelAt: '2026-10-30T12:00:00.000Z',
        downgradeEffectiveAt: '2026-10-06T12:00:00.000Z',
      },
    });
    assert.dom('[data-test-downgrade-pending]').doesNotExist();
    assert.dom('[data-test-cancel-scheduled]').exists();
    assert.dom('[data-test-reactivate-pro]').hasText('Reactivate plan');
  });

  test('the consent label drops the return sentence outside delayed_refund', async function (assert) {
    const label = '[data-test-refund-terms] [data-test-nu-checkbox-label]';
    await renderBilling(this, {
      tier: 'FREE',
      billing: { tier: 'FREE', cancelMode: 'period_end' },
    });
    assert
      .dom(label)
      .hasText('I agree that the days I have already used are not refunded.');
    assert.dom('[data-test-upgrade-pro]').isDisabled();
  });

  test('a missing cancelMode shows the short consent label', async function (assert) {
    await renderBilling(this, { tier: 'FREE', billing: { tier: 'FREE' } });
    assert
      .dom('[data-test-refund-terms] [data-test-nu-checkbox-label]')
      .hasText('I agree that the days I have already used are not refunded.');
  });
});
