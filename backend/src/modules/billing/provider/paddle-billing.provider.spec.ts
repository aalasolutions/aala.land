import {
  BadRequestException,
  ConflictException,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, Environment, Paddle } from '@paddle/paddle-node-sdk';
import {
  PaddleBillingProvider,
  allocateRefund,
  refundReferenceOf,
  refundStateOf,
} from './paddle-billing.provider';

const client = {
  customers: {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    getCreditBalance: jest.fn(),
  },
  products: { list: jest.fn(), create: jest.fn() },
  prices: { create: jest.fn(), archive: jest.fn() },
  transactions: { create: jest.fn(), get: jest.fn(), list: jest.fn() },
  subscriptions: { get: jest.fn(), update: jest.fn(), cancel: jest.fn() },
  adjustments: { create: jest.fn(), list: jest.fn() },
};

jest.mock('@paddle/paddle-node-sdk', () => {
  const actual = jest.requireActual('@paddle/paddle-node-sdk');
  return {
    ...actual,
    Paddle: jest.fn().mockImplementation(() => client),
  };
});

function configWith(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

function collection<T>(items: T[]) {
  return { next: jest.fn().mockResolvedValue(items) };
}

function seatLine(quantity: number, priceId = 'pri_seat') {
  return { quantity, price: { id: priceId, customData: { kind: 'SEAT' } } };
}

function baseLine(priceId = 'pri_base') {
  return {
    quantity: 1,
    price: { id: priceId, customData: { kind: 'ENTERPRISE_BASE' } },
  };
}

function subscription(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    items,
    customData: { companyId: 'company-1', plan: 'PRO' },
    scheduledChange: null,
    currentBillingPeriod: {
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-11-01T00:00:00Z',
    },
    ...extra,
  };
}

const ref = { subscriptionId: 'sub_1', customerId: 'ctm_1' };

