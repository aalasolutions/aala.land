import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeBillingProvider } from './stripe-billing.provider';

const mockCreate = jest.fn();
const mockSearch = jest.fn();
const mockPricesCreate = jest.fn();

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

    describe('ensureCustomer', () => {
        it('calls stripe.customers.create with companyId in metadata and returns customer id', async () => {
            mockCreate.mockResolvedValue({ id: 'cus_test123' });

            const result = await provider.ensureCustomer({
                companyId: 'company-uuid-1',
                companyName: 'Test Company',
                email: 'admin@test.com',
            });

            expect(mockCreate).toHaveBeenCalledWith({
                name: 'Test Company',
                email: 'admin@test.com',
                metadata: { companyId: 'company-uuid-1' },
            });
            expect(result).toBe('cus_test123');
        });

        it('omits email when not provided', async () => {
            mockCreate.mockResolvedValue({ id: 'cus_no_email' });

            await provider.ensureCustomer({
                companyId: 'company-uuid-2',
                companyName: 'No Email Co',
            });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ email: undefined }),
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
});
