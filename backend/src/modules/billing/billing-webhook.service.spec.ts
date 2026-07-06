import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { BillingWebhookService, planToTier } from './billing-webhook.service';
import { BillingEventDispatcher } from './events/billing-event-dispatcher';
import { StripeEvent } from './entities/stripe-event.entity';
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
import { NormalizedBillingEvent } from './events/billing-events';

describe('BillingWebhookService', () => {
    let service: BillingWebhookService;
    let dispatcher: BillingEventDispatcher;
    let eventRepo: jest.Mocked<Repository<StripeEvent>>;
    let companyRepo: jest.Mocked<Repository<Company>>;
    let provider: jest.Mocked<Pick<BillingProvider, 'parseWebhook'>>;

    const rawBody = Buffer.from('{"id":"evt_1"}');
    const signature = 't=1,v1=abc';
    const companyId = 'company-uuid-1';

    const baseEvent = {
        companyId,
        customerId: 'cus_1',
        subscriptionId: 'sub_1' as string | null,
        occurredAt: new Date('2026-07-02T00:00:00Z'),
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
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingWebhookService,
                BillingEventDispatcher,
                {
                    provide: getRepositoryToken(StripeEvent),
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
                    },
                },
                {
                    provide: BILLING_PROVIDER,
                    useValue: { parseWebhook: jest.fn() },
                },
            ],
        }).compile();

        service = module.get(BillingWebhookService);
        dispatcher = module.get(BillingEventDispatcher);
        eventRepo = module.get(getRepositoryToken(StripeEvent));
        companyRepo = module.get(getRepositoryToken(Company));
        provider = module.get(BILLING_PROVIDER);

        // The bare testing module does not run lifecycle hooks; register handlers.
        service.onModuleInit();
    });

    describe('input guards', () => {
        it('rejects a missing raw body with 400 and never calls the provider', async () => {
            await expect(service.handleWebhook(undefined, signature)).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(provider.parseWebhook).not.toHaveBeenCalled();
        });

        it('rejects a missing signature header with 400 and never calls the provider', async () => {
            await expect(service.handleWebhook(rawBody, undefined)).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(provider.parseWebhook).not.toHaveBeenCalled();
        });
    });

    describe('signature failure', () => {
        it('maps a parseWebhook throw to 400 and inserts nothing', async () => {
            provider.parseWebhook.mockRejectedValue(
                new Error('No signatures found matching the expected signature for payload'),
            );
            await expect(service.handleWebhook(rawBody, signature)).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(eventRepo.insert).not.toHaveBeenCalled();
        });
    });

    describe('idempotency', () => {
        it('acks an already-processed duplicate event (23505) without re-dispatching', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([{ name: 'SeatQuantityChanged', ...baseEvent, quantity: 3 }]),
            );
            eventRepo.insert.mockRejectedValue({ driverError: { code: '23505' } });
            eventRepo.findOne.mockResolvedValue({ processedAt: new Date() } as StripeEvent);
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
                parsedWith([{ name: 'SeatQuantityChanged', ...baseEvent, quantity: 3 }]),
            );
            eventRepo.insert.mockRejectedValue({ driverError: { code: '23505' } });
            eventRepo.findOne.mockResolvedValue({ processedAt: null } as unknown as StripeEvent);
            const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

            await expect(service.handleWebhook(rawBody, signature)).resolves.toEqual({
                received: true,
            });
            expect(dispatchSpy).toHaveBeenCalled();
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, { purchasedSeats: 3 });
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
        it('SeatQuantityChanged syncs purchasedSeats from the absolute quantity', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([{ name: 'SeatQuantityChanged', ...baseEvent, quantity: 7 }]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, { purchasedSeats: 7 });
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
                        currentPeriodEnd: null,
                    },
                ]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
                billingSubscriptionId: 'sub_1',
                billingStatus: 'active',
                subscriptionTier: SubscriptionTier.PRO,
                purchasedSeats: 4,
                maxUsers: TIER_LIMITS[SubscriptionTier.PRO].maxUsers,
                maxCountries: TIER_LIMITS[SubscriptionTier.PRO].maxCountries,
                maxProperties: TIER_LIMITS[SubscriptionTier.PRO].maxProperties,
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
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
                purchasedSeats: 5,
                billingStatus: 'active',
            });
        });

        it('PlanChanged writes the tier and cap columns only', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([{ name: 'PlanChanged', ...baseEvent, plan: 'PRO', quantity: 5 }]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
                subscriptionTier: SubscriptionTier.PRO,
                maxUsers: TIER_LIMITS[SubscriptionTier.PRO].maxUsers,
                maxCountries: TIER_LIMITS[SubscriptionTier.PRO].maxCountries,
                maxProperties: TIER_LIMITS[SubscriptionTier.PRO].maxProperties,
            });
        });

        it('SubscriptionCanceled drops to FREE, clears the subscription id, syncs FREE caps', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([{ name: 'SubscriptionCanceled', ...baseEvent, endedAt: null }]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
                subscriptionTier: SubscriptionTier.FREE,
                billingSubscriptionId: null,
                billingStatus: 'canceled',
                maxUsers: TIER_LIMITS[SubscriptionTier.FREE].maxUsers,
                maxCountries: TIER_LIMITS[SubscriptionTier.FREE].maxCountries,
                maxProperties: TIER_LIMITS[SubscriptionTier.FREE].maxProperties,
            });
        });

        it('PaymentFailed writes past_due when a subscription id is present', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([
                    {
                        name: 'PaymentFailed',
                        ...baseEvent,
                        amount: 2500,
                        currency: 'usd',
                        invoiceId: 'in_1',
                        attemptCount: 2,
                    },
                ]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
                billingStatus: 'past_due',
            });
        });

        it('PaymentSucceeded with a null subscription id writes nothing', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([
                    {
                        name: 'PaymentSucceeded',
                        ...baseEvent,
                        subscriptionId: null,
                        amount: 2000,
                        currency: 'usd',
                        invoiceId: 'in_2',
                    },
                ]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).not.toHaveBeenCalled();
        });

        it('warns and still marks the event processed when the company row is missing', async () => {
            companyRepo.update.mockResolvedValue({ affected: 0 } as never);
            provider.parseWebhook.mockResolvedValue(
                parsedWith([{ name: 'SeatQuantityChanged', ...baseEvent, quantity: 2 }]),
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

    describe('handler failure', () => {
        it('returns 500 and leaves processed_at unset', async () => {
            provider.parseWebhook.mockResolvedValue(
                parsedWith([{ name: 'SeatQuantityChanged', ...baseEvent, quantity: 2 }]),
            );
            companyRepo.update.mockRejectedValue(new Error('db down'));
            await expect(service.handleWebhook(rawBody, signature)).rejects.toBeInstanceOf(
                InternalServerErrorException,
            );
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
                        currentPeriodEnd: null,
                    },
                ]),
            );
            await service.handleWebhook(rawBody, signature);
            expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
                billingSubscriptionId: 'sub_1',
                billingStatus: 'active',
                subscriptionTier: SubscriptionTier.ENTERPRISE,
                purchasedSeats: 5,
                maxUsers: TIER_LIMITS[SubscriptionTier.ENTERPRISE].maxUsers,
                maxCountries: TIER_LIMITS[SubscriptionTier.ENTERPRISE].maxCountries,
                maxProperties: TIER_LIMITS[SubscriptionTier.ENTERPRISE].maxProperties,
            });
        });
    });
});
