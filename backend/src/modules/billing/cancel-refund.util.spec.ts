import {
  allocateCancelRefund,
  computeCancelRefund,
  RefundablePayment,
} from './cancel-refund.util';

const periodStart = new Date('2026-10-01T00:00:00.000Z');
const periodEnd = new Date('2026-10-31T00:00:00.000Z');
// 30-day period; day 10 leaves 20 of 30 days unused.
const day10 = new Date('2026-10-11T00:00:00.000Z');

function refund(
  overrides: Partial<Parameters<typeof computeCancelRefund>[0]> = {},
) {
  return computeCancelRefund({
    periodStart,
    periodEnd,
    executedAt: day10,
    periodPaid: true,
    heldLines: [{ quantity: 1, unitGross: 2500 }],
    pendingNextBill: 0,
    creditBalance: 0,
    cardRefundable: 2500,
    ...overrides,
  });
}

describe('computeCancelRefund', () => {
  it('refunds the unused share of one seat cancelled mid-period', () => {
    const result = refund();
    expect(result.unusedHeldValue).toBe(1666);
    expect(result.amount).toBe(1666);
  });

  it('adds the credit held for seats removed earlier in the period', () => {
    // Paid 3 seats (7500); 2 removed on day 5, provider holds 2 x 2500 x 25/30 = 4166.
    const result = refund({
      heldLines: [{ quantity: 1, unitGross: 2500 }],
      pendingNextBill: -4166,
      cardRefundable: 7500,
    });
    expect(result.amount).toBe(1666 + 4166);
  });

  it('deducts the used part of a seat added and not yet billed', () => {
    // Seat added on day 5 (charge 2500 x 25/30 = 2083 pending); 2 held, 1 paid upfront.
    const result = refund({
      heldLines: [{ quantity: 2, unitGross: 2500 }],
      pendingNextBill: 2083,
      cardRefundable: 2500,
    });
    expect(result.unusedHeldValue).toBe(3333);
    expect(result.amount).toBe(3333 - 2083);
  });

  it('never refunds more than the card paid when the period was partly paid from credit', () => {
    const result = refund({ cardRefundable: 1000 });
    expect(result.uncapped).toBe(1666);
    expect(result.amount).toBe(1000);
  });

  it('refunds nothing in cash for a period paid wholly from credit', () => {
    expect(refund({ cardRefundable: 0 }).amount).toBe(0);
  });

  it('returns the credit balance on a downgrade (removed seats credited, day 12 of 31)', () => {
    // Paid 7500 for 3 seats; reconcile to 1 seat credited 5000 to the balance at once.
    const start = new Date('2026-10-03T20:11:40.283Z');
    const result = refund({
      periodStart: start,
      periodEnd: new Date('2026-11-03T20:11:40.283Z'),
      executedAt: new Date(start.getTime() + 12 * 86400000),
      heldLines: [{ quantity: 1, unitGross: 2500 }],
      creditBalance: 5000,
      cardRefundable: 7500,
    });
    // 19 of 31 days unused: 2500 x 19/31 = 1532.25, floored.
    expect(result.unusedHeldValue).toBe(1532);
    expect(result.amount).toBe(6532);
  });

  it('returns the remaining balance of a month paid wholly from credit', () => {
    // Month two (30 days) paid 2500 from a 5000 balance; downgrade on day 15.
    const result = refund({
      periodStart: new Date('2026-11-01T00:00:00Z'),
      periodEnd: new Date('2026-12-01T00:00:00Z'),
      executedAt: new Date('2026-11-16T00:00:00Z'),
      heldLines: [{ quantity: 1, unitGross: 2500 }],
      creditBalance: 2500,
      cardRefundable: 7500,
    });
    expect(result.amount).toBe(1250 + 2500);
  });

  it('never returns more than the refundable card money, credit included', () => {
    const result = refund({ creditBalance: 9000, cardRefundable: 6000 });
    expect(result.uncapped).toBe(1666 + 9000);
    expect(result.amount).toBe(6000);
  });

  it('refunds no unused share of a period nobody paid, but still the held credit and balance', () => {
    const result = refund({
      periodPaid: false,
      pendingNextBill: -400,
      creditBalance: 600,
    });
    expect(result.unusedHeldValue).toBe(0);
    expect(result.amount).toBe(1000);
  });

  it('ignores a negative credit balance', () => {
    expect(refund({ creditBalance: -300 }).amount).toBe(1666);
  });

  it('never goes below zero when pending charges exceed the unused share', () => {
    expect(refund({ pendingNextBill: 5000 }).amount).toBe(0);
  });

  it('works on the gross amount whether tax is inside or on top', () => {
    // Inside: 2500 gross. On top: 2500 net plus 5 percent = 2625 gross.
    expect(
      refund({ heldLines: [{ quantity: 1, unitGross: 2500 }] }).amount,
    ).toBe(1666);
    expect(
      refund({
        heldLines: [{ quantity: 1, unitGross: 2625 }],
        cardRefundable: 2625,
      }).amount,
    ).toBe(1750);
  });

  it('rounds down to the minor unit of a zero-decimal currency', () => {
    // JPY: 1000 yen is 1000 minor units; 20/30 of it is 666.67.
    expect(
      refund({
        heldLines: [{ quantity: 1, unitGross: 1000 }],
        cardRefundable: 1000,
      }).amount,
    ).toBe(666);
  });

  it('rounds down to the minor unit of a three-decimal currency', () => {
    // KWD 10.000 is 10000 fils; 20/30 of it is 6666.67.
    expect(
      refund({
        heldLines: [{ quantity: 1, unitGross: 10000 }],
        cardRefundable: 10000,
      }).amount,
    ).toBe(6666);
  });

  it('refunds only held credit when executed after the period end', () => {
    const result = refund({
      executedAt: new Date('2026-11-02T00:00:00.000Z'),
      pendingNextBill: -800,
    });
    expect(result.unusedMs).toBe(0);
    expect(result.unusedHeldValue).toBe(0);
    expect(result.amount).toBe(800);
  });

  it('refunds almost everything in the first minute of the period', () => {
    const result = refund({
      executedAt: new Date('2026-10-01T00:01:00.000Z'),
    });
    // 2500 x (30 days - 1 minute) / 30 days = 2499.94, floored.
    expect(result.amount).toBe(2499);
  });

  it('keeps an exact result for large amounts over long periods', () => {
    const result = refund({
      heldLines: [{ quantity: 10000, unitGross: 100000000 }],
      cardRefundable: Number.MAX_SAFE_INTEGER,
    });
    expect(result.unusedHeldValue).toBe(666666666666);
  });

  it('returns the breakdown used for the audit record', () => {
    expect(refund({ pendingNextBill: -100 })).toEqual({
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-10-31T00:00:00.000Z',
      executedAt: '2026-10-11T00:00:00.000Z',
      periodPaid: true,
      periodMs: 30 * 86400000,
      unusedMs: 20 * 86400000,
      heldValue: 2500,
      unusedHeldValue: 1666,
      pendingNextBill: -100,
      creditBalance: 0,
      uncapped: 1766,
      cardRefundable: 2500,
      amount: 1766,
    });
  });
});

describe('allocateCancelRefund', () => {
  const payment = (id: string, refundable: number): RefundablePayment => ({
    billingHistoryId: id,
    providerInvoiceId: `txn_${id}`,
    currency: 'usd',
    refundable,
  });

  it('fills payments in order, each up to its refundable amount', () => {
    const parts = allocateCancelRefund(3000, [
      payment('new', 2000),
      payment('zero', 0),
      payment('old', 5000),
    ]);
    expect(parts.map((p) => [p.payment.billingHistoryId, p.amount])).toEqual([
      ['new', 2000],
      ['old', 1000],
    ]);
  });

  it('returns nothing for a zero refund', () => {
    expect(allocateCancelRefund(0, [payment('a', 100)])).toEqual([]);
  });

  it('throws when the payments cannot cover the amount', () => {
    expect(() => allocateCancelRefund(200, [payment('a', 100)])).toThrow(
      'exceeds the refundable payments',
    );
  });
});
