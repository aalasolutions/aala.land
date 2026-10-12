import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const CARD = {
  occurredAt: '2026-09-01T10:00:00.000Z',
  currency: 'usd',
  periodStart: null,
  periodEnd: null,
  hostedInvoiceUrl: null,
};

module('Unit | Controller | admin/companies/company', function (hooks) {
  setupTest(hooks);

  async function loadRows(context, cardRows) {
    stubNotifications(context.owner);
    stubAuth(context.owner, {
      role: 'super_admin',
      respond: (path) =>
        path.startsWith('/billing/history')
          ? { data: { data: cardRows } }
          : { data: { data: [] } },
    });
    const controller = context.owner.lookup(
      'controller:admin/companies/company',
    );
    controller.detail = { id: 'c-1' };
    await controller.loadPayments();
    return controller.paymentRows;
  }

  test('card rows carry type and credit figures', async function (assert) {
    const rows = await loadRows(this, [
      {
        ...CARD,
        id: 'h-1',
        type: 'settled_without_charge',
        amount: 0,
        creditApplied: 2498,
        creditIssued: 0,
      },
    ]);
    assert.strictEqual(rows[0].type, 'settled_without_charge');
    assert.strictEqual(rows[0].creditApplied, 2498);
    assert.strictEqual(rows[0].creditIssued, 0);
  });

  test('only a payment_succeeded row can be made right', async function (assert) {
    const rows = await loadRows(this, [
      { ...CARD, id: 'paid', type: 'payment_succeeded', amount: 2500 },
      { ...CARD, id: 'failed', type: 'payment_failed', amount: 2500 },
      {
        ...CARD,
        id: 'zero',
        type: 'settled_without_charge',
        amount: 0,
        creditApplied: 2498,
        creditIssued: 0,
      },
    ]);
    const paidById = Object.fromEntries(rows.map((r) => [r.id, r.paid]));
    assert.deepEqual(paidById, { paid: true, failed: false, zero: false });
  });

  test('rows from an API without credit fields default to zero', async function (assert) {
    const rows = await loadRows(this, [
      { ...CARD, id: 'h-1', type: 'payment_succeeded', amount: 2500 },
    ]);
    assert.strictEqual(rows[0].creditApplied, 0);
    assert.strictEqual(rows[0].creditIssued, 0);
  });

  test('every row carries the amount its Credit cell displays', async function (assert) {
    const rows = await loadRows(this, [
      { ...CARD, id: 'paid', type: 'payment_succeeded', amount: 2500 },
      {
        ...CARD,
        id: 'applied',
        type: 'settled_without_charge',
        amount: 0,
        creditApplied: 2498,
        creditIssued: 0,
      },
      {
        ...CARD,
        id: 'issued',
        type: 'settled_without_charge',
        amount: 0,
        creditApplied: 0,
        creditIssued: 2500,
      },
    ]);
    const amountById = Object.fromEntries(
      rows.map((r) => [r.id, r.creditAmount]),
    );
    assert.deepEqual(amountById, { paid: 0, applied: 2498, issued: 2500 });
  });

  test('the three downgrade audit events read as labels, with the amount when present', async function (assert) {
    stubNotifications(this.owner);
    stubAuth(this.owner, {
      role: 'super_admin',
      respond: () => ({
        data: {
          data: [
            {
              id: 'e-1',
              createdAt: '2026-10-06T12:00:00.000Z',
              newValue: {
                event: 'downgrade_executed',
                amount: 1200,
                currency: 'usd',
              },
            },
            {
              id: 'e-2',
              createdAt: '2026-10-06T12:05:00.000Z',
              newValue: {
                event: 'refund_failed',
                amount: 1200,
                currency: 'usd',
                error: 'provider error',
              },
            },
            {
              id: 'e-3',
              createdAt: '2026-10-06T12:10:00.000Z',
              newValue: { event: 'downgrade_released' },
            },
          ],
        },
      }),
    });
    const controller = this.owner.lookup('controller:admin/companies/company');
    controller.detail = { id: 'c-1' };
    await controller.loadHistory();
    const what = Object.fromEntries(
      controller.historyRows.map((r) => [r.id, r.what]),
    );
    assert.true(what['e-1'].startsWith('Plan ended, refund requested'));
    assert.true(what['e-1'].includes('12.00'));
    assert.true(what['e-2'].startsWith('Refund failed'));
    assert.true(what['e-2'].includes('12.00'));
    assert.strictEqual(what['e-3'], 'Downgrade request dropped');
  });
});
