import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeBillingProvider } from './stripe-billing.provider';

const mockCreate = jest.fn();
const mockSearch = jest.fn();
const mockPricesCreate = jest.fn();
const mockSubRetrieve = jest.fn();
const mockSubItemUpdate = jest.fn();

const mockStripeClient = {
    customers: {
        create: mockCreate,
    },
    products: {
        search: mockSearch,
        create: jest.fn(),
    },
    prices: {
        create: mockPricesCreate,
    },
    subscriptions: {
        retrieve: mockSubRetrieve,
    },
    subscriptionItems: {
        update: mockSubItemUpdate,
    },
};

jest.mock('stripe', () => jest.fn().mockImplementation(() => mockStripeClient));

describe('StripeBillingProvider', () => {
    let provider: StripeBillingProvider;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Reset product cache between tests by resetting the mock for search
        mockSearch.mockResolvedValue({ data: [] });
        mockStripeClient.products.create = jest.fn().mockResolvedValue({ id: 'prod_test123' });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StripeBillingProvider,
                {
                    provide: ConfigService,
                    useValue: {
                        getOrThrow: jest.fn().mockReturnValue('sk_test_fake_key'),
                    },
                },
            ],
        }).compile();

        provider = module.get<StripeBillingProvider>(StripeBillingProvider);
    });

    describe('client construction', () => {
        it('constructs the Stripe client with a short request timeout and no network retries (race audit MEDIUM Stripe-timeout)', () => {
            // The per-company advisory lock is held across Stripe calls, so a hung
            // request must not pin the lock indefinitely: 8s timeout, 0 retries.
            const StripeMock = Stripe as unknown as jest.Mock;
            expect(StripeMock).toHaveBeenCalledWith(
                'sk_test_fake_key',
                expect.objectContaining({ timeout: 8000, maxNetworkRetries: 0 }),
            );
        });
    });

    describe('ensureCustomer', () => {
        it('calls stripe.customers.create with companyId in metadata and returns customer id', async () => {
            mockCreate.mockResolvedValue({ id: 'cus_test123' });

            const result = await provider.ensureCustomer({
                companyId: 'company-uuid-1',
                companyName: 'Test Company',
                email: 'admin@test.com',
            });

            expect(mockCreate).toHaveBeenCalledWith(
                {
                    name: 'Test Company',
                    email: 'admin@test.com',
                    metadata: { companyId: 'company-uuid-1' },
                },
                // No idempotency key supplied -> no second-arg options.
                undefined,
            );
            expect(result).toBe('cus_test123');
        });

        it('passes a Stripe idempotency key as the second arg when supplied (P5 dedupe)', async () => {
            mockCreate.mockResolvedValue({ id: 'cus_idem' });

            await provider.ensureCustomer({
                companyId: 'company-uuid-9',
                companyName: 'Idem Co',
                idempotencyKey: 'ensure-customer:company-uuid-9',
            });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ metadata: { companyId: 'company-uuid-9' } }),
                { idempotencyKey: 'ensure-customer:company-uuid-9' },
            );
        });

        it('omits email when not provided', async () => {
            mockCreate.mockResolvedValue({ id: 'cus_no_email' });

            await provider.ensureCustomer({
                companyId: 'company-uuid-2',
                companyName: 'No Email Co',
            });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ email: undefined }),
                undefined,
            );
        });

        it('omits email when null is passed', async () => {
            mockCreate.mockResolvedValue({ id: 'cus_null_email' });

            await provider.ensureCustomer({
                companyId: 'company-uuid-3',
                companyName: 'Null Email Co',
                email: null,
            });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ email: undefined }),
                undefined,
            );
        });
    });

    describe('ensurePrice', () => {
        it('creates a recurring monthly Price with correct args and returns the price id', async () => {
            mockPricesCreate.mockResolvedValue({ id: 'price_seat_usd' });

            const result = await provider.ensurePrice('SEAT', 'usd', 2500);

            expect(mockPricesCreate).toHaveBeenCalledWith({
                product: 'prod_test123',
                currency: 'usd',
                unit_amount: 2500,
                recurring: { interval: 'month' },
                metadata: { kind: 'SEAT', currency: 'usd' },
            });
            expect(result).toBe('price_seat_usd');
        });

        it('caches the product id on the second ensurePrice call', async () => {
            mockPricesCreate
                .mockResolvedValueOnce({ id: 'price_seat_usd' })
                .mockResolvedValueOnce({ id: 'price_seat_aed' });

            await provider.ensurePrice('SEAT', 'usd', 2500);
            await provider.ensurePrice('SEAT', 'aed', 9500);

            // products.search and products.create should only be called once total
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockStripeClient.products.create).toHaveBeenCalledTimes(1);
        });

        it('uses existing product when found via search', async () => {
            mockSearch.mockResolvedValue({ data: [{ id: 'prod_existing' }] });
            mockPricesCreate.mockResolvedValue({ id: 'price_for_existing_product' });

            await provider.ensurePrice('ENTERPRISE_BASE', 'usd', 25000);

            expect(mockStripeClient.products.create).not.toHaveBeenCalled();
            expect(mockPricesCreate).toHaveBeenCalledWith(
                expect.objectContaining({ product: 'prod_existing' }),
            );
        });

        it('lowercases currency before calling stripe', async () => {
            mockPricesCreate.mockResolvedValue({ id: 'price_lower' });

            await provider.ensurePrice('SEAT', 'USD', 2500);

            expect(mockPricesCreate).toHaveBeenCalledWith(
                expect.objectContaining({ currency: 'usd' }),
            );
        });
    });

    describe('getSeatQuantity', () => {
        const ref = { subscriptionId: 'sub_1', customerId: 'cus_1' };

        it('returns the live quantity from the SEAT-metadata line item', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: {
                    data: [
                        { id: 'si_base', quantity: 1, price: { metadata: { kind: 'ENTERPRISE_BASE' } } },
                        { id: 'si_seat', quantity: 6, price: { metadata: { kind: 'SEAT' } } },
                    ],
                },
            });

            const qty = await provider.getSeatQuantity(ref);

            expect(mockSubRetrieve).toHaveBeenCalledWith('sub_1', { expand: ['items'] });
            expect(qty).toBe(6);
        });

        it('falls back to the first line item and floors at 1 for metadata-less subscriptions', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: { data: [{ id: 'si_only', quantity: undefined, price: {} }] },
            });

            const qty = await provider.getSeatQuantity(ref);
            expect(qty).toBe(1);
        });

        it('throws when the subscription has no line items', async () => {
            mockSubRetrieve.mockResolvedValue({ items: { data: [] } });
            await expect(provider.getSeatQuantity(ref)).rejects.toThrow('No subscription items found');
        });
    });

    describe('updateSeatQuantity', () => {
        it('updates the resolved SEAT item to the given quantity', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: { data: [{ id: 'si_seat', quantity: 3, price: { metadata: { kind: 'SEAT' } } }] },
            });
            mockSubItemUpdate.mockResolvedValue({});

            await provider.updateSeatQuantity({ subscriptionId: 'sub_1', customerId: 'cus_1' }, 4);

            expect(mockSubItemUpdate).toHaveBeenCalledWith('si_seat', { quantity: 4 });
        });
    });
});
