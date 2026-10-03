import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import template from 'land/templates/company';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

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

  async function renderBilling(context, { tier, billing, history = [] }) {
    stubNotifications(context.owner);
    stubAuth(context.owner, { role: 'company_admin' });
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
});
