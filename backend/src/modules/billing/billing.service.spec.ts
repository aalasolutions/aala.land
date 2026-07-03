import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from './billing.service';
import { BillingPrice } from './entities/billing-price.entity';
import { BILLING_PROVIDER, BillingProvider } from './provider/billing-provider.interface';
import { Company } from '../companies/entities/company.entity';

describe('BillingService', () => {
    let service: BillingService;
    let companyRepo: jest.Mocked<Repository<Company>>;
    let priceRepo: jest.Mocked<Repository<BillingPrice>>;
    let provider: jest.Mocked<BillingProvider>;

    const mockCompany: Partial<Company> = {
        id: 'company-uuid-1',
        name: 'Test Company',
        billingCustomerId: null,
        billingProvider: 'stripe',
    };

    const mockCompanyWithCustomer: Partial<Company> = {
        id: 'company-uuid-2',
        name: 'Already Billed Co',
        billingCustomerId: 'cus_existing123',
        billingProvider: 'stripe',
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                {
                    provide: getRepositoryToken(Company),
                    useValue: {
                        update: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(BillingPrice),
                    useValue: {
                        find: jest.fn(),
                        update: jest.fn(),
                    },
                },
                {
                    provide: BILLING_PROVIDER,
                    useValue: {
                        ensureCustomer: jest.fn(),
                        ensurePrice: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
        companyRepo = module.get(getRepositoryToken(Company));
        priceRepo = module.get(getRepositoryToken(BillingPrice));
        provider = module.get(BILLING_PROVIDER);
    });

    describe('ensureCompanyCustomer', () => {
        it('returns existing customerId without calling provider when billingCustomerId is set', async () => {
            const result = await service.ensureCompanyCustomer(mockCompanyWithCustomer as Company);

            expect(provider.ensureCustomer).not.toHaveBeenCalled();
            expect(result).toBe('cus_existing123');
        });

        it('calls provider and updates company when billingCustomerId is null', async () => {
            (provider.ensureCustomer as jest.Mock).mockResolvedValue('cus_new456');
            (companyRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

            const result = await service.ensureCompanyCustomer(mockCompany as Company);

            expect(provider.ensureCustomer).toHaveBeenCalledWith({
                companyId: 'company-uuid-1',
                companyName: 'Test Company',
            });
            expect(companyRepo.update).toHaveBeenCalledWith('company-uuid-1', {
                billingCustomerId: 'cus_new456',
                billingProvider: 'stripe',
            });
            expect(result).toBe('cus_new456');
        });

        it('propagates provider errors upward', async () => {
            (provider.ensureCustomer as jest.Mock).mockRejectedValue(new Error('Stripe API down'));

            await expect(service.ensureCompanyCustomer(mockCompany as Company)).rejects.toThrow('Stripe API down');
        });
    });

    describe('syncPrices', () => {
        it('skips rows that already have providerPriceId and returns correct counts', async () => {
            const rows: Partial<BillingPrice>[] = [
                { id: 'bp-1', kind: 'SEAT', currency: 'usd', unitAmount: 2500, active: true, providerPriceId: 'price_existing' },
                { id: 'bp-2', kind: 'SEAT', currency: 'aed', unitAmount: 9500, active: true, providerPriceId: 'price_existing2' },
            ];
            (priceRepo.find as jest.Mock).mockResolvedValue(rows);

            const result = await service.syncPrices();

            expect(provider.ensurePrice).not.toHaveBeenCalled();
            expect(result).toEqual({ synced: 0, total: 2 });
        });

        it('creates provider prices for rows without providerPriceId and returns counts', async () => {
            const rows: Partial<BillingPrice>[] = [
                { id: 'bp-1', kind: 'SEAT', currency: 'usd', unitAmount: 2500, active: true, providerPriceId: null },
                { id: 'bp-2', kind: 'SEAT', currency: 'aed', unitAmount: 9500, active: true, providerPriceId: 'price_existing' },
                { id: 'bp-3', kind: 'ENTERPRISE_BASE', currency: 'usd', unitAmount: 25000, active: true, providerPriceId: null },
            ];
            (priceRepo.find as jest.Mock).mockResolvedValue(rows);
            (provider.ensurePrice as jest.Mock)
                .mockResolvedValueOnce('price_new_usd')
                .mockResolvedValueOnce('price_new_ent_usd');
            (priceRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

            const result = await service.syncPrices();

            expect(provider.ensurePrice).toHaveBeenCalledTimes(2);
            expect(provider.ensurePrice).toHaveBeenCalledWith('SEAT', 'usd', 2500);
            expect(provider.ensurePrice).toHaveBeenCalledWith('ENTERPRISE_BASE', 'usd', 25000);
            expect(priceRepo.update).toHaveBeenCalledWith('bp-1', { providerPriceId: 'price_new_usd' });
            expect(priceRepo.update).toHaveBeenCalledWith('bp-3', { providerPriceId: 'price_new_ent_usd' });
            expect(result).toEqual({ synced: 2, total: 3 });
        });

        it('returns zero counts when no active prices exist', async () => {
            (priceRepo.find as jest.Mock).mockResolvedValue([]);

            const result = await service.syncPrices();

            expect(result).toEqual({ synced: 0, total: 0 });
        });
    });
});