describe('PaddleBillingProvider', () => {
  let provider: PaddleBillingProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new PaddleBillingProvider(
      configWith({ PADDLE_API_KEY: 'key', PADDLE_ENVIRONMENT: 'sandbox' }),
    );
  });

  describe('client construction', () => {
    it('uses the sandbox environment by default', () => {
      new PaddleBillingProvider(configWith({ PADDLE_API_KEY: 'key' }));
      expect(Paddle).toHaveBeenLastCalledWith('key', {
        environment: Environment.sandbox,
      });
    });

    it('uses the sandbox environment when the value is blank', () => {
      new PaddleBillingProvider(
        configWith({ PADDLE_API_KEY: 'key', PADDLE_ENVIRONMENT: '  ' }),
      );
      expect(Paddle).toHaveBeenLastCalledWith('key', {
        environment: Environment.sandbox,
      });
    });

    it('uses the production environment when configured', () => {
      new PaddleBillingProvider(
        configWith({ PADDLE_API_KEY: 'key', PADDLE_ENVIRONMENT: 'production' }),
      );
      expect(Paddle).toHaveBeenLastCalledWith('key', {
        environment: Environment.production,
      });
    });

    it('rejects an unknown environment', () => {
      expect(
        () =>
          new PaddleBillingProvider(
            configWith({ PADDLE_API_KEY: 'key', PADDLE_ENVIRONMENT: 'live' }),
          ),
      ).toThrow('Unsupported PADDLE_ENVIRONMENT');
    });

    it('requires the API key', () => {
      expect(() => new PaddleBillingProvider(configWith({}))).toThrow(
        'Missing PADDLE_API_KEY',
      );
    });

    it('names itself and its signature header', () => {
      expect(provider.name).toBe('paddle');
      expect(provider.signatureHeader).toBe('paddle-signature');
    });
  });

  describe('ensureCustomer', () => {
    const input = {
      companyId: 'company-1',
      companyName: 'Acme',
      email: 'admin@example.com',
    };

    it('creates a customer with the email and companyId in custom data', async () => {
      client.customers.create.mockResolvedValue({ id: 'ctm_new' });
      await expect(provider.ensureCustomer(input)).resolves.toBe('ctm_new');
      expect(client.customers.create).toHaveBeenCalledWith({
        email: 'admin@example.com',
        name: 'Acme',
        customData: { companyId: 'company-1' },
      });
    });

    it('refuses to create a customer without an email', async () => {
      await expect(
        provider.ensureCustomer({ ...input, email: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.customers.create).not.toHaveBeenCalled();
    });

    it('reuses the customer named in an email conflict', async () => {
      client.customers.create.mockRejectedValue(
        new ApiError(
          {
            type: 'request_error',
            code: 'customer_already_exists',
            detail:
              'customer email conflicts with customer of id ctm_01existing',
            documentation_url: '',
          },
          null,
        ),
      );
      client.customers.get.mockResolvedValue({
        id: 'ctm_01existing',
        customData: { companyId: 'company-1' },
      });
      await expect(provider.ensureCustomer(input)).resolves.toBe(
        'ctm_01existing',
      );
      expect(client.customers.get).toHaveBeenCalledWith('ctm_01existing');
      expect(client.customers.list).not.toHaveBeenCalled();
    });

    it('refuses an existing customer that belongs to another company', async () => {
      client.customers.create.mockRejectedValue(
        new ApiError(
          {
            type: 'request_error',
            code: 'customer_already_exists',
            detail:
              'customer email conflicts with customer of id ctm_01existing',
            documentation_url: '',
          },
          null,
        ),
      );
      client.customers.get.mockResolvedValue({
        id: 'ctm_01existing',
        customData: { companyId: 'company-2' },
      });
      await expect(provider.ensureCustomer(input)).rejects.toThrow(
        new ConflictException(
          'This billing email already belongs to another billing account.',
        ),
      );
    });

    it('refuses an existing customer with no company in custom data', async () => {
      client.customers.create.mockRejectedValue(
        new ApiError(
          {
            type: 'request_error',
            code: 'customer_already_exists',
            detail: 'customer already exists',
            documentation_url: '',
          },
          null,
        ),
      );
      client.customers.list.mockReturnValue(collection([{ id: 'ctm_found' }]));
      client.customers.get.mockResolvedValue({
        id: 'ctm_found',
        customData: null,
      });
      await expect(provider.ensureCustomer(input)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('looks the customer up by email when the conflict names no id', async () => {
      client.customers.create.mockRejectedValue(
        new ApiError(
          {
            type: 'request_error',
            code: 'customer_already_exists',
            detail: 'customer already exists',
            documentation_url: '',
          },
          null,
        ),
      );
      client.customers.list.mockReturnValue(collection([{ id: 'ctm_found' }]));
      client.customers.get.mockResolvedValue({
        id: 'ctm_found',
        customData: { companyId: 'company-1' },
      });
      await expect(provider.ensureCustomer(input)).resolves.toBe('ctm_found');
      expect(client.customers.list).toHaveBeenCalledWith({
        email: ['admin@example.com'],
      });
    });

    it('rethrows any other error', async () => {
      client.customers.create.mockRejectedValue(new Error('boom'));
      await expect(provider.ensureCustomer(input)).rejects.toThrow('boom');
    });
  });

  describe('ensurePrice', () => {
    beforeEach(() => {
      client.products.list.mockReturnValue(collection([]));
      client.products.create.mockResolvedValue({ id: 'pro_1' });
      client.prices.create.mockResolvedValue({ id: 'pri_new' });
    });

    it('creates a monthly seat price with an open quantity range', async () => {
      await expect(provider.ensurePrice('SEAT', 'usd', 2500)).resolves.toBe(
        'pri_new',
      );
      expect(client.products.create).toHaveBeenCalledWith({
        name: 'AALA.LAND Subscription',
        taxCategory: 'saas',
        customData: { aala_product: 'subscription' },
      });
      expect(client.prices.create).toHaveBeenCalledWith({
        productId: 'pro_1',
        description: 'SEAT monthly',
        unitPrice: { amount: '2500', currencyCode: 'USD' },
        billingCycle: { interval: 'month', frequency: 1 },
        quantity: { minimum: 1, maximum: 10000 },
        unitPriceOverrides: [],
        customData: { kind: 'SEAT', currency: 'usd' },
        taxMode: 'internal',
      });
    });

    it('fixes the base price quantity at 1 and carries country overrides', async () => {
      await provider.ensurePrice('ENTERPRISE_BASE', 'usd', 25000, [
        { countryCodes: ['pk', 'IN'], currency: 'usd', unitAmount: 10000 },
      ]);
      expect(client.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: { minimum: 1, maximum: 1 },
          unitPriceOverrides: [
            {
              countryCodes: ['PK', 'IN'],
              unitPrice: { amount: '10000', currencyCode: 'USD' },
            },
          ],
        }),
      );
    });

    it('includes tax in the amount by default and adds it on top when told to', async () => {
      await provider.ensurePrice('SEAT', 'usd', 2500, []);
      expect(client.prices.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ taxMode: 'internal' }),
      );

      await provider.ensurePrice('SEAT', 'usd', 2500, [], false);
      expect(client.prices.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ taxMode: 'external' }),
      );
    });

    it('reuses an existing product and caches it', async () => {
      client.products.list.mockReturnValue(
        collection([
          { id: 'pro_other', customData: null },
          { id: 'pro_aala', customData: { aala_product: 'subscription' } },
        ]),
      );
      await provider.ensurePrice('SEAT', 'usd', 2500);
      await provider.ensurePrice('ENTERPRISE_BASE', 'usd', 25000);
      expect(client.products.list).toHaveBeenCalledTimes(1);
      expect(client.products.create).not.toHaveBeenCalled();
      expect(client.prices.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ productId: 'pro_aala' }),
      );
    });
  });

  describe('archivePrice', () => {
    it('archives the price', async () => {
      client.prices.archive.mockResolvedValue({ id: 'pri_old' });
      await provider.archivePrice('pri_old');
      expect(client.prices.archive).toHaveBeenCalledWith('pri_old');
    });
  });

  describe('createSubscription', () => {
    const base = {
      customerId: 'ctm_1',
      seatPriceId: 'pri_seat',
      successUrl: 'http://localhost:4200/billing/success',
      cancelUrl: 'http://localhost:4200/billing',
      companyId: 'company-1',
    };

    it('opens a PRO transaction with every seat on the seat line', async () => {
      client.transactions.create.mockResolvedValue({ id: 'txn_1' });
      await expect(
        provider.createSubscription({
          ...base,
          basePriceId: null,
          plan: 'PRO',
          quantity: 3,
        }),
      ).resolves.toEqual({
        checkoutUrl:
          'http://localhost:4200/checkout?_ptxn=txn_1' +
          '&success=http%3A%2F%2Flocalhost%3A4200%2Fbilling%2Fsuccess' +
          '&cancel=http%3A%2F%2Flocalhost%3A4200%2Fbilling',
        subscriptionId: null,
      });
      expect(client.transactions.create).toHaveBeenCalledWith({
        items: [{ priceId: 'pri_seat', quantity: 3 }],
        customerId: 'ctm_1',
        customData: { companyId: 'company-1' },
        collectionMode: 'automatic',
      });
    });

    it('builds the checkout link on the success URL origin from the transaction id', async () => {
      client.transactions.create.mockResolvedValue({ id: 'txn_3' });
      const result = await provider.createSubscription({
        ...base,
        successUrl: 'https://app.example.com/billing/success?from=upgrade',
        cancelUrl: 'https://app.example.com/billing/cancel',
        basePriceId: null,
        plan: 'PRO',
        quantity: 1,
      });
      const url = new URL(result.checkoutUrl);
      expect(url.origin + url.pathname).toBe(
        'https://app.example.com/checkout',
      );
      expect(url.searchParams.get('_ptxn')).toBe('txn_3');
      expect(url.searchParams.get('success')).toBe(
        'https://app.example.com/billing/success?from=upgrade',
      );
      expect(url.searchParams.get('cancel')).toBe(
        'https://app.example.com/billing/cancel',
      );
    });

    it('adds the base line for ENTERPRISE and omits a zero seat line', async () => {
      client.transactions.create.mockResolvedValue({ id: 'txn_2' });
      await provider.createSubscription({
        ...base,
        basePriceId: 'pri_base',
        plan: 'ENTERPRISE',
        quantity: 0,
      });
      expect(client.transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: 'pri_base', quantity: 1 }],
          customData: { companyId: 'company-1' },
        }),
      );
    });
  });

  describe('getSeatQuantity', () => {
    it('reads the live seat line', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([baseLine(), seatLine(4)]),
      );
      await expect(provider.getSeatQuantity(ref)).resolves.toBe(4);
    });

    it('returns 0 for a solo ENTERPRISE without a seat line', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([baseLine()]));
      await expect(provider.getSeatQuantity(ref)).resolves.toBe(0);
    });
  });

  describe('updateSeatQuantity', () => {
    it('sends the full item list with the new seat quantity, charged from the next period', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([baseLine(), seatLine(2)]),
      );
      await provider.updateSeatQuantity(ref, 3, 'pri_seat_new');
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        items: [
          { priceId: 'pri_base', quantity: 1 },
          { priceId: 'pri_seat', quantity: 3 },
        ],
        prorationBillingMode: 'prorated_next_billing_period',
      });
    });

    it('settles the seat change at once when asked', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([baseLine(), seatLine(3)]),
      );
      await provider.updateSeatQuantity(ref, 1, undefined, true);
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        items: [
          { priceId: 'pri_base', quantity: 1 },
          { priceId: 'pri_seat', quantity: 1 },
        ],
        prorationBillingMode: 'prorated_immediately',
      });
    });

    it('removes the seat line at 0', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([baseLine(), seatLine(1)]),
      );
      await provider.updateSeatQuantity(ref, 0);
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        items: [{ priceId: 'pri_base', quantity: 1 }],
        prorationBillingMode: 'prorated_next_billing_period',
      });
    });

    it('does nothing at 0 when there is no seat line', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([baseLine()]));
      await provider.updateSeatQuantity(ref, 0);
      expect(client.subscriptions.update).not.toHaveBeenCalled();
    });

    it('adds the seat line on a solo ENTERPRISE', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([baseLine()]));
      await provider.updateSeatQuantity(ref, 1, 'pri_seat');
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        items: [
          { priceId: 'pri_base', quantity: 1 },
          { priceId: 'pri_seat', quantity: 1 },
        ],
        prorationBillingMode: 'prorated_next_billing_period',
      });
    });

    it('throws when a seat line must be added without a price id', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([baseLine()]));
      await expect(provider.updateSeatQuantity(ref, 1)).rejects.toThrow(
        'no existing SEAT item and no seat price id supplied',
      );
    });
  });

  describe('changePlan', () => {
    const input = {
      ...ref,
      seatPriceId: 'pri_seat',
    };

    it('PRO to ENTERPRISE adds the base and moves one seat into it, prorated immediately', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([seatLine(3)], {
          customData: { companyId: 'company-1', plan: 'PRO' },
        }),
      );
      await provider.changePlan({
        ...input,
        plan: 'ENTERPRISE',
        basePriceId: 'pri_base',
      });
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        items: [
          { priceId: 'pri_seat', quantity: 2 },
          { priceId: 'pri_base', quantity: 1 },
        ],
        prorationBillingMode: 'prorated_immediately',
      });
    });

    it('solo PRO to ENTERPRISE drops the seat line', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([seatLine(1)]));
      await provider.changePlan({
        ...input,
        plan: 'ENTERPRISE',
        basePriceId: 'pri_base',
      });
      expect(client.subscriptions.update).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({
          items: [{ priceId: 'pri_base', quantity: 1 }],
        }),
      );
    });

    it('solo ENTERPRISE to PRO removes the base and bills one seat', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([baseLine()], {
          customData: { companyId: 'company-1', plan: 'ENTERPRISE' },
        }),
      );
      await provider.changePlan({ ...input, plan: 'PRO', basePriceId: null });
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        items: [{ priceId: 'pri_seat', quantity: 1 }],
        prorationBillingMode: 'prorated_immediately',
      });
    });

    it('throws on a subscription with no items', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([]));
      await expect(
        provider.changePlan({ ...input, plan: 'PRO', basePriceId: null }),
      ).rejects.toThrow('has no line items');
    });
  });

  describe('cancel, cancellation state and resume', () => {
    it('cancels at the next billing period', async () => {
      await provider.cancel(ref);
      expect(client.subscriptions.cancel).toHaveBeenCalledWith('sub_1', {
        effectiveFrom: 'next_billing_period',
      });
    });

    it('reports a scheduled cancel', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([seatLine(1)], {
          scheduledChange: {
            action: 'cancel',
            effectiveAt: '2026-11-01T00:00:00Z',
            resumeAt: null,
          },
        }),
      );
      await expect(provider.getCancellationState(ref)).resolves.toEqual({
        cancelAtPeriodEnd: true,
        cancelAt: new Date('2026-11-01T00:00:00Z'),
      });
    });

    it('reports no cancel and the period end otherwise', async () => {
      client.subscriptions.get.mockResolvedValue(subscription([seatLine(1)]));
      await expect(provider.getCancellationState(ref)).resolves.toEqual({
        cancelAtPeriodEnd: false,
        cancelAt: new Date('2026-11-01T00:00:00Z'),
      });
    });

    it('resumes by clearing the scheduled change', async () => {
      await provider.resume(ref);
      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        scheduledChange: null,
      });
    });
  });

  describe('immediate cancel and refund basis', () => {
    it('declares the immediate-cancel capability', () => {
      expect(provider.supportsImmediateCancel).toBe(true);
    });

    // Shape of the sandbox read: 2 seats held, 1 added and 2 removed this period.
    const withPreview = (extra: Record<string, unknown> = {}) =>
      subscription([seatLine(2)], {
        status: 'active',
        currencyCode: 'USD',
        startedAt: '2026-10-03T19:47:56.499213Z',
        currentBillingPeriod: {
          startsAt: '2026-10-03T19:47:56.499213Z',
          endsAt: '2026-11-03T19:47:56.499213Z',
        },
        nextTransaction: {
          details: {
            totals: { total: '2500' },
            lineItems: [],
          },
        },
        recurringTransactionDetails: {
          totals: { total: '5000' },
          lineItems: [
            {
              priceId: 'pri_seat',
              quantity: 2,
              unitTotals: { subtotal: '2381', total: '2500' },
            },
          ],
        },
        ...extra,
      });

    // Shape of the sandbox credit balance read for a customer with 50.00 held.
    const creditBalance = (available: string) => [
      {
        customerId: 'ctm_1',
        currencyCode: 'USD',
        balance: { available, reserved: '0', used: '0' },
      },
    ];

    it('reads the period, held lines, the pending next-bill difference and the credit balance', async () => {
      client.subscriptions.get.mockResolvedValue(withPreview());
      client.customers.getCreditBalance.mockResolvedValue(
        creditBalance('5000'),
      );
      await expect(provider.getRefundBasis(ref)).resolves.toEqual({
        startedAt: new Date('2026-10-03T19:47:56.499213Z'),
        periodStart: new Date('2026-10-03T19:47:56.499213Z'),
        periodEnd: new Date('2026-11-03T19:47:56.499213Z'),
        heldLines: [{ quantity: 2, unitGross: 2500 }],
        pendingNextBill: -2500,
        pendingNextBillKnown: true,
        creditBalance: 5000,
      });
      expect(client.subscriptions.get).toHaveBeenCalledWith('sub_1', {
        include: ['next_transaction', 'recurring_transaction_details'],
      });
      expect(client.customers.getCreditBalance).toHaveBeenCalledWith('ctm_1', {
        currencyCode: ['USD'],
      });
    });

    it('reads no credit when the customer holds none in the currency', async () => {
      client.subscriptions.get.mockResolvedValue(withPreview());
      client.customers.getCreditBalance.mockResolvedValue([]);
      const basis = await provider.getRefundBasis(ref);
      expect(basis?.creditBalance).toBe(0);
    });

    it('returns null once the subscription has ended', async () => {
      client.subscriptions.get.mockResolvedValue(
        withPreview({ status: 'canceled' }),
      );
      await expect(provider.getRefundBasis(ref)).resolves.toBeNull();
    });

    it('treats a missing next bill as nothing pending and says so', async () => {
      client.subscriptions.get.mockResolvedValue(
        withPreview({ nextTransaction: null }),
      );
      client.customers.getCreditBalance.mockResolvedValue(creditBalance('0'));
      const basis = await provider.getRefundBasis(ref);
      expect(basis?.pendingNextBill).toBe(0);
      expect(basis?.pendingNextBillKnown).toBe(false);
    });

    it('throws rather than guess when the recurring bill preview is missing', async () => {
      client.subscriptions.get.mockResolvedValue(
        withPreview({ recurringTransactionDetails: null }),
      );
      await expect(provider.getRefundBasis(ref)).rejects.toThrow(
        'recurring bill preview',
      );
    });

    describe('getPeriodPayments', () => {
      const periodStart = new Date('2026-11-03T20:11:40.283525Z');
      const txn = (
        id: string,
        status: string,
        grandTotal: string,
        startsAt = '2026-11-03T20:11:40.283525Z',
      ) => ({
        id,
        status,
        currencyCode: 'USD',
        billedAt: '2026-11-03T20:11:44.244005Z',
        createdAt: '2026-11-03T20:11:41.000000Z',
        billingPeriod: { startsAt, endsAt: '2026-12-03T20:11:40.283525Z' },
        details: { totals: { grandTotal } },
      });

      it('reports a completed card renewal of the period as paid and refundable', async () => {
        client.transactions.list.mockReturnValue(
          collection([
            txn('txn_renewal', 'completed', '2500'),
            txn('txn_old', 'completed', '7500', '2026-10-03T20:11:40.283525Z'),
          ]),
        );
        await expect(
          provider.getPeriodPayments(ref, periodStart),
        ).resolves.toEqual({
          paid: true,
          failed: false,
          cardPayments: [
            {
              invoiceId: 'txn_renewal',
              amount: 2500,
              currency: 'usd',
              occurredAt: new Date('2026-11-03T20:11:44.244005Z'),
            },
          ],
        });
        expect(client.transactions.list).toHaveBeenCalledWith({
          subscriptionId: ['sub_1'],
          perPage: 100,
        });
      });

      it('reports a period paid from credit as paid with nothing refundable', async () => {
        client.transactions.list.mockReturnValue(
          collection([txn('txn_credit', 'completed', '0')]),
        );
        await expect(
          provider.getPeriodPayments(ref, periodStart),
        ).resolves.toMatchObject({ paid: true, cardPayments: [] });
      });

      it('reports a past-due renewal as failed', async () => {
        client.transactions.list.mockReturnValue(
          collection([txn('txn_due', 'past_due', '2500')]),
        );
        await expect(
          provider.getPeriodPayments(ref, periodStart),
        ).resolves.toEqual({ paid: false, failed: true, cardPayments: [] });
      });
    });

    it('cancels with immediate effect', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([seatLine(1)], { status: 'active' }),
      );
      await provider.cancelImmediately(ref);
      expect(client.subscriptions.cancel).toHaveBeenCalledWith('sub_1', {
        effectiveFrom: 'immediately',
      });
    });

    it('does nothing when the subscription has already ended', async () => {
      client.subscriptions.get.mockResolvedValue(
        subscription([seatLine(1)], { status: 'canceled' }),
      );
      await provider.cancelImmediately(ref);
      expect(client.subscriptions.cancel).not.toHaveBeenCalled();
    });
  });

  describe('refundInvoicePayment with a reference', () => {
    beforeEach(() => {
      client.transactions.get.mockResolvedValue({
        details: {
          lineItems: [{ id: 'txnitm_seat', totals: { total: '7500' } }],
        },
      });
    });

    it('creates the refund with the reference in its reason and reports its state', async () => {
      client.adjustments.list.mockReturnValue(collection([]));
      client.adjustments.create.mockResolvedValue({
        id: 'adj_3',
        status: 'pending_approval',
      });
      await expect(
        provider.refundInvoicePayment('txn_1', 1650, 'rem-1'),
      ).resolves.toEqual({ refundId: 'adj_3', state: 'pending' });
      expect(client.adjustments.list).toHaveBeenCalledWith({
        transactionId: ['txn_1'],
        action: 'refund',
        perPage: 50,
      });
      expect(client.adjustments.create).toHaveBeenCalledWith({
        action: 'refund',
        transactionId: 'txn_1',
        reason: 'Refund of unused days, ref rem-1',
        type: 'partial',
        items: [{ itemId: 'txnitm_seat', type: 'partial', amount: '1650' }],
      });
    });

    it('returns the existing refund on a retry and never refunds twice', async () => {
      client.adjustments.list.mockReturnValue(
        collection([
          {
            id: 'adj_other',
            reason: 'Make-it-right refund',
            status: 'approved',
          },
          {
            id: 'adj_3',
            reason: 'Refund of unused days, ref rem-1',
            status: 'approved',
          },
        ]),
      );
      await expect(
        provider.refundInvoicePayment('txn_1', 1650, 'rem-1'),
      ).resolves.toEqual({ refundId: 'adj_3', state: 'approved' });
      expect(client.adjustments.create).not.toHaveBeenCalled();
    });

    it('does not look up earlier refunds for a full refund without a reference', async () => {
      client.adjustments.create.mockResolvedValue({ id: 'adj_4' });
      await provider.refundInvoicePayment('txn_1', null);
      expect(client.adjustments.list).not.toHaveBeenCalled();
    });

    it('maps provider refund statuses', () => {
      expect(refundStateOf('pending_approval')).toBe('pending');
      expect(refundStateOf('approved')).toBe('approved');
      expect(refundStateOf('rejected')).toBe('rejected');
      expect(refundStateOf('reversed')).toBe('reversed');
      expect(refundStateOf('other')).toBeNull();
      expect(refundStateOf(null)).toBeNull();
    });

    it('reads the reference back from a refund reason', () => {
      expect(refundReferenceOf('Refund of unused days, ref rem-1')).toBe(
        'rem-1',
      );
      expect(refundReferenceOf('Make-it-right refund')).toBeNull();
      expect(refundReferenceOf(null)).toBeNull();
    });
  });

  describe('refundInvoicePayment', () => {
    it('creates a full refund adjustment', async () => {
      client.adjustments.create.mockResolvedValue({ id: 'adj_1' });
      await expect(
        provider.refundInvoicePayment('txn_1', null),
      ).resolves.toEqual({ refundId: 'adj_1' });
      expect(client.adjustments.create).toHaveBeenCalledWith({
        action: 'refund',
        transactionId: 'txn_1',
        reason: 'Make-it-right refund',
        type: 'full',
      });
    });

    it('spreads a partial refund over the line items', async () => {
      client.adjustments.list.mockReturnValue(collection([]));
      client.transactions.get.mockResolvedValue({
        details: {
          lineItems: [
            { id: 'txnitm_base', totals: { total: '25000' } },
            { id: 'txnitm_seat', totals: { total: '5000' } },
          ],
        },
      });
      client.adjustments.create.mockResolvedValue({ id: 'adj_2' });
      await provider.refundInvoicePayment('txn_1', 26000);
      expect(client.adjustments.create).toHaveBeenCalledWith({
        action: 'refund',
        transactionId: 'txn_1',
        reason: 'Make-it-right refund',
        type: 'partial',
        items: [
          { itemId: 'txnitm_base', type: 'partial', amount: '25000' },
          { itemId: 'txnitm_seat', type: 'partial', amount: '1000' },
        ],
      });
    });

    it('caps each line at what live earlier refunds left on it', async () => {
      client.adjustments.list.mockReturnValue(
        collection([
          {
            id: 'adj_earlier',
            reason: 'Make-it-right refund',
            status: 'approved',
            items: [{ itemId: 'txnitm_base', amount: '24900' }],
          },
          {
            id: 'adj_rejected',
            reason: 'Make-it-right refund',
            status: 'rejected',
            items: [{ itemId: 'txnitm_seat', amount: '2500' }],
          },
        ]),
      );
      client.transactions.get.mockResolvedValue({
        details: {
          lineItems: [
            { id: 'txnitm_base', totals: { total: '25000' } },
            { id: 'txnitm_seat', totals: { total: '2500' } },
          ],
        },
      });
      client.adjustments.create.mockResolvedValue({ id: 'adj_5' });
      await provider.refundInvoicePayment('txn_1', 2600, 'rem-2');
      expect(client.adjustments.create).toHaveBeenCalledWith({
        action: 'refund',
        transactionId: 'txn_1',
        reason: 'Refund of unused days, ref rem-2',
        type: 'partial',
        items: [
          { itemId: 'txnitm_base', type: 'partial', amount: '100' },
          { itemId: 'txnitm_seat', type: 'partial', amount: '2500' },
        ],
      });
    });

    it('rejects a non-positive partial amount', async () => {
      await expect(provider.refundInvoicePayment('txn_1', 0)).rejects.toThrow(
        'positive integer',
      );
    });
  });

  describe('allocateRefund', () => {
    it('throws when the amount exceeds the line totals', () => {
      expect(() =>
        allocateRefund([{ id: 'a', totals: { total: '100' } }], 101),
      ).toThrow('exceeds');
    });

    it('throws when earlier refunds leave too little on the lines', () => {
      expect(() =>
        allocateRefund(
          [{ id: 'a', totals: { total: '100' } }],
          50,
          new Map([['a', 60]]),
        ),
      ).toThrow('exceeds');
    });
  });

  it('creditCustomerBalance is not available yet', async () => {
    await expect(provider.creditCustomerBalance()).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });

  it('times out a hung Paddle call', async () => {
    jest.useFakeTimers();
    try {
      client.subscriptions.get.mockReturnValue(new Promise(() => undefined));
      const pending = provider.getSeatQuantity(ref);
      const assertion = expect(pending).rejects.toThrow(
        'Paddle subscriptions.get timed out after 8000ms',
      );
      await jest.advanceTimersByTimeAsync(8000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
