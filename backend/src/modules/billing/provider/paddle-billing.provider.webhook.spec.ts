import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  PaddleBillingProvider,
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
    it('transaction.completed with a $0 total emits nothing', async () => {
      const raw = transactionEvent('transaction.completed');
      (raw.data as { details: unknown }).details = {
        totals: { grand_total: '0' },
      };
      const parsed = await parse(raw);
      expect(parsed.events).toEqual([]);
    });

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
        },
      ]);
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
