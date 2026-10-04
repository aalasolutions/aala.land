import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { BillingWebhookService, planToTier } from './billing-webhook.service';
import { BillingEventDispatcher } from './events/billing-event-dispatcher';
import { BillingHistoryService } from './billing-history.service';
import { BillingService } from './billing.service';
import { BillingDowngradeService } from './billing-downgrade.service';
import { BillingEvent } from './entities/billing-event.entity';
import {
  Company,
  SubscriptionTier,
  TIER_LIMITS,
} from '../companies/entities/company.entity';
import {
  BILLING_PROVIDER,
  BillingProvider,
  ProviderWebhookEvent,
} from './provider/billing-provider.interface';
import {
  NormalizedBillingEvent,
  PaymentFailedEvent,
  PaymentSucceededEvent,
  RefundUpdatedEvent,
  SubscriptionActivatedEvent,
} from './events/billing-events';

describe('BillingWebhookService', () => {
  let service: BillingWebhookService;
  let dispatcher: BillingEventDispatcher;
  let eventRepo: jest.Mocked<Repository<BillingEvent>>;
  let companyRepo: jest.Mocked<Repository<Company>>;
  let provider: jest.Mocked<Pick<BillingProvider, 'parseWebhook'>> & {
    checkoutQuantityEditable: boolean;
  };
  let historyService: jest.Mocked<Pick<BillingHistoryService, 'recordPayment'>>;
  let billingService: jest.Mocked<
    Pick<BillingService, 'reconcileSeatsToActiveUsers'>
  >;
  let downgrades: jest.Mocked<
    Pick<BillingDowngradeService, 'applyRefundUpdate'>
  >;
  // Captures the last conditional-update QueryBuilder so seat-sync assertions
  // can read the .set() patch and .execute() affected count.
  let seatUpdateQB: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };

  const rawBody = Buffer.from('{"id":"evt_1"}');
  const signature = 't=1,v1=abc';
  const companyId = 'company-uuid-1';

  const occurredAt = new Date('2026-07-02T00:00:00Z');
  const baseEvent = {
    companyId,
    customerId: 'cus_1',
    subscriptionId: 'sub_1' as string | null,
    occurredAt,
  };
  // Invoice detail carried on every payment event (null when Stripe omits it).
  const paymentDetail = {
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
    periodStart: null,
    periodEnd: null,
  };

  function parsedWith(events: NormalizedBillingEvent[]): ProviderWebhookEvent {
    return {
      providerEventId: 'evt_1',
      providerEventType: 'customer.subscription.updated',
      payload: { id: 'evt_1' },
      events,
    };
  }

  beforeEach(async () => {
    seatUpdateQB = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingWebhookService,
        BillingEventDispatcher,
        {
          provide: getRepositoryToken(BillingEvent),
          useValue: {
            insert: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn(() => seatUpdateQB),
            exists: jest.fn().mockResolvedValue(true),
            findOne: jest
              .fn()
              .mockResolvedValue({ id: companyId, billingCustomerId: 'cus_1' }),
          },
        },
        {
          provide: BILLING_PROVIDER,
          useValue: { parseWebhook: jest.fn(), checkoutQuantityEditable: true },
        },
        {
          provide: BillingHistoryService,
          useValue: { recordPayment: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: BillingService,
          useValue: {
            reconcileSeatsToActiveUsers: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: BillingDowngradeService,
          useValue: {
            applyRefundUpdate: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(BillingWebhookService);
    dispatcher = module.get(BillingEventDispatcher);
    eventRepo = module.get(getRepositoryToken(BillingEvent));
    companyRepo = module.get(getRepositoryToken(Company));
    provider = module.get(BILLING_PROVIDER);
    historyService = module.get(BillingHistoryService);
    billingService = module.get(BillingService);
    downgrades = module.get(BillingDowngradeService);

    // The bare testing module does not run lifecycle hooks; register handlers.
    service.onModuleInit();
  });

  /** Asserts the payment write is scoped to the company and to the event's subscription. */
  function expectCurrentSubscriptionGuard(
    subscriptionId: string,
    at: Date,
  ): void {
    expect(seatUpdateQB.where).toHaveBeenCalledWith('id = :companyId', {
      companyId,
    });
    expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
      '(billing_subscription_id = :subscriptionId OR (billing_subscription_id IS NULL AND (billing_last_event_at IS NULL OR billing_last_event_at <= :occurredAt)))',
      { subscriptionId, occurredAt: at },
    );
  }

  /** The patch passed to the conditional seat-sync update (excludes billingLastEventAt). */
  function seatSyncPatch(): Record<string, unknown> {
    expect(seatUpdateQB.set).toHaveBeenCalled();
    const { billingLastEventAt, ...patch } = seatUpdateQB.set.mock.calls[0][0];
    expect(billingLastEventAt).toEqual(occurredAt);
    return patch;
  }

  describe('input guards', () => {
    it('rejects a missing raw body with 400 and never calls the provider', async () => {
      await expect(
        service.handleWebhook(undefined, signature),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.parseWebhook).not.toHaveBeenCalled();
    });

    it('rejects a missing signature header with 400 and never calls the provider', async () => {
      await expect(
        service.handleWebhook(rawBody, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.parseWebhook).not.toHaveBeenCalled();
    });
  });

  describe('signature failure', () => {
    it('maps a parseWebhook throw to 400 and inserts nothing', async () => {
      provider.parseWebhook.mockRejectedValue(
        new Error(
          'No signatures found matching the expected signature for payload',
        ),
      );
      await expect(
        service.handleWebhook(rawBody, signature),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(eventRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('acks an already-processed duplicate event (23505) without re-dispatching', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 3 },
        ]),
      );
      eventRepo.insert.mockRejectedValue({ driverError: { code: '23505' } });
      eventRepo.findOne.mockResolvedValue({
        processedAt: new Date(),
      } as BillingEvent);
      const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(eventRepo.update).not.toHaveBeenCalled();
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('re-dispatches a duplicate event whose prior insert never finished processing', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 3 },
        ]),
      );
      eventRepo.insert.mockRejectedValue({ driverError: { code: '23505' } });
      eventRepo.findOne.mockResolvedValue({
        processedAt: null,
      } as unknown as BillingEvent);
      const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(dispatchSpy).toHaveBeenCalled();
      expect(seatSyncPatch()).toEqual({ purchasedSeats: 3 });
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });

    it('rethrows a non-duplicate insert failure so the provider retries', async () => {
      provider.parseWebhook.mockResolvedValue(parsedWith([]));
      eventRepo.insert.mockRejectedValue(new Error('connection refused'));
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        'connection refused',
      );
      expect(eventRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('unknown event type', () => {
    it('persists the row, marks it processed, dispatches nothing', async () => {
      provider.parseWebhook.mockResolvedValue(parsedWith([]));
      const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(eventRepo.insert).toHaveBeenCalledWith({
        providerEventId: 'evt_1',
        type: 'customer.subscription.updated',
        payload: { id: 'evt_1' },
      });
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });
  });

  describe('company sync handlers', () => {
    it('SeatQuantityChanged syncs purchasedSeats from the absolute quantity via the recency-guarded update', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 7 },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({ purchasedSeats: 7 });
      // Recency guard: filtered by id AND the last-event-at comparison. `<=`
      // (not `<`) so several internal events sharing one Stripe second-granular
      // event.created all apply; whole-event redelivery is deduped upstream.
      expect(seatUpdateQB.where).toHaveBeenCalledWith('id = :companyId', {
        companyId,
      });
      expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
        '(billing_last_event_at IS NULL OR billing_last_event_at <= :occurredAt)',
        { occurredAt },
      );
    });

    it('SubscriptionActivated writes subscription id, status, tier, seats, and cap columns', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'SubscriptionActivated',
            ...baseEvent,
            plan: 'PRO',
            quantity: 4,
            status: 'active',
            currency: 'usd',
            currentPeriodEnd: null,
          },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({
        billingSubscriptionId: 'sub_1',
        billingStatus: 'active',
        subscriptionTier: SubscriptionTier.PRO,
        purchasedSeats: 4,
        billingCurrency: 'usd',
        maxUsers: TIER_LIMITS[SubscriptionTier.PRO].maxUsers,
        maxRegions: TIER_LIMITS[SubscriptionTier.PRO].maxRegions,
        maxProperties: TIER_LIMITS[SubscriptionTier.PRO].maxProperties,
      });
    });

    describe('late SubscriptionActivated after a newer event', () => {
      const activated = {
        name: 'SubscriptionActivated' as const,
        ...baseEvent,
        plan: 'PRO' as const,
        quantity: 4,
        status: 'active',
        currency: 'usd',
        currentPeriodEnd: null,
      };

      it('fills the missing subscription id and currency once', async () => {
        seatUpdateQB.execute
          .mockResolvedValueOnce({ affected: 0 })
          .mockResolvedValueOnce({ affected: 1 });
        provider.parseWebhook.mockResolvedValue(parsedWith([activated]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set).toHaveBeenCalledTimes(2);
        expect(seatUpdateQB.set.mock.calls[1][0]).toEqual({
          billingSubscriptionId: 'sub_1',
          billingCurrency: 'usd',
        });
        expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
          'billing_subscription_id IS NULL',
        );
      });

      it('does nothing when a subscription id already exists', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        provider.parseWebhook.mockResolvedValue(parsedWith([activated]));
        await service.handleWebhook(rawBody, signature);
        // The set-once write only matches a row whose id is still NULL.
        expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
          'billing_subscription_id IS NULL',
        );
        expect(companyRepo.update).not.toHaveBeenCalled();
      });

      it('does nothing for a FREE company', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        provider.parseWebhook.mockResolvedValue(parsedWith([activated]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
          'subscription_tier <> :free',
          { free: SubscriptionTier.FREE },
        );
        expect(companyRepo.update).not.toHaveBeenCalled();
      });

      it('skips the set-once write when the guarded sync applied', async () => {
        provider.parseWebhook.mockResolvedValue(parsedWith([activated]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set).toHaveBeenCalledTimes(1);
      });
    });

    it('SubscriptionUpdated writes seats and the carried status', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'SubscriptionUpdated',
            ...baseEvent,
            plan: 'PRO',
            quantity: 5,
            status: 'active',
            currentPeriodEnd: null,
          },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({
        purchasedSeats: 5,
        billingStatus: 'active',
      });
    });

    it('skips a stale/out-of-order seat event (0 rows affected) but still acks and marks it processed', async () => {
      seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
      companyRepo.exists.mockResolvedValue(true); // company exists -> stale, not missing
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 6 },
        ]),
      );
      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });

    it('PlanChanged writes tier + caps THROUGH the recency guard (not a bare update)', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'PlanChanged', ...baseEvent, plan: 'PRO', quantity: 5 },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      // Must be routed through the recency-guarded conditional UPDATE so an
      // out-of-order/retried plan swap cannot clobber newer tier state.
      expect(seatSyncPatch()).toEqual({
        subscriptionTier: SubscriptionTier.PRO,
        maxUsers: TIER_LIMITS[SubscriptionTier.PRO].maxUsers,
        maxRegions: TIER_LIMITS[SubscriptionTier.PRO].maxRegions,
        maxProperties: TIER_LIMITS[SubscriptionTier.PRO].maxProperties,
      });
      expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
        '(billing_last_event_at IS NULL OR billing_last_event_at <= :occurredAt)',
        { occurredAt },
      );
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('PlanChanged to the stored tier writes the tier only and keeps operator limits', async () => {
      companyRepo.findOne.mockResolvedValue({
        id: companyId,
        billingCustomerId: 'cus_1',
        subscriptionTier: SubscriptionTier.PRO,
      } as Company);
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'PlanChanged', ...baseEvent, plan: 'PRO', quantity: 5 },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({
        subscriptionTier: SubscriptionTier.PRO,
      });
    });

    it('PlanChanged to a different stored tier writes the tier limits', async () => {
      companyRepo.findOne.mockResolvedValue({
        id: companyId,
        billingCustomerId: 'cus_1',
        subscriptionTier: SubscriptionTier.ENTERPRISE,
      } as Company);
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'PlanChanged', ...baseEvent, plan: 'PRO', quantity: 5 },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({
        subscriptionTier: SubscriptionTier.PRO,
        maxUsers: TIER_LIMITS[SubscriptionTier.PRO].maxUsers,
        maxRegions: TIER_LIMITS[SubscriptionTier.PRO].maxRegions,
        maxProperties: TIER_LIMITS[SubscriptionTier.PRO].maxProperties,
      });
    });

    it('SubscriptionCanceled drops to FREE, clears the subscription id, syncs FREE caps THROUGH the recency guard', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SubscriptionCanceled', ...baseEvent, endedAt: null },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({
        subscriptionTier: SubscriptionTier.FREE,
        billingSubscriptionId: null,
        billingStatus: 'canceled',
        chargedSeatNet: null,
        chargedSeatGross: null,
        chargedBaseNet: null,
        chargedBaseGross: null,
        maxUsers: TIER_LIMITS[SubscriptionTier.FREE].maxUsers,
        maxRegions: TIER_LIMITS[SubscriptionTier.FREE].maxRegions,
        maxProperties: TIER_LIMITS[SubscriptionTier.FREE].maxProperties,
      });
      expect(seatUpdateQB.andWhere).toHaveBeenCalledWith(
        '(billing_last_event_at IS NULL OR billing_last_event_at <= :occurredAt)',
        { occurredAt },
      );
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('skips a stale/out-of-order cancel (0 rows) but still acks and marks it processed', async () => {
      // A retried/late SubscriptionCanceled delivered after a newer
      // resubscribe must NOT win last-write; the guard yields 0 rows.
      seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
      companyRepo.exists.mockResolvedValue(true);
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SubscriptionCanceled', ...baseEvent, endedAt: null },
        ]),
      );
      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });

    it('PaymentFailed records history and writes past_due when a subscription id is present', async () => {
      const failed = {
        name: 'PaymentFailed' as const,
        ...baseEvent,
        ...paymentDetail,
        amount: 2500,
        currency: 'usd',
        invoiceId: 'in_1',
        attemptCount: 2,
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([failed]));
      await service.handleWebhook(rawBody, signature);
      expect(historyService.recordPayment).toHaveBeenCalledWith(failed);
      expect(seatUpdateQB.set).toHaveBeenCalledWith({
        billingStatus: 'past_due',
      });
      expectCurrentSubscriptionGuard('sub_1', occurredAt);
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('PaymentSucceeded records history and writes active when a subscription id is present', async () => {
      const succeeded = {
        name: 'PaymentSucceeded' as const,
        ...baseEvent,
        ...paymentDetail,
        amount: 2500,
        currency: 'usd',
        invoiceId: 'in_3',
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([succeeded]));
      await service.handleWebhook(rawBody, signature);
      expect(historyService.recordPayment).toHaveBeenCalledWith(succeeded);
      expect(seatUpdateQB.set).toHaveBeenCalledWith({
        billingStatus: 'active',
      });
      expectCurrentSubscriptionGuard('sub_1', occurredAt);
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('PaymentSucceeded writes the charged amounts of the kinds present and the status in one guarded statement, outside the recency guard', async () => {
      const succeeded: PaymentSucceededEvent = {
        name: 'PaymentSucceeded',
        ...baseEvent,
        ...paymentDetail,
        amount: 2500,
        currency: 'usd',
        invoiceId: 'txn_1',
        settledWithoutCharge: false,
        chargedUnitAmounts: [{ kind: 'SEAT', net: 2381, gross: 2500 }],
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([succeeded]));
      await service.handleWebhook(rawBody, signature);
      expect(seatUpdateQB.set).toHaveBeenCalledTimes(1);
      expect(seatUpdateQB.set).toHaveBeenCalledWith({
        chargedSeatNet: 2381,
        chargedSeatGross: 2500,
        billingStatus: 'active',
      });
      expect(seatUpdateQB.execute).toHaveBeenCalledTimes(1);
      expectCurrentSubscriptionGuard('sub_1', occurredAt);
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('PaymentSucceeded writes both kinds when base and seat are charged', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'PaymentSucceeded',
            ...baseEvent,
            ...paymentDetail,
            amount: 29999,
            currency: 'usd',
            invoiceId: 'txn_2',
            chargedUnitAmounts: [
              { kind: 'ENTERPRISE_BASE', net: 23809, gross: 24999 },
              { kind: 'SEAT', net: 4200, gross: 5000 },
            ],
          },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatUpdateQB.set).toHaveBeenCalledWith({
        chargedBaseNet: 23809,
        chargedBaseGross: 24999,
        chargedSeatNet: 4200,
        chargedSeatGross: 5000,
        billingStatus: 'active',
      });
      expectCurrentSubscriptionGuard('sub_1', occurredAt);
    });

    it('a zero-charge settlement records history and never writes billing status', async () => {
      const settled: PaymentSucceededEvent = {
        name: 'PaymentSucceeded',
        ...baseEvent,
        ...paymentDetail,
        amount: 0,
        currency: 'usd',
        invoiceId: 'txn_3',
        creditApplied: 2498,
        creditIssued: 0,
        origin: 'subscription_update',
        settledWithoutCharge: true,
        chargedUnitAmounts: [],
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([settled]));
      await service.handleWebhook(rawBody, signature);
      expect(historyService.recordPayment).toHaveBeenCalledWith(settled);
      expect(companyRepo.update).not.toHaveBeenCalled();
      expect(seatUpdateQB.execute).not.toHaveBeenCalled();
    });

    it('a payment method change records history and updates nothing on the company', async () => {
      const methodChange: PaymentSucceededEvent = {
        name: 'PaymentSucceeded',
        ...baseEvent,
        ...paymentDetail,
        amount: 0,
        currency: 'usd',
        invoiceId: 'txn_pmc',
        creditApplied: 0,
        creditIssued: 0,
        origin: 'subscription_payment_method_change',
        settledWithoutCharge: true,
        chargedUnitAmounts: [],
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([methodChange]));
      await service.handleWebhook(rawBody, signature);
      expect(historyService.recordPayment).toHaveBeenCalledWith(methodChange);
      expect(companyRepo.update).not.toHaveBeenCalled();
      expect(seatUpdateQB.execute).not.toHaveBeenCalled();
    });

    it('a zero-charge settlement still stores full-period amounts without touching status', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'PaymentSucceeded',
            ...baseEvent,
            ...paymentDetail,
            amount: 0,
            currency: 'usd',
            invoiceId: 'txn_4',
            creditApplied: 2500,
            settledWithoutCharge: true,
            chargedUnitAmounts: [{ kind: 'SEAT', net: 2381, gross: 2500 }],
          },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(companyRepo.update).not.toHaveBeenCalled();
      expect(seatUpdateQB.set).toHaveBeenCalledWith({
        chargedSeatNet: 2381,
        chargedSeatGross: 2500,
      });
      expectCurrentSubscriptionGuard('sub_1', occurredAt);
    });

    describe('company writes only from the current subscription', () => {
      const cancelAt = new Date('2026-07-10T00:00:00Z');
      const paid = (
        overrides: Partial<PaymentSucceededEvent> = {},
      ): PaymentSucceededEvent => ({
        name: 'PaymentSucceeded',
        ...baseEvent,
        ...paymentDetail,
        amount: 2500,
        currency: 'usd',
        invoiceId: 'txn_guard',
        settledWithoutCharge: false,
        chargedUnitAmounts: [{ kind: 'SEAT', net: 2381, gross: 2500 }],
        ...overrides,
      });

      /** The guarded statement matched no row: the condition excluded it. */
      async function expectSkippedAndProcessed(): Promise<void> {
        await expect(
          service.handleWebhook(rawBody, signature),
        ).resolves.toEqual({ received: true });
        expect(companyRepo.update).not.toHaveBeenCalled();
        expect(seatUpdateQB.execute).toHaveBeenCalledTimes(1);
        expect(eventRepo.update).toHaveBeenCalledWith(
          { providerEventId: 'evt_1' },
          { processedAt: expect.any(Date) },
        );
      }

      it('writes in one statement whose WHERE keeps the company filter and the subscription condition', async () => {
        provider.parseWebhook.mockResolvedValue(parsedWith([paid()]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.update).toHaveBeenCalledWith(Company);
        expect(seatUpdateQB.execute).toHaveBeenCalledTimes(1);
        expectCurrentSubscriptionGuard('sub_1', occurredAt);
      });

      it('never moves billing_last_event_at', async () => {
        provider.parseWebhook.mockResolvedValue(parsedWith([paid()]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set.mock.calls[0][0]).not.toHaveProperty(
          'billingLastEventAt',
        );
        expect(companyRepo.update).not.toHaveBeenCalled();
      });

      it('the current subscription payment sets active through the guarded statement', async () => {
        provider.parseWebhook.mockResolvedValue(parsedWith([paid()]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set.mock.calls[0][0]).toMatchObject({
          billingStatus: 'active',
        });
        expectCurrentSubscriptionGuard('sub_1', occurredAt);
      });

      it('the first payment before subscription.created on a never-subscribed company sets active, binding its own subscription and time', async () => {
        const first = new Date('2026-08-01T00:00:00Z');
        provider.parseWebhook.mockResolvedValue(
          parsedWith([paid({ subscriptionId: 'sub_new', occurredAt: first })]),
        );
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set.mock.calls[0][0]).toMatchObject({
          billingStatus: 'active',
        });
        expectCurrentSubscriptionGuard('sub_new', first);
      });

      it('a late real payment of a canceled subscription leaves billingStatus untouched', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        const beforeCancel = new Date(cancelAt.getTime() - 60_000);
        provider.parseWebhook.mockResolvedValue(
          parsedWith([
            paid({ subscriptionId: 'sub_1', occurredAt: beforeCancel }),
          ]),
        );
        await expectSkippedAndProcessed();
        expectCurrentSubscriptionGuard('sub_1', beforeCancel);
      });

      it('a payment of a subscription other than the stored one leaves billingStatus untouched', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        provider.parseWebhook.mockResolvedValue(
          parsedWith([paid({ subscriptionId: 'sub_old' })]),
        );
        await expectSkippedAndProcessed();
        expectCurrentSubscriptionGuard('sub_old', occurredAt);
      });

      it('zero rows matched does not throw and logs the skip with ids only', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        const log = jest
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        provider.parseWebhook.mockResolvedValue(
          parsedWith([paid({ subscriptionId: 'sub_old' })]),
        );
        await expectSkippedAndProcessed();
        expect(log).toHaveBeenCalledWith(
          `PaymentSucceeded: company ${companyId} not updated, subscription sub_old is not current or the company is missing`,
        );
        log.mockRestore();
      });

      it('a zero-charge event with amounts writes no status', async () => {
        provider.parseWebhook.mockResolvedValue(
          parsedWith([paid({ amount: 0, settledWithoutCharge: true })]),
        );
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set.mock.calls[0][0]).not.toHaveProperty(
          'billingStatus',
        );
        expect(companyRepo.update).not.toHaveBeenCalled();
        expectCurrentSubscriptionGuard('sub_1', occurredAt);
      });

      it('a paid event without amounts writes the status alone', async () => {
        provider.parseWebhook.mockResolvedValue(
          parsedWith([paid({ chargedUnitAmounts: [] })]),
        );
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set).toHaveBeenCalledWith({
          billingStatus: 'active',
        });
        expectCurrentSubscriptionGuard('sub_1', occurredAt);
      });
    });

    describe('failed payments only from the current subscription', () => {
      const cancelAt = new Date('2026-07-10T00:00:00Z');
      const failed = (
        overrides: Partial<PaymentFailedEvent> = {},
      ): PaymentFailedEvent => ({
        name: 'PaymentFailed',
        ...baseEvent,
        ...paymentDetail,
        amount: 2500,
        currency: 'usd',
        invoiceId: 'txn_failed',
        attemptCount: 1,
        ...overrides,
      });

      async function expectSkippedAndProcessed(): Promise<void> {
        await expect(
          service.handleWebhook(rawBody, signature),
        ).resolves.toEqual({ received: true });
        expect(companyRepo.update).not.toHaveBeenCalled();
        expect(seatUpdateQB.execute).toHaveBeenCalledTimes(1);
        expect(eventRepo.update).toHaveBeenCalledWith(
          { providerEventId: 'evt_1' },
          { processedAt: expect.any(Date) },
        );
      }

      it('the current subscription failed payment sets past_due through the guarded statement', async () => {
        provider.parseWebhook.mockResolvedValue(parsedWith([failed()]));
        await service.handleWebhook(rawBody, signature);
        expect(seatUpdateQB.set).toHaveBeenCalledWith({
          billingStatus: 'past_due',
        });
        expect(seatUpdateQB.set.mock.calls[0][0]).not.toHaveProperty(
          'billingLastEventAt',
        );
        expectCurrentSubscriptionGuard('sub_1', occurredAt);
      });

      it('a late failed payment of a canceled subscription leaves billingStatus untouched', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        const beforeCancel = new Date(cancelAt.getTime() - 60_000);
        provider.parseWebhook.mockResolvedValue(
          parsedWith([failed({ occurredAt: beforeCancel })]),
        );
        await expectSkippedAndProcessed();
        expectCurrentSubscriptionGuard('sub_1', beforeCancel);
      });

      it('a failed payment of a subscription other than the stored one leaves billingStatus untouched', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        provider.parseWebhook.mockResolvedValue(
          parsedWith([failed({ subscriptionId: 'sub_old' })]),
        );
        await expectSkippedAndProcessed();
        expectCurrentSubscriptionGuard('sub_old', occurredAt);
      });

      it('zero rows matched does not throw and logs the skip with ids only', async () => {
        seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
        const log = jest
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        provider.parseWebhook.mockResolvedValue(
          parsedWith([failed({ subscriptionId: 'sub_old' })]),
        );
        await expectSkippedAndProcessed();
        expect(log).toHaveBeenCalledWith(
          `PaymentFailed: company ${companyId} not updated, subscription sub_old is not current or the company is missing`,
        );
        log.mockRestore();
      });

      it('a failed payment with a null subscription id records history and writes nothing on the company', async () => {
        const event = failed({ subscriptionId: null });
        provider.parseWebhook.mockResolvedValue(parsedWith([event]));
        await service.handleWebhook(rawBody, signature);
        expect(historyService.recordPayment).toHaveBeenCalledWith(event);
        expect(companyRepo.update).not.toHaveBeenCalled();
        expect(seatUpdateQB.execute).not.toHaveBeenCalled();
      });
    });

    it('PaymentSucceeded and PaymentFailed share one guarded company update', async () => {
      const guarded = jest.spyOn(
        service as unknown as {
          applyCurrentSubscriptionUpdate: (...args: unknown[]) => Promise<void>;
        },
        'applyCurrentSubscriptionUpdate',
      );
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'PaymentSucceeded',
            ...baseEvent,
            ...paymentDetail,
            amount: 2500,
            currency: 'usd',
            invoiceId: 'txn_ok',
          },
          {
            name: 'PaymentFailed',
            ...baseEvent,
            ...paymentDetail,
            amount: 2500,
            currency: 'usd',
            invoiceId: 'txn_bad',
            attemptCount: 1,
          },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(guarded.mock.calls).toEqual([
        [
          companyId,
          'sub_1',
          occurredAt,
          'PaymentSucceeded',
          { billingStatus: 'active' },
        ],
        [
          companyId,
          'sub_1',
          occurredAt,
          'PaymentFailed',
          { billingStatus: 'past_due' },
        ],
      ]);
      expect(seatUpdateQB.andWhere).toHaveBeenCalledTimes(2);
      expect(seatUpdateQB.andWhere.mock.calls[0]).toEqual(
        seatUpdateQB.andWhere.mock.calls[1],
      );
      guarded.mockRestore();
    });

    it('PaymentSucceeded with a null subscription id records history but does not touch company status', async () => {
      const succeeded = {
        name: 'PaymentSucceeded' as const,
        ...baseEvent,
        ...paymentDetail,
        subscriptionId: null,
        amount: 2000,
        currency: 'usd',
        invoiceId: 'in_2',
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([succeeded]));
      await service.handleWebhook(rawBody, signature);
      expect(historyService.recordPayment).toHaveBeenCalledWith(succeeded);
      expect(companyRepo.update).not.toHaveBeenCalled();
      expect(seatUpdateQB.execute).not.toHaveBeenCalled();
    });

    it('warns and still marks the event processed when the company row is missing', async () => {
      seatUpdateQB.execute.mockResolvedValue({ affected: 0 });
      companyRepo.exists.mockResolvedValue(false); // truly missing, not just stale
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 2 },
        ]),
      );
      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });
  });

  describe('seat reconcile after SubscriptionActivated', () => {
    const activated = (): SubscriptionActivatedEvent => ({
      name: 'SubscriptionActivated',
      ...baseEvent,
      plan: 'PRO',
      quantity: 5,
      status: 'active',
      currency: 'usd',
      currentPeriodEnd: null,
    });

    it('reconciles after the company write and hands later handlers the reconciled count', async () => {
      billingService.reconcileSeatsToActiveUsers.mockResolvedValue(2);
      const seen: number[] = [];
      dispatcher.register('SubscriptionActivated', (e) => {
        seen.push(e.quantity);
        return Promise.resolve();
      });
      provider.parseWebhook.mockResolvedValue(parsedWith([activated()]));
      await service.handleWebhook(rawBody, signature);
      expect(billingService.reconcileSeatsToActiveUsers).toHaveBeenCalledWith(
        companyId,
        'sub_1',
      );
      expect(seatUpdateQB.execute.mock.invocationCallOrder[0]).toBeLessThan(
        billingService.reconcileSeatsToActiveUsers.mock.invocationCallOrder[0],
      );
      expect(seen).toEqual([2]);
    });

    it('skips the reconcile and keeps the checkout count when checkout quantity is not editable', async () => {
      provider.checkoutQuantityEditable = false;
      billingService.reconcileSeatsToActiveUsers.mockResolvedValue(2);
      const seen: number[] = [];
      dispatcher.register('SubscriptionActivated', (e) => {
        seen.push(e.quantity);
        return Promise.resolve();
      });
      provider.parseWebhook.mockResolvedValue(parsedWith([activated()]));
      await service.handleWebhook(rawBody, signature);
      expect(billingService.reconcileSeatsToActiveUsers).not.toHaveBeenCalled();
      expect(seen).toEqual([5]);
    });

    it('keeps the checkout count when the reconcile is skipped', async () => {
      const seen: number[] = [];
      dispatcher.register('SubscriptionActivated', (e) => {
        seen.push(e.quantity);
        return Promise.resolve();
      });
      provider.parseWebhook.mockResolvedValue(parsedWith([activated()]));
      await service.handleWebhook(rawBody, signature);
      expect(seen).toEqual([5]);
    });

    it('still reconciles a late activation that only filled the subscription id', async () => {
      seatUpdateQB.execute
        .mockResolvedValueOnce({ affected: 0 })
        .mockResolvedValueOnce({ affected: 1 });
      provider.parseWebhook.mockResolvedValue(parsedWith([activated()]));
      await service.handleWebhook(rawBody, signature);
      expect(billingService.reconcileSeatsToActiveUsers).toHaveBeenCalledWith(
        companyId,
        'sub_1',
      );
    });

    it('a failed reconcile returns 500, leaves the event unprocessed and stops later handlers', async () => {
      billingService.reconcileSeatsToActiveUsers.mockRejectedValue(
        new Error('provider down'),
      );
      const later = jest.fn().mockResolvedValue(undefined);
      dispatcher.register('SubscriptionActivated', later);
      provider.parseWebhook.mockResolvedValue(parsedWith([activated()]));
      await expect(
        service.handleWebhook(rawBody, signature),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(later).not.toHaveBeenCalled();
      expect(eventRepo.update).not.toHaveBeenCalled();
    });

    it('the update events the reconcile itself causes never call the provider again', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'SubscriptionUpdated',
            ...baseEvent,
            plan: 'PRO',
            quantity: 2,
            status: 'active',
            currentPeriodEnd: null,
          },
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 2 },
          { name: 'PlanChanged', ...baseEvent, plan: 'PRO', quantity: 2 },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(billingService.reconcileSeatsToActiveUsers).not.toHaveBeenCalled();
    });
  });

  describe('customer ownership', () => {
    const seatEvent = (customerId: string) =>
      parsedWith([
        { name: 'SeatQuantityChanged', ...baseEvent, customerId, quantity: 4 },
      ]);

    it('dispatches when the event customer matches the stored customer', async () => {
      provider.parseWebhook.mockResolvedValue(seatEvent('cus_1'));
      const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');
      await service.handleWebhook(rawBody, signature);
      expect(companyRepo.findOne).toHaveBeenCalledWith({
        where: { id: companyId },
        select: ['id', 'billingCustomerId'],
      });
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it('skips a mismatched customer and still marks the event processed', async () => {
      provider.parseWebhook.mockResolvedValue(seatEvent('cus_other'));
      const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');
      await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
        received: true,
      });
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(seatUpdateQB.execute).not.toHaveBeenCalled();
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });

    it('skips when the company has no stored customer', async () => {
      companyRepo.findOne.mockResolvedValue({
        id: companyId,
        billingCustomerId: null,
      } as Company);
      provider.parseWebhook.mockResolvedValue(seatEvent('cus_1'));
      const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');
      await service.handleWebhook(rawBody, signature);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });
  });

  describe('handler failure', () => {
    it('returns 500 and leaves processed_at unset', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          { name: 'SeatQuantityChanged', ...baseEvent, quantity: 2 },
        ]),
      );
      seatUpdateQB.execute.mockRejectedValue(new Error('db down'));
      await expect(
        service.handleWebhook(rawBody, signature),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(eventRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('planToTier', () => {
    it('maps PRO to the PRO tier', () => {
      expect(planToTier('PRO')).toBe(SubscriptionTier.PRO);
    });

    it('maps ENTERPRISE to the ENTERPRISE tier (unit 3 added the enum member)', () => {
      expect(planToTier('ENTERPRISE')).toBe(SubscriptionTier.ENTERPRISE);
    });
  });

  describe('company sync handlers — ENTERPRISE', () => {
    it('SubscriptionActivated for ENTERPRISE writes ENTERPRISE tier and cap columns', async () => {
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'SubscriptionActivated',
            ...baseEvent,
            plan: 'ENTERPRISE',
            quantity: 5,
            status: 'active',
            // Pins whatever currency Stripe created the sub in (here AED).
            currency: 'aed',
            currentPeriodEnd: null,
          },
        ]),
      );
      await service.handleWebhook(rawBody, signature);
      expect(seatSyncPatch()).toEqual({
        billingSubscriptionId: 'sub_1',
        billingStatus: 'active',
        subscriptionTier: SubscriptionTier.ENTERPRISE,
        purchasedSeats: 5,
        billingCurrency: 'aed',
        maxUsers: TIER_LIMITS[SubscriptionTier.ENTERPRISE].maxUsers,
        maxRegions: TIER_LIMITS[SubscriptionTier.ENTERPRISE].maxRegions,
        maxProperties: TIER_LIMITS[SubscriptionTier.ENTERPRISE].maxProperties,
      });
    });
  });

  describe('RefundUpdated', () => {
    it('hands the refund to the downgrade service and marks the event processed', async () => {
      const refund: RefundUpdatedEvent = {
        name: 'RefundUpdated',
        ...baseEvent,
        refundId: 'adj_1',
        invoiceId: 'txn_1',
        amount: 500,
        currency: 'usd',
        state: 'approved',
        reference: null,
      };
      provider.parseWebhook.mockResolvedValue(parsedWith([refund]));
      await service.handleWebhook(rawBody, signature);
      expect(downgrades.applyRefundUpdate).toHaveBeenCalledWith(refund);
      expect(eventRepo.update).toHaveBeenCalledWith(
        { providerEventId: 'evt_1' },
        { processedAt: expect.any(Date) },
      );
    });

    it('answers 500 when the refund update fails, so the provider retries', async () => {
      downgrades.applyRefundUpdate.mockRejectedValue(new Error('db down'));
      provider.parseWebhook.mockResolvedValue(
        parsedWith([
          {
            name: 'RefundUpdated',
            ...baseEvent,
            refundId: 'adj_1',
            invoiceId: 'txn_1',
            amount: 500,
            currency: 'usd',
            state: 'rejected',
            reference: null,
          },
        ]),
      );
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
