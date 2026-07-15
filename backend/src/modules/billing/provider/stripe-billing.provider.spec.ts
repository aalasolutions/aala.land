import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeBillingProvider } from './stripe-billing.provider';

const mockCreate = jest.fn();
const mockSearch = jest.fn();
const mockPricesCreate = jest.fn();
const mockSubRetrieve = jest.fn();
const mockSubUpdate = jest.fn();
const mockSubItemUpdate = jest.fn();
const mockSubItemCreate = jest.fn();
const mockSubItemDel = jest.fn();

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
        update: mockSubUpdate,
    },
    subscriptionItems: {
        update: mockSubItemUpdate,
        create: mockSubItemCreate,
        del: mockSubItemDel,
    },
};

jest.mock('stripe', () => jest.fn().mockImplementation(() => mockStripeClient));

describe('StripeBillingProvider', () => {
    let provider: StripeBillingProvider;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Reset product cache between tests by resetting the mock for search
        mockSearch.mockResolvedValue({ data: [] });
        mockStripeClient.products.create = jest
            .fn()
            .mockResolvedValue({ id: 'prod_test123' });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StripeBillingProvider,
                {
                    provide: ConfigService,
                    useValue: {
                        getOrThrow: jest
                            .fn()
                            .mockReturnValue('sk_test_fake_key'),
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
                expect.objectContaining({
                    timeout: 8000,
                    maxNetworkRetries: 0,
                }),
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
                expect.objectContaining({
                    metadata: { companyId: 'company-uuid-9' },
                }),
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
            mockPricesCreate.mockResolvedValue({
                id: 'price_for_existing_product',
            });

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
                        {
                            id: 'si_base',
                            quantity: 1,
                            price: { metadata: { kind: 'ENTERPRISE_BASE' } },
                        },
                        {
                            id: 'si_seat',
                            quantity: 6,
                            price: { metadata: { kind: 'SEAT' } },
                        },
                    ],
                },
            });

            const qty = await provider.getSeatQuantity(ref);

            expect(mockSubRetrieve).toHaveBeenCalledWith('sub_1', {
                expand: ['items'],
            });
            expect(qty).toBe(6);
        });

        it('returns 0 when there is no SEAT-metadata item (no fallback to the first line item, e.g. a solo ENTERPRISE whose base covers the only seat)', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: {
                    data: [
                        {
                            id: 'si_base',
                            quantity: 1,
                            price: { metadata: { kind: 'ENTERPRISE_BASE' } },
                        },
                    ],
                },
            });

            const qty = await provider.getSeatQuantity(ref);
            expect(qty).toBe(0);
        });

        it('returns 0 when the subscription has no line items (never throws)', async () => {
            mockSubRetrieve.mockResolvedValue({ items: { data: [] } });
            await expect(provider.getSeatQuantity(ref)).resolves.toBe(0);
        });
    });

    describe('updateSeatQuantity', () => {
        const ref = { subscriptionId: 'sub_1', customerId: 'cus_1' };

        it('updates the resolved SEAT item to the given quantity with immediate proration', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: {
                    data: [
                        {
                            id: 'si_seat',
                            quantity: 3,
                            price: { metadata: { kind: 'SEAT' } },
                        },
                    ],
                },
            });
            mockSubItemUpdate.mockResolvedValue({});

            await provider.updateSeatQuantity(ref, 4);

            expect(mockSubItemUpdate).toHaveBeenCalledWith('si_seat', {
                quantity: 4,
                proration_behavior: 'create_prorations',
            });
            expect(mockSubItemCreate).not.toHaveBeenCalled();
            expect(mockSubItemDel).not.toHaveBeenCalled();
        });

        it('creates a new SEAT item using the supplied seat price id when none exists yet and quantity > 0 (first extra seat on a solo ENTERPRISE)', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: {
                    data: [
                        {
                            id: 'si_base',
                            quantity: 1,
                            price: { metadata: { kind: 'ENTERPRISE_BASE' } },
                        },
                    ],
                },
            });
            mockSubItemCreate.mockResolvedValue({});

            await provider.updateSeatQuantity(ref, 2, 'price_seat_new');

            expect(mockSubItemCreate).toHaveBeenCalledWith({
                subscription: 'sub_1',
                price: 'price_seat_new',
                quantity: 2,
                proration_behavior: 'create_prorations',
            });
            expect(mockSubItemUpdate).not.toHaveBeenCalled();
        });

        it('throws when quantity > 0, no SEAT item exists, and no seatPriceId is supplied', async () => {
            mockSubRetrieve.mockResolvedValue({ items: { data: [] } });

            await expect(provider.updateSeatQuantity(ref, 2)).rejects.toThrow(
                'no existing SEAT item and no seat price id supplied',
            );
            expect(mockSubItemCreate).not.toHaveBeenCalled();
        });

        it('deletes the SEAT item when quantity <= 0 and a SEAT item exists (back to a solo owner)', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: {
                    data: [
                        {
                            id: 'si_seat',
                            quantity: 1,
                            price: { metadata: { kind: 'SEAT' } },
                        },
                    ],
                },
            });
            mockSubItemDel.mockResolvedValue({});

            await provider.updateSeatQuantity(ref, 0);

            expect(mockSubItemDel).toHaveBeenCalledWith('si_seat', {
                proration_behavior: 'create_prorations',
            });
        });

        it('is a no-op when quantity <= 0 and no SEAT item exists', async () => {
            mockSubRetrieve.mockResolvedValue({
                items: {
                    data: [
                        {
                            id: 'si_base',
                            quantity: 1,
                            price: { metadata: { kind: 'ENTERPRISE_BASE' } },
                        },
                    ],
                },
            });

            await provider.updateSeatQuantity(ref, 0);

            expect(mockSubItemDel).not.toHaveBeenCalled();
            expect(mockSubItemUpdate).not.toHaveBeenCalled();
            expect(mockSubItemCreate).not.toHaveBeenCalled();
        });
    });

    describe('changePlan', () => {
        const ref = { subscriptionId: 'sub_1', customerId: 'cus_1' };

        function retrieved(items: unknown[]) {
            mockSubRetrieve.mockResolvedValue({
                metadata: { companyId: 'c1' },
                items: { data: items },
            });
            mockSubUpdate.mockResolvedValue({});
        }

        it('PRO -> ENTERPRISE: drops the seat line by 1, adds the base, tags the plan', async () => {
            retrieved([
                {
                    id: 'si_seat',
                    quantity: 3,
                    price: { metadata: { kind: 'SEAT' } },
                },
            ]);

            await provider.changePlan({
                ...ref,
                plan: 'ENTERPRISE',
                seatPriceId: 'price_seat',
                basePriceId: 'price_base',
            });

            expect(mockSubUpdate).toHaveBeenCalledWith('sub_1', {
                items: [
                    { id: 'si_seat', price: 'price_seat', quantity: 2 },
                    { price: 'price_base', quantity: 1 },
                ],
                metadata: { companyId: 'c1', plan: 'ENTERPRISE' },
                proration_behavior: 'create_prorations',
            });
        });

        it('PRO solo -> ENTERPRISE: deletes the seat line (base covers the seat), adds the base', async () => {
            retrieved([
                {
                    id: 'si_seat',
                    quantity: 1,
                    price: { metadata: { kind: 'SEAT' } },
                },
            ]);

            await provider.changePlan({
                ...ref,
                plan: 'ENTERPRISE',
                seatPriceId: 'price_seat',
                basePriceId: 'price_base',
            });

            expect(mockSubUpdate).toHaveBeenCalledWith('sub_1', {
                items: [
                    { id: 'si_seat', deleted: true },
                    { price: 'price_base', quantity: 1 },
                ],
                metadata: { companyId: 'c1', plan: 'ENTERPRISE' },
                proration_behavior: 'create_prorations',
            });
        });

        it('ENTERPRISE -> PRO: raises the seat line by 1, removes the base, tags the plan', async () => {
            retrieved([
                {
                    id: 'si_base',
                    quantity: 1,
                    price: { metadata: { kind: 'ENTERPRISE_BASE' } },
                },
                {
                    id: 'si_seat',
                    quantity: 2,
                    price: { metadata: { kind: 'SEAT' } },
                },
            ]);

            await provider.changePlan({
                ...ref,
                plan: 'PRO',
                seatPriceId: 'price_seat',
                basePriceId: null,
            });

            expect(mockSubUpdate).toHaveBeenCalledWith('sub_1', {
                items: [
                    { id: 'si_seat', price: 'price_seat', quantity: 3 },
                    { id: 'si_base', deleted: true },
                ],
                metadata: { companyId: 'c1', plan: 'PRO' },
                proration_behavior: 'create_prorations',
            });
        });

        it('ENTERPRISE solo -> PRO: creates a seat line (the freed base seat), removes the base', async () => {
            retrieved([
                {
                    id: 'si_base',
                    quantity: 1,
                    price: { metadata: { kind: 'ENTERPRISE_BASE' } },
                },
            ]);

            await provider.changePlan({
                ...ref,
                plan: 'PRO',
                seatPriceId: 'price_seat',
                basePriceId: null,
            });

            expect(mockSubUpdate).toHaveBeenCalledWith('sub_1', {
                items: [
                    { price: 'price_seat', quantity: 1 },
                    { id: 'si_base', deleted: true },
                ],
                metadata: { companyId: 'c1', plan: 'PRO' },
                proration_behavior: 'create_prorations',
            });
        });

        it('throws when the subscription has no line items', async () => {
            retrieved([]);
            await expect(
                provider.changePlan({
                    ...ref,
                    plan: 'PRO',
                    seatPriceId: 'price_seat',
                    basePriceId: null,
                }),
            ).rejects.toThrow('no line items');
        });
    });

    describe('getCancellationState', () => {
        const ref = { subscriptionId: 'sub_1', customerId: 'cus_1' };

        it('reads current_period_end off the expanded line item for the cancel date', async () => {
            mockSubRetrieve.mockResolvedValue({
                cancel_at_period_end: true,
                cancel_at: null,
                items: {
                    data: [
                        {
                            current_period_end: 1782600000,
                            price: { metadata: { kind: 'SEAT' } },
                        },
                    ],
                },
            });

            const state = await provider.getCancellationState(ref);

            expect(mockSubRetrieve).toHaveBeenCalledWith('sub_1', {
                expand: ['items'],
            });
            expect(state.cancelAtPeriodEnd).toBe(true);
            expect(state.cancelAt).toEqual(new Date(1782600000 * 1000));
        });
    });
});
