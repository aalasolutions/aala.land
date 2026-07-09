import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  StripeBillingProvider,
  deriveSubscriptionShape,
  epochToDate,
  idOf,
} from './stripe-billing.provider';

interface MockStripe {
  webhooks: { constructEvent: jest.Mock };
  customers: { retrieve: jest.Mock };
}

describe('StripeBillingProvider webhook parsing', () => {
  let provider: StripeBillingProvider;
  let stripe: MockStripe;

  const rawBody = Buffer.from('{}');
  const signature = 't=1,v1=sig';

  const seatItem = {
    quantity: 3,
    current_period_end: 1782600000,
    price: { id: 'price_seat', metadata: { kind: 'SEAT' } },
  };
  const baseItem = {
    quantity: 1,
    price: { id: 'price_base', metadata: { kind: 'ENTERPRISE_BASE' } },
  };

  function subscriptionEvent(
    overrides: {
      type?: string;
      status?: string;
      previous?: Record<string, unknown>;
      items?: unknown[];
      metadata?: Record<string, string> | null;
      endedAt?: number;
    } = {},
  ): Record<string, unknown> {
    return {
      id: 'evt_sub_1',
      type: overrides.type ?? 'customer.subscription.updated',
      created: 1780000000,
      data: {
        object: {
          id: 'sub_1',
          status: overrides.status ?? 'active',
          customer: 'cus_1',
          metadata:
            overrides.metadata === undefined
              ? { companyId: 'company-uuid-1' }
              : overrides.metadata,
          items: { data: overrides.items ?? [seatItem] },
          ended_at: overrides.endedAt ?? null,
        },
        previous_attributes: overrides.previous,
      },
    };
  }

  function invoiceEvent(type: string): Record<string, unknown> {
    return {
      id: 'evt_inv_1',
      type,
      created: 1780000000,
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          currency: 'usd',
          amount_paid: 7500,
          amount_due: 7500,
          attempt_count: 2,
          subscription: 'sub_1',
          subscription_details: { metadata: { companyId: 'company-uuid-1' } },
        },
      },
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeBillingProvider,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) =>
              key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : 'sk_test_dummy',
            ),
          },
        },
      ],
    }).compile();

    provider = module.get(StripeBillingProvider);
    stripe = {
      webhooks: { constructEvent: jest.fn() },
      customers: { retrieve: jest.fn() },
    };
    (provider as unknown as { stripe: MockStripe }).stripe = stripe;
  });

  it('verifies the signature with the webhook secret and returns the event envelope', async () => {
    const event = subscriptionEvent();
    stripe.webhooks.constructEvent.mockReturnValue(event);

    const parsed = await provider.parseWebhook(rawBody, signature);

    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      rawBody,
      signature,
      'whsec_test',
    );
    expect(parsed.providerEventId).toBe('evt_sub_1');
    expect(parsed.providerEventType).toBe('customer.subscription.updated');
    expect(parsed.payload).toBe(event);
  });

  it('throws when the signature does not verify', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error(
        'No signatures found matching the expected signature for payload',
      );
    });
    await expect(provider.parseWebhook(rawBody, signature)).rejects.toThrow(
      'No signatures found',
    );
  });

  it('normalizes an active subscription.created into SubscriptionActivated', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        type: 'customer.subscription.created',
        status: 'active',
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      name: 'SubscriptionActivated',
      companyId: 'company-uuid-1',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      plan: 'PRO',
      quantity: 3,
      status: 'active',
    });
  });

  it('emits nothing for an incomplete subscription.created', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        type: 'customer.subscription.created',
        status: 'incomplete',
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events).toEqual([]);
  });

  it('normalizes a transition into active on subscription.updated as SubscriptionActivated', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        status: 'active',
        previous: { status: 'incomplete' },
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events.map((e) => e.name)).toEqual(['SubscriptionActivated']);
  });

  it('normalizes a pure status update into SubscriptionUpdated only (no items change)', async () => {
    // trialing -> active is not a "became active" transition: both are
    // already active-like statuses (ACTIVE_SUBSCRIPTION_STATUSES).
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({ previous: { status: 'trialing' } }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events.map((e) => e.name)).toEqual(['SubscriptionUpdated']);
  });

  it('emits both SeatQuantityChanged and PlanChanged when previous items are present but not fully resolvable', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({ previous: { items: {} } }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events.map((e) => e.name)).toEqual([
      'SubscriptionUpdated',
      'SeatQuantityChanged',
      'PlanChanged',
    ]);
  });

  it('emits SeatQuantityChanged only when the previous seat quantity actually differs', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        previous: { items: { data: [{ ...seatItem, quantity: 2 }] } },
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events.map((e) => e.name)).toEqual([
      'SubscriptionUpdated',
      'SeatQuantityChanged',
    ]);
  });

  it('emits PlanChanged only when the previous plan actually differs', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        items: [baseItem, seatItem],
        previous: { items: { data: [seatItem] } },
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events.map((e) => e.name)).toEqual([
      'SubscriptionUpdated',
      'PlanChanged',
    ]);
  });

  it('suppresses both when previous items resolve to the same plan and quantity (e.g. price rotation)', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        previous: {
          items: {
            data: [
              {
                ...seatItem,
                price: { id: 'price_seat_old', metadata: { kind: 'SEAT' } },
              },
            ],
          },
        },
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events.map((e) => e.name)).toEqual(['SubscriptionUpdated']);
  });

  it('detects the ENTERPRISE plan from an ENTERPRISE_BASE line item', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({ items: [baseItem, seatItem] }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events[0]).toMatchObject({ plan: 'ENTERPRISE', quantity: 3 });
  });

  it('normalizes subscription.deleted into SubscriptionCanceled with endedAt', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({
        type: 'customer.subscription.deleted',
        status: 'canceled',
        endedAt: 1780000500,
      }),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      name: 'SubscriptionCanceled',
      endedAt: new Date(1780000500 * 1000),
    });
  });

  it('normalizes invoice.payment_failed into PaymentFailed', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      invoiceEvent('invoice.payment_failed'),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      name: 'PaymentFailed',
      amount: 7500,
      currency: 'usd',
      invoiceId: 'in_1',
      attemptCount: 2,
      subscriptionId: 'sub_1',
    });
  });

  it('normalizes invoice.paid into PaymentSucceeded', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      invoiceEvent('invoice.paid'),
    );
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events[0]).toMatchObject({
      name: 'PaymentSucceeded',
      amount: 7500,
    });
  });

  it('returns zero events for an unrelated event type', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_x',
      type: 'charge.refunded',
      created: 1780000000,
      data: { object: {} },
    });
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events).toEqual([]);
  });

  it('falls back to the customer metadata lookup when subscription metadata is empty', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({ metadata: null }),
    );
    stripe.customers.retrieve.mockResolvedValue({
      id: 'cus_1',
      metadata: { companyId: 'company-uuid-1' },
    });
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith('cus_1');
    expect(parsed.events[0]).toMatchObject({ companyId: 'company-uuid-1' });
  });

  it('emits zero events when companyId cannot be resolved', async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      subscriptionEvent({ metadata: null }),
    );
    stripe.customers.retrieve.mockResolvedValue({ id: 'cus_1', metadata: {} });
    const parsed = await provider.parseWebhook(rawBody, signature);
    expect(parsed.events).toEqual([]);
  });
});

describe('normalizer helpers', () => {
  it('idOf handles string refs, object refs, and null', () => {
    expect(idOf('cus_1')).toBe('cus_1');
    expect(idOf({ id: 'cus_2' })).toBe('cus_2');
    expect(idOf(null)).toBeNull();
    expect(idOf(undefined)).toBeNull();
  });

  it('epochToDate converts epoch seconds and rejects non-numbers', () => {
    expect(epochToDate(1780000000)).toEqual(new Date(1780000000 * 1000));
    expect(epochToDate(null)).toBeNull();
    expect(epochToDate(undefined)).toBeNull();
  });

  it('deriveSubscriptionShape falls back to PRO and quantity 1 on metadata-less items', () => {
    const shape = deriveSubscriptionShape({
      id: 'sub_x',
      status: 'active',
      customer: 'cus_1',
      items: { data: [{ quantity: undefined, price: { id: 'price_x' } }] },
    });
    expect(shape.plan).toBe('PRO');
    expect(shape.quantity).toBe(1);
  });
});
