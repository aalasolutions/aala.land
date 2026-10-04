import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  PaddleBillingProvider,
  chargedUnitAmounts,
  deriveSubscriptionShape,
  minorUnits,
  verifyPaddleSignature,
} from './paddle-billing.provider';

const client = {
  customers: { get: jest.fn() },
};

jest.mock('@paddle/paddle-node-sdk', () => {
  const actual = jest.requireActual('@paddle/paddle-node-sdk');
  return {
    ...actual,
    Paddle: jest.fn().mockImplementation(() => client),
  };
});

const SECRET = 'pdl_ntfset_test_secret';

function sign(body: Buffer, ts: number, secret = SECRET): string {
  const h1 = createHmac('sha256', secret)
    .update(`${ts}:${body.toString('utf8')}`)
    .digest('hex');
  return `ts=${ts};h1=${h1}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const seatItem = (quantity: number) => ({
  quantity,
  price: { id: 'pri_seat', custom_data: { kind: 'SEAT' } },
});
const baseItem = {
  quantity: 1,
  price: { id: 'pri_base', custom_data: { kind: 'ENTERPRISE_BASE' } },
};

function subscriptionEvent(
  overrides: {
    type?: string;
    status?: string;
    items?: unknown[];
    customData?: Record<string, unknown> | null;
    canceledAt?: string | null;
  } = {},
): Record<string, unknown> {
  return {
    event_id: 'evt_sub_1',
    event_type: overrides.type ?? 'subscription.updated',
    occurred_at: '2026-10-01T10:00:00.000Z',
    data: {
      id: 'sub_1',
      status: overrides.status ?? 'active',
      customer_id: 'ctm_1',
      currency_code: 'USD',
      canceled_at: overrides.canceledAt ?? null,
      custom_data:
        overrides.customData === undefined
          ? { companyId: 'company-1', plan: 'PRO' }
          : overrides.customData,
      current_billing_period: {
        starts_at: '2026-10-01T00:00:00Z',
        ends_at: '2026-11-01T00:00:00Z',
      },
      items: overrides.items ?? [seatItem(3)],
    },
  };
}

function transactionEvent(
  type: string,
  overrides: { subscriptionId?: string | null; customData?: unknown } = {},
): Record<string, unknown> {
  return {
    event_id: 'evt_txn_1',
    event_type: type,
    occurred_at: '2026-10-01T10:00:00.000Z',
    data: {
      id: 'txn_1',
      customer_id: 'ctm_1',
      subscription_id:
        overrides.subscriptionId === undefined
          ? 'sub_1'
          : overrides.subscriptionId,
      currency_code: 'USD',
      custom_data:
        overrides.customData === undefined
          ? { companyId: 'company-1', plan: 'PRO' }
          : overrides.customData,
      billing_period: {
        starts_at: '2026-10-01T00:00:00Z',
        ends_at: '2026-11-01T00:00:00Z',
      },
      details: { totals: { grand_total: '7875' } },
      payments: [{ status: 'error' }, { status: 'error' }],
    },
  };
}

// Shapes copied from sandbox payloads; ids replaced.
const unitTotals = (subtotal: string, total: string) => ({
  subtotal,
  total,
  tax: String(Number(total) - Number(subtotal)),
  discount: '0',
});
const proration = {
  rate: '0.99904',
  billing_period: {
    starts_at: '2026-10-01T19:29:40.387Z',
    ends_at: '2026-11-01T18:46:53.070625Z',
  },
};
const txnItem = (
  priceId: string,
  kind: string,
  quantity: number,
  prorated = false,
) => ({
  quantity,
  proration: prorated ? proration : null,
  price: { id: priceId, custom_data: { kind, currency: 'usd' } },
});
const txnLine = (
  priceId: string,
  quantity: number,
  subtotal: string,
  total: string,
  prorated = false,
) => ({
  price_id: priceId,
  quantity,
  proration: prorated ? proration : null,
  unit_totals: unitTotals(subtotal, total),
});

function completedTransaction(data: {
  currency?: string;
  origin: string;
  totals: Record<string, string>;
  items: unknown[];
  lineItems: unknown[];
}): Record<string, unknown> {
  return {
    event_id: 'evt_txn_1',
    event_type: 'transaction.completed',
    occurred_at: '2026-10-01T19:29:42.235557Z',
    data: {
      id: 'txn_1',
      status: 'completed',
      origin: data.origin,
      customer_id: 'ctm_1',
      subscription_id: 'sub_1',
      currency_code: data.currency ?? 'USD',
      custom_data: { companyId: 'company-1' },
      billing_period: {
        starts_at: '2026-10-01T18:46:53.070625Z',
        ends_at: '2026-11-01T18:46:53.070625Z',
      },
      items: data.items,
      details: {
        totals: {
          fee: '0',
          discount: '0',
          balance: '0',
          ...data.totals,
          currency_code: data.currency ?? 'USD',
        },
        line_items: data.lineItems,
      },
      payments: [],
    },
  };
}

const firstCharge = completedTransaction({
  origin: 'api',
  totals: {
    subtotal: '2381',
    tax: '119',
    total: '2500',
    credit: '0',
    credit_to_balance: '0',
    grand_total: '2500',
  },
  items: [txnItem('pri_seat', 'SEAT', 1)],
  lineItems: [txnLine('pri_seat', 1, '2381', '2500')],
});

const paidFromCredit = completedTransaction({
  origin: 'subscription_update',
  totals: {
    subtotal: '2379',
    tax: '119',
    total: '2498',
    credit: '2498',
    credit_to_balance: '0',
    grand_total: '0',
  },
  items: [txnItem('pri_seat', 'SEAT', 1, true)],
  lineItems: [txnLine('pri_seat', 1, '2379', '2498', true)],
});

const creditIssued = completedTransaction({
  origin: 'subscription_update',
  totals: {
    subtotal: '-2381',
    tax: '-119',
    total: '-2500',
    credit: '0',
    credit_to_balance: '2500',
    grand_total: '0',
  },
  items: [txnItem('pri_seat', 'SEAT', -1, true)],
  lineItems: [txnLine('pri_seat', -1, '2381', '2500', true)],
});

// PRO to ENTERPRISE: prorated base added, one prorated seat released into it.
const planSwitch = completedTransaction({
  origin: 'subscription_update',
  totals: {
    subtotal: '21428',
    tax: '1071',
    total: '22499',
    credit: '0',
    credit_to_balance: '0',
    grand_total: '22499',
  },
  items: [
    txnItem('pri_base', 'ENTERPRISE_BASE', 1, true),
    txnItem('pri_seat', 'SEAT', -1, true),
  ],
  lineItems: [
    txnLine('pri_base', 1, '23809', '24999', true),
    txnLine('pri_seat', -1, '2381', '2500', true),
  ],
});

// Country override buyer charged in EUR on the USD seat price.
const overrideCharge = completedTransaction({
  currency: 'EUR',
  origin: 'api',
  totals: {
    subtotal: '900',
    tax: '162',
    total: '1062',
    credit: '0',
    credit_to_balance: '0',
    grand_total: '1062',
  },
  items: [txnItem('pri_seat', 'SEAT', 1)],
  lineItems: [txnLine('pri_seat', 1, '900', '1062')],
});

// Payment method change: the provider zeroes every item and total.
const paymentMethodChange = completedTransaction({
  origin: 'subscription_payment_method_change',
  totals: {
    subtotal: '0',
    tax: '0',
    total: '0',
    credit: '0',
    credit_to_balance: '0',
    grand_total: '0',
  },
  items: [txnItem('pri_seat', 'SEAT', 2)],
  lineItems: [txnLine('pri_seat', 2, '0', '0')],
});

describe('PaddleBillingProvider webhook parsing', () => {
  let provider: PaddleBillingProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new PaddleBillingProvider({
      get: jest.fn().mockReturnValue('sandbox'),
      getOrThrow: jest.fn((key: string) =>
        key === 'PADDLE_WEBHOOK_SECRET' ? SECRET : 'key',
      ),
    } as unknown as ConfigService);
  });

  async function parse(event: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify(event));
    return provider.parseWebhook(body, sign(body, nowSeconds()));
  }

  describe('signature verification', () => {
    const body = Buffer.from('{"event_id":"evt_1"}');

    it('accepts a valid fresh signature', () => {
      expect(() =>
        verifyPaddleSignature(body, sign(body, nowSeconds()), SECRET),
      ).not.toThrow();
    });

    it('accepts any matching h1 while a secret is rotated', () => {
      const ts = nowSeconds();
      const header = `ts=${ts};h1=${'0'.repeat(64)};h1=${sign(body, ts).split('h1=')[1]}`;
      expect(() => verifyPaddleSignature(body, header, SECRET)).not.toThrow();
    });

    it('rejects a signature made with another secret', () => {
      expect(() =>
        verifyPaddleSignature(body, sign(body, nowSeconds(), 'other'), SECRET),
      ).toThrow('does not match');
    });

    it('rejects a tampered body', () => {
      const header = sign(body, nowSeconds());
      expect(() =>
        verifyPaddleSignature(
          Buffer.from('{"event_id":"evt_2"}'),
          header,
          SECRET,
        ),
      ).toThrow('does not match');
    });

    it('rejects a timestamp older than five minutes', () => {
      const ts = nowSeconds() - 301;
      expect(() => verifyPaddleSignature(body, sign(body, ts), SECRET)).toThrow(
        'outside the tolerance',
      );
    });

    it('accepts a timestamp just inside five minutes', () => {
      const ts = nowSeconds() - 290;
      expect(() =>
        verifyPaddleSignature(body, sign(body, ts), SECRET),
      ).not.toThrow();
    });

    it('rejects a malformed header', () => {
      expect(() => verifyPaddleSignature(body, 'h1=abc', SECRET)).toThrow(
        'Malformed',
      );
      expect(() => verifyPaddleSignature(body, 'ts=1', SECRET)).toThrow(
        'Malformed',
      );
    });

    it('rejects a non-hex h1 without throwing a length error', () => {
      const header = `ts=${nowSeconds()};h1=zz`;
      expect(() => verifyPaddleSignature(body, header, SECRET)).toThrow(
        'does not match',
      );
    });

    it.each(['', '   '])(
      'parseWebhook refuses an empty webhook secret (%j) before any signature check',
      async (blank) => {
        const blankSecret = new PaddleBillingProvider({
          get: jest.fn().mockReturnValue('sandbox'),
          getOrThrow: jest.fn((key: string) =>
            key === 'PADDLE_WEBHOOK_SECRET' ? blank : 'key',
          ),
        } as unknown as ConfigService);
        await expect(
          blankSecret.parseWebhook(body, sign(body, nowSeconds(), blank)),
        ).rejects.toThrow('PADDLE_WEBHOOK_SECRET is empty');
      },
    );

    it('parseWebhook accepts a body signed with the configured secret', async () => {
      const signed = Buffer.from(JSON.stringify(subscriptionEvent()));
      await expect(
        provider.parseWebhook(signed, sign(signed, nowSeconds())),
      ).resolves.toMatchObject({ providerEventId: expect.any(String) });
    });

    it('parseWebhook rejects a bad signature before reading the body', async () => {
      await expect(
        provider.parseWebhook(body, `ts=${nowSeconds()};h1=${'0'.repeat(64)}`),
      ).rejects.toThrow('does not match');
    });
  });

  it('returns the event id, type and raw payload', async () => {
    const event = subscriptionEvent();
    const parsed = await parse(event);
    expect(parsed.providerEventId).toBe('evt_sub_1');
    expect(parsed.providerEventType).toBe('subscription.updated');
    expect(parsed.payload).toEqual(event);
  });

  describe('subscription events', () => {
    it('subscription.created (active) emits SubscriptionActivated', async () => {
      const parsed = await parse(
        subscriptionEvent({ type: 'subscription.created' }),
      );
      expect(parsed.events).toEqual([
        {
          name: 'SubscriptionActivated',
          companyId: 'company-1',
          customerId: 'ctm_1',
          subscriptionId: 'sub_1',
          occurredAt: new Date('2026-10-01T10:00:00.000Z'),
          plan: 'PRO',
          quantity: 3,
          status: 'active',
          currency: 'usd',
          currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
        },
      ]);
    });

    it('subscription.created that is not active emits nothing', async () => {
      const parsed = await parse(
        subscriptionEvent({ type: 'subscription.created', status: 'paused' }),
      );
      expect(parsed.events).toEqual([]);
    });

    it('ENTERPRISE counts the base seat on top of the seat line', async () => {
      const parsed = await parse(
        subscriptionEvent({
          type: 'subscription.created',
          items: [baseItem, seatItem(2)],
          customData: { companyId: 'company-1', plan: 'ENTERPRISE' },
        }),
      );
      expect(parsed.events[0]).toMatchObject({
        name: 'SubscriptionActivated',
        plan: 'ENTERPRISE',
        quantity: 3,
      });
    });

    it('subscription.updated emits updated, seat and plan events', async () => {
      const parsed = await parse(
        subscriptionEvent({
          items: [baseItem],
          customData: { companyId: 'company-1', plan: 'ENTERPRISE' },
        }),
      );
      expect(parsed.events.map((e) => e.name)).toEqual([
        'SubscriptionUpdated',
        'SeatQuantityChanged',
        'PlanChanged',
      ]);
      expect(parsed.events[0]).toMatchObject({
        plan: 'ENTERPRISE',
        quantity: 1,
        status: 'active',
      });
      expect(parsed.events[1]).toMatchObject({ quantity: 1 });
      expect(parsed.events[2]).toMatchObject({
        plan: 'ENTERPRISE',
        quantity: 1,
      });
    });

    it.each(['subscription.activated', 'subscription.past_due'])(
      '%s is treated as an update',
      async (type) => {
        const parsed = await parse(
          subscriptionEvent({
            type,
            status: type === 'subscription.past_due' ? 'past_due' : 'active',
          }),
        );
        expect(parsed.events[0]).toMatchObject({
          name: 'SubscriptionUpdated',
          status: type === 'subscription.past_due' ? 'past_due' : 'active',
        });
      },
    );

    it('subscription.canceled emits SubscriptionCanceled', async () => {
      const parsed = await parse(
        subscriptionEvent({
          type: 'subscription.canceled',
          status: 'canceled',
          canceledAt: '2026-11-01T00:00:00Z',
        }),
      );
      expect(parsed.events).toEqual([
        {
          name: 'SubscriptionCanceled',
          companyId: 'company-1',
          customerId: 'ctm_1',
          subscriptionId: 'sub_1',
          occurredAt: new Date('2026-10-01T10:00:00.000Z'),
          endedAt: new Date('2026-11-01T00:00:00Z'),
        },
      ]);
    });

    it('a canceled status on subscription.updated never re-tiers', async () => {
      const parsed = await parse(subscriptionEvent({ status: 'canceled' }));
      expect(parsed.events.map((e) => e.name)).toEqual([
        'SubscriptionCanceled',
      ]);
    });

    it('falls back to the customer custom data for companyId', async () => {
      client.customers.get.mockResolvedValue({
        customData: { companyId: 'company-from-customer' },
      });
      const parsed = await parse(subscriptionEvent({ customData: null }));
      expect(client.customers.get).toHaveBeenCalledWith('ctm_1');
      expect(parsed.events[0].companyId).toBe('company-from-customer');
    });

    it('emits nothing when companyId cannot be resolved', async () => {
      client.customers.get.mockRejectedValue(new Error('not found'));
      const parsed = await parse(subscriptionEvent({ customData: null }));
      expect(parsed.events).toEqual([]);
    });
  });

  describe('transaction events', () => {
    it('transaction.completed emits PaymentSucceeded', async () => {
      const parsed = await parse(transactionEvent('transaction.completed'));
      expect(parsed.events).toEqual([
        {
          name: 'PaymentSucceeded',
          companyId: 'company-1',
          customerId: 'ctm_1',
          subscriptionId: 'sub_1',
          occurredAt: new Date('2026-10-01T10:00:00.000Z'),
          hostedInvoiceUrl: null,
          invoicePdfUrl: null,
          periodStart: new Date('2026-10-01T00:00:00Z'),
          periodEnd: new Date('2026-11-01T00:00:00Z'),
          amount: 7875,
          currency: 'usd',
          invoiceId: 'txn_1',
          creditApplied: 0,
          creditIssued: 0,
          origin: null,
          settledWithoutCharge: false,
          chargedUnitAmounts: [],
        },
      ]);
    });

    it('a full-period charge carries its credits, origin and unit amounts', async () => {
      const parsed = await parse(firstCharge);
      expect(parsed.events).toEqual([
        {
          name: 'PaymentSucceeded',
          companyId: 'company-1',
          customerId: 'ctm_1',
          subscriptionId: 'sub_1',
          occurredAt: new Date('2026-10-01T19:29:42.235557Z'),
          hostedInvoiceUrl: null,
          invoicePdfUrl: null,
          periodStart: new Date('2026-10-01T18:46:53.070625Z'),
          periodEnd: new Date('2026-11-01T18:46:53.070625Z'),
          amount: 2500,
          currency: 'usd',
          invoiceId: 'txn_1',
          creditApplied: 0,
          creditIssued: 0,
          origin: 'api',
          settledWithoutCharge: false,
          chargedUnitAmounts: [{ kind: 'SEAT', net: 2381, gross: 2500 }],
        },
      ]);
    });

    it('an invoice paid from credit is emitted as settled without charge', async () => {
      const parsed = await parse(paidFromCredit);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0]).toMatchObject({
        name: 'PaymentSucceeded',
        amount: 0,
        creditApplied: 2498,
        creditIssued: 0,
        origin: 'subscription_update',
        settledWithoutCharge: true,
        // Prorated line: never sets the stored price.
        chargedUnitAmounts: [],
      });
    });

    it('a change that issues credit is emitted as settled without charge', async () => {
      const parsed = await parse(creditIssued);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0]).toMatchObject({
        name: 'PaymentSucceeded',
        amount: 0,
        creditApplied: 0,
        creditIssued: 2500,
        settledWithoutCharge: true,
        chargedUnitAmounts: [],
      });
    });

    it('a payment method change is settled without charge and sets no unit amount', async () => {
      const parsed = await parse(paymentMethodChange);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0]).toMatchObject({
        name: 'PaymentSucceeded',
        amount: 0,
        creditApplied: 0,
        creditIssued: 0,
        origin: 'subscription_payment_method_change',
        settledWithoutCharge: true,
        chargedUnitAmounts: [],
      });
    });

    it('a prorated plan switch is a charge that sets no unit amount', async () => {
      const parsed = await parse(planSwitch);
      expect(parsed.events[0]).toMatchObject({
        name: 'PaymentSucceeded',
        amount: 22499,
        settledWithoutCharge: false,
        chargedUnitAmounts: [],
      });
    });

    it('an override buyer stores the amount charged in the transaction currency', async () => {
      const parsed = await parse(overrideCharge);
      expect(parsed.events[0]).toMatchObject({
        name: 'PaymentSucceeded',
        amount: 1062,
        currency: 'eur',
        chargedUnitAmounts: [{ kind: 'SEAT', net: 900, gross: 1062 }],
      });
    });

    it('transaction.payment_failed emits PaymentFailed with the attempt count', async () => {
      const parsed = await parse(
        transactionEvent('transaction.payment_failed'),
      );
      expect(parsed.events[0]).toMatchObject({
        name: 'PaymentFailed',
        amount: 7875,
        invoiceId: 'txn_1',
        attemptCount: 2,
      });
      expect(parsed.events[0]).not.toHaveProperty('settledWithoutCharge');
      expect(parsed.events[0]).not.toHaveProperty('chargedUnitAmounts');
    });

    it('a transaction without a subscription emits nothing', async () => {
      const parsed = await parse(
        transactionEvent('transaction.payment_failed', {
          subscriptionId: null,
        }),
      );
      expect(parsed.events).toEqual([]);
    });
  });

  it('unknown events are returned for recording with no normalised events', async () => {
    const parsed = await parse({
      event_id: 'evt_other',
      event_type: 'adjustment.created',
      occurred_at: '2026-10-01T10:00:00.000Z',
      data: { id: 'adj_1' },
    });
    expect(parsed.providerEventId).toBe('evt_other');
    expect(parsed.events).toEqual([]);
  });

  it('rejects a signed body without an event id', async () => {
    await expect(parse({ event_type: 'subscription.updated' })).rejects.toThrow(
      'no event_id',
    );
  });

  describe('chargedUnitAmounts', () => {
    it('reads base and seat from full-period lines by the price kind', () => {
      expect(
        chargedUnitAmounts({
          items: [
            txnItem('pri_base', 'ENTERPRISE_BASE', 1),
            txnItem('pri_seat', 'SEAT', 3),
          ],
          details: {
            line_items: [
              txnLine('pri_base', 1, '23809', '24999'),
              txnLine('pri_seat', 3, '2381', '2500'),
            ],
          },
        }),
      ).toEqual([
        { kind: 'ENTERPRISE_BASE', net: 23809, gross: 24999 },
        { kind: 'SEAT', net: 2381, gross: 2500 },
      ]);
    });

    it('keeps the full line when a renewal also carries a prorated catch-up line', () => {
      expect(
        chargedUnitAmounts({
          items: [txnItem('pri_seat', 'SEAT', 2)],
          details: {
            line_items: [
              txnLine('pri_seat', 1, '2379', '2498', true),
              txnLine('pri_seat', 2, '2381', '2500'),
            ],
          },
        }),
      ).toEqual([{ kind: 'SEAT', net: 2381, gross: 2500 }]);
    });

    it('ignores a line with a quantity below 1 even without a proration object', () => {
      expect(
        chargedUnitAmounts({
          items: [txnItem('pri_seat', 'SEAT', -1)],
          details: { line_items: [txnLine('pri_seat', -1, '2381', '2500')] },
        }),
      ).toEqual([]);
    });

    it('ignores a line whose unit total is zero', () => {
      expect(
        chargedUnitAmounts({
          items: [txnItem('pri_seat', 'SEAT', 2)],
          details: { line_items: [txnLine('pri_seat', 2, '0', '0')] },
        }),
      ).toEqual([]);
    });

    it('ignores a line whose price carries no known kind', () => {
      expect(
        chargedUnitAmounts({
          items: [txnItem('pri_other', 'ADDON', 1)],
          details: { line_items: [txnLine('pri_other', 1, '100', '119')] },
        }),
      ).toEqual([]);
    });
  });

  describe('deriveSubscriptionShape', () => {
    it('reads ENTERPRISE from the base line', () => {
      expect(
        deriveSubscriptionShape(
          [{ priceId: 'pri_base', kind: 'ENTERPRISE_BASE', quantity: 1 }],
          null,
        ),
      ).toEqual({ plan: 'ENTERPRISE', quantity: 1, currentPeriodEnd: null });
    });

    it('floors PRO at one seat', () => {
      expect(deriveSubscriptionShape([], null).quantity).toBe(1);
    });
  });

  it('ignores a custom_data plan that the lines do not pay for', async () => {
    const parsed = await parse(
      subscriptionEvent({
        type: 'subscription.created',
        items: [seatItem(1)],
        customData: { companyId: 'company-1', plan: 'ENTERPRISE' },
      }),
    );
    expect(parsed.events[0]).toMatchObject({
      name: 'SubscriptionActivated',
      plan: 'PRO',
      quantity: 1,
    });
  });

  it('ignores a custom_data PRO plan when the base line is paid', async () => {
    const parsed = await parse(
      subscriptionEvent({
        items: [baseItem, seatItem(1)],
        customData: { companyId: 'company-1', plan: 'PRO' },
      }),
    );
    expect(parsed.events[2]).toMatchObject({
      name: 'PlanChanged',
      plan: 'ENTERPRISE',
      quantity: 2,
    });
  });

  it('minorUnits only accepts integer strings', () => {
    expect(minorUnits('2500')).toBe(2500);
    expect(minorUnits('25.00')).toBeNull();
    expect(minorUnits(null)).toBeNull();
  });
});
