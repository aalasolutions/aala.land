import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { Company, SubscriptionTier } from '../companies/entities/company.entity';

const mockStripe = {
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { cancel: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
};

describe('BillingService', () => {
    let service: BillingService;
    let repo: jest.Mocked<Repository<Company>>;

    const mockCompanyFree: Company = {
        id: 'company-uuid-1',
        name: 'Test Co',
        slug: 'test-co',
        isActive: true,
        subscriptionTier: SubscriptionTier.FREE,
        maxUsers: 1,
        maxCountries: 1,
        maxProperties: 25,
        subscriptionExpiresAt: null,
        activeRegions: null,
        defaultRegionCode: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as Company;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                {
                    provide: getRepositoryToken(Company),
                    useValue: {
                        findOne: jest.fn(),
                        update: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            const map: Record<string, string> = {
                                STRIPE_SECRET_KEY: 'sk_test_fake',
                                STRIPE_WEBHOOK_SECRET: 'whsec_fake',
                                STRIPE_STARTER_PRICE_ID: 'price_starter',
                                STRIPE_PRO_PRICE_ID: 'price_pro',
                                FRONTEND_URL: 'http://localhost:4200',
                            };
                            return map[key];
                        }),
                    },
                },
                {
                    provide: 'STRIPE',
                    useValue: mockStripe,
                },
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
        repo = module.get(getRepositoryToken(Company));
    });

    describe('createCheckoutSession', () => {
        it('throws ForbiddenException when company is not found', async () => {
            repo.findOne.mockResolvedValue(null);
            await expect(service.createCheckoutSession('bad-id', 'STARTER')).rejects.toThrow(ForbiddenException);
        });

        it('throws BadRequestException when already on that tier', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, subscriptionTier: SubscriptionTier.STARTER } as Company);
            await expect(service.createCheckoutSession('company-uuid-1', 'STARTER')).rejects.toThrow(BadRequestException);
        });

        it('creates a Stripe Customer if stripeCustomerId is null', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree });
            mockStripe.customers.create.mockResolvedValue({ id: 'cus_new123' });
            mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_abc' });

            await service.createCheckoutSession('company-uuid-1', 'STARTER');

            expect(mockStripe.customers.create).toHaveBeenCalledWith({
                metadata: { companyId: 'company-uuid-1', companyName: 'Test Co' },
            });
            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', { stripeCustomerId: 'cus_new123' });
        });

        it('reuses existing Stripe Customer', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, stripeCustomerId: 'cus_existing' } as Company);
            mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_abc' });

            await service.createCheckoutSession('company-uuid-1', 'PRO');

            expect(mockStripe.customers.create).not.toHaveBeenCalled();
        });

        it('creates checkout session with correct STARTER price and metadata', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, stripeCustomerId: 'cus_existing' } as Company);
            mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_abc' });

            const result = await service.createCheckoutSession('company-uuid-1', 'STARTER');

            expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
                mode: 'subscription',
                customer: 'cus_existing',
                line_items: [{ price: 'price_starter', quantity: 1 }],
                success_url: 'http://localhost:4200/billing/success',
                cancel_url: 'http://localhost:4200/billing/cancel',
                metadata: { companyId: 'company-uuid-1', tier: 'STARTER' },
            });
            expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_abc' });
        });

        it('creates checkout session with correct PRO price', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, stripeCustomerId: 'cus_existing' } as Company);
            mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_pro' });

            await service.createCheckoutSession('company-uuid-1', 'PRO');

            expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
                expect.objectContaining({ line_items: [{ price: 'price_pro', quantity: 1 }] }),
            );
        });

        it('upgrades in place when company already has an active subscription', async () => {
            const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 30;
            repo.findOne.mockResolvedValue({
                ...mockCompanyFree,
                subscriptionTier: SubscriptionTier.STARTER,
                stripeSubscriptionStatus: 'active',
                stripeSubscriptionId: 'sub_existing',
                stripeCustomerId: 'cus_existing',
            } as Company);
            mockStripe.subscriptions.retrieve.mockResolvedValue({
                items: { data: [{ id: 'si_item123', current_period_end: periodEnd }] },
            });
            mockStripe.subscriptions.update.mockResolvedValue({
                items: { data: [{ current_period_end: periodEnd }] },
            });

            const result = await service.createCheckoutSession('company-uuid-1', 'PRO');

            expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_existing', {
                items: [{ id: 'si_item123', price: 'price_pro' }],
                proration_behavior: 'create_prorations',
            });
            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', expect.objectContaining({
                subscriptionTier: SubscriptionTier.PRO,
                stripeSubscriptionStatus: 'active',
                subscriptionExpiresAt: new Date(periodEnd * 1000),
            }));
            expect(result).toEqual({ url: null });
        });

        it('falls through to checkout session when subscription is past_due', async () => {
            repo.findOne.mockResolvedValue({
                ...mockCompanyFree,
                subscriptionTier: SubscriptionTier.STARTER,
                stripeSubscriptionStatus: 'past_due',
                stripeSubscriptionId: 'sub_existing',
                stripeCustomerId: 'cus_existing',
            } as Company);
            mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_abc' });

            const result = await service.createCheckoutSession('company-uuid-1', 'PRO');

            expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
            expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
            expect(result.url).toBeTruthy();
        });
    });

    describe('cancelSubscription', () => {
        it('throws ForbiddenException when company is not found', async () => {
            repo.findOne.mockResolvedValue(null);
            await expect(service.cancelSubscription('bad-id')).rejects.toThrow(ForbiddenException);
        });

        it('throws BadRequestException when no active subscription', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, stripeSubscriptionId: null } as Company);
            await expect(service.cancelSubscription('company-uuid-1')).rejects.toThrow(BadRequestException);
        });

        it('calls stripe.subscriptions.cancel with the subscription ID', async () => {
            repo.findOne.mockResolvedValue({
                ...mockCompanyFree,
                stripeSubscriptionId: 'sub_abc123',
            } as Company);
            mockStripe.subscriptions.retrieve.mockResolvedValue({ status: 'active' });
            mockStripe.subscriptions.cancel.mockResolvedValue({ id: 'sub_abc123', status: 'canceled' });

            await service.cancelSubscription('company-uuid-1');

            expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_abc123');
        });

        it('immediately downgrades company to FREE and clears subscription data', async () => {
            repo.findOne.mockResolvedValue({
                ...mockCompanyFree,
                stripeSubscriptionId: 'sub_abc123',
            } as Company);
            mockStripe.subscriptions.retrieve.mockResolvedValue({ status: 'active' });
            mockStripe.subscriptions.cancel.mockResolvedValue({ id: 'sub_abc123', status: 'canceled' });

            await service.cancelSubscription('company-uuid-1');

            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', {
                subscriptionTier: SubscriptionTier.FREE,
                stripeSubscriptionId: null,
                stripeSubscriptionStatus: 'canceled',
                subscriptionExpiresAt: null,
                maxUsers: 1,
                maxCountries: 1,
                maxProperties: 25,
            });
        });
    });

    describe('handleWebhook', () => {
        const rawBody = Buffer.from('{}');
        const sig = 'stripe-sig-value';

        it('throws BadRequestException on invalid signature', async () => {
            mockStripe.webhooks.constructEvent.mockImplementation(() => {
                throw new Error('Invalid signature');
            });
            await expect(service.handleWebhook(rawBody, sig)).rejects.toThrow(BadRequestException);
        });

        it('handles checkout.session.completed — updates tier and subscription fields', async () => {
            const periodEnd = 1800000000;
            repo.findOne.mockResolvedValue({ ...mockCompanyFree } as Company);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'checkout.session.completed',
                data: {
                    object: {
                        metadata: { companyId: 'company-uuid-1', tier: 'STARTER' },
                        subscription: 'sub_new123',
                    },
                },
            });
            mockStripe.subscriptions.retrieve.mockResolvedValue({
                items: { data: [{ current_period_end: periodEnd }] },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', {
                subscriptionTier: SubscriptionTier.STARTER,
                stripeSubscriptionId: 'sub_new123',
                stripeSubscriptionStatus: 'active',
                subscriptionExpiresAt: new Date(periodEnd * 1000),
                maxUsers: 5,
                maxCountries: 1,
                maxProperties: 100,
            });
        });

        it('handles checkout.session.completed — does nothing when company is not found', async () => {
            repo.findOne.mockResolvedValue(null);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'checkout.session.completed',
                data: {
                    object: {
                        metadata: { companyId: 'deleted-company', tier: 'STARTER' },
                        subscription: 'sub_new123',
                    },
                },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).not.toHaveBeenCalled();
        });

        it('handles checkout.session.completed — does nothing when metadata is missing', async () => {
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'checkout.session.completed',
                data: {
                    object: {
                        metadata: null,
                        subscription: 'sub_new123',
                    },
                },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).not.toHaveBeenCalled();
        });

        it('handles customer.subscription.updated — syncs status and expiry', async () => {
            const periodEnd = 1800000000;
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, id: 'company-uuid-1', stripeSubscriptionId: 'sub_abc' } as Company);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'customer.subscription.updated',
                data: {
                    object: { id: 'sub_abc', status: 'past_due', customer: 'cus_123', items: { data: [{ current_period_end: periodEnd }] } },
                },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', {
                stripeSubscriptionStatus: 'past_due',
                subscriptionExpiresAt: new Date(periodEnd * 1000),
            });
        });

        it('handles customer.subscription.updated — does nothing if company not found', async () => {
            repo.findOne.mockResolvedValue(null);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'customer.subscription.updated',
                data: { object: { id: 'sub_unknown', status: 'active', customer: 'cus_unknown' } },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).not.toHaveBeenCalled();
        });

        it('handles customer.subscription.deleted — downgrades to FREE', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, id: 'company-uuid-1', stripeCustomerId: 'cus_123' } as Company);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'customer.subscription.deleted',
                data: { object: { id: 'sub_abc', customer: 'cus_123' } },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', {
                subscriptionTier: SubscriptionTier.FREE,
                stripeSubscriptionId: null,
                stripeSubscriptionStatus: 'canceled',
                subscriptionExpiresAt: null,
                maxUsers: 1,
                maxCountries: 1,
                maxProperties: 25,
            });
        });

        it('handles invoice.payment_failed — sets past_due status', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, id: 'company-uuid-1', stripeCustomerId: 'cus_123' } as Company);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'invoice.payment_failed',
                data: { object: { customer: 'cus_123' } },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', { stripeSubscriptionStatus: 'past_due' });
        });

        it('handles invoice.payment_succeeded — clears past_due status', async () => {
            repo.findOne.mockResolvedValue({ ...mockCompanyFree, id: 'company-uuid-1', stripeCustomerId: 'cus_123' } as Company);
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'invoice.payment_succeeded',
                data: { object: { customer: 'cus_123' } },
            });

            await service.handleWebhook(rawBody, sig);

            expect(repo.update).toHaveBeenCalledWith('company-uuid-1', { stripeSubscriptionStatus: 'active' });
        });

        it('ignores unhandled event types without error', async () => {
            mockStripe.webhooks.constructEvent.mockReturnValue({
                type: 'customer.created',
                data: { object: {} },
            });

            await expect(service.handleWebhook(rawBody, sig)).resolves.not.toThrow();
        });
    });
});
