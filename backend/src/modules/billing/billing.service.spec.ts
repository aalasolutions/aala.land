import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillingService } from './billing.service';
import { BillingPrice } from './entities/billing-price.entity';
import {
  BILLING_PROVIDER,
  BillingProvider,
} from './provider/billing-provider.interface';
import {
  Company,
  SubscriptionTier,
} from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';

const companyId = 'company-uuid-1';

const makeCompany = (overrides: Partial<Company> = {}): Company =>
  ({
    id: companyId,
    name: 'Test Company',
    billingCustomerId: null,
    billingProvider: 'stripe',
    billingSubscriptionId: null,
    billingStatus: null,
    subscriptionTier: SubscriptionTier.FREE,
    purchasedSeats: 1,
    defaultRegionCode: 'dubai',
    ...overrides,
  }) as Company;

const mockProviderMethods = {
  ensureCustomer: jest.fn(),
  ensurePrice: jest.fn(),
  createSubscription: jest.fn(),
  getSeatQuantity: jest.fn(),
  updateSeatQuantity: jest.fn(),
  changePlan: jest.fn(),
  cancel: jest.fn(),
  parseWebhook: jest.fn(),
};

// EntityManager surface the advisory-lock helper drives inside a transaction.
let managerMock: {
  query: jest.Mock;
  findOne: jest.Mock;
  update: jest.Mock;
};

describe('BillingService', () => {
  let service: BillingService;
  let companyRepo: jest.Mocked<Repository<Company>>;
  let priceRepo: jest.Mocked<Repository<BillingPrice>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let provider: jest.Mocked<BillingProvider>;

  beforeEach(async () => {
    jest.clearAllMocks();
    managerMock = {
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSourceMock = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(managerMock),
      ),
    };
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
          provide: getRepositoryToken(BillingPrice),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            count: jest.fn(),
          },
        },
        {
          provide: BILLING_PROVIDER,
          useValue: { ...mockProviderMethods },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'CORS_ORIGIN' ? 'http://localhost:4200' : undefined,
            ),
          },
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    companyRepo = module.get(getRepositoryToken(Company));
    priceRepo = module.get(getRepositoryToken(BillingPrice));
    userRepo = module.get(getRepositoryToken(User));
    provider = module.get(BILLING_PROVIDER);
  });

  // -------------------------------------------------------------------------
  // Unit 1 tests
  // -------------------------------------------------------------------------

  describe('ensureCompanyCustomer', () => {
    it('returns existing customerId without locking or calling provider when set on the snapshot', async () => {
      const company = makeCompany({ billingCustomerId: 'cus_existing123' });
      const result = await service.ensureCompanyCustomer(company);

      expect(provider.ensureCustomer).not.toHaveBeenCalled();
      // Fast path: no lock transaction opened.
      expect(managerMock.query).not.toHaveBeenCalled();
      expect(result).toBe('cus_existing123');
    });

    it('re-reads under the lock and returns the customerId set by a concurrent writer without creating a duplicate', async () => {
      const company = makeCompany();
      // Snapshot had null, but a racing writer already set it: the locked re-read finds it.
      managerMock.findOne.mockResolvedValue(
        makeCompany({ billingCustomerId: 'cus_race' }),
      );

      const result = await service.ensureCompanyCustomer(company);

      expect(managerMock.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [companyId],
      );
      expect(provider.ensureCustomer).not.toHaveBeenCalled();
      expect(managerMock.update).not.toHaveBeenCalled();
      expect(result).toBe('cus_race');
    });

    it('locks, creates with an idempotency key, and updates when still null under the lock', async () => {
      const company = makeCompany();
      managerMock.findOne.mockResolvedValue(makeCompany());
      (provider.ensureCustomer as jest.Mock).mockResolvedValue('cus_new456');

      const result = await service.ensureCompanyCustomer(company);

      expect(managerMock.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [companyId],
      );
      expect(provider.ensureCustomer).toHaveBeenCalledWith({
        companyId,
        companyName: 'Test Company',
        idempotencyKey: `ensure-customer:${companyId}`,
      });
      expect(managerMock.update).toHaveBeenCalledWith(Company, companyId, {
        billingCustomerId: 'cus_new456',
        billingProvider: 'stripe',
      });
      expect(result).toBe('cus_new456');
    });

    it('propagates provider errors upward', async () => {
      const company = makeCompany();
      managerMock.findOne.mockResolvedValue(makeCompany());
      (provider.ensureCustomer as jest.Mock).mockRejectedValue(
        new Error('Stripe API down'),
      );
      await expect(service.ensureCompanyCustomer(company)).rejects.toThrow(
        'Stripe API down',
      );
    });
  });

  describe('syncPrices', () => {
    it('skips rows that already have providerPriceId and returns correct counts', async () => {
      const rows: Partial<BillingPrice>[] = [
        {
          id: 'bp-1',
          kind: 'SEAT',
          currency: 'usd',
          unitAmount: 2500,
          active: true,
          providerPriceId: 'price_existing',
        },
        {
          id: 'bp-2',
          kind: 'SEAT',
          currency: 'aed',
          unitAmount: 9500,
          active: true,
          providerPriceId: 'price_existing2',
        },
      ];
      (priceRepo.find as jest.Mock).mockResolvedValue(rows);

      const result = await service.syncPrices();

      expect(provider.ensurePrice).not.toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, total: 2 });
    });

    it('creates provider prices for rows without providerPriceId and returns counts', async () => {
      const rows: Partial<BillingPrice>[] = [
        {
          id: 'bp-1',
          kind: 'SEAT',
          currency: 'usd',
          unitAmount: 2500,
          active: true,
          providerPriceId: null,
        },
        {
          id: 'bp-2',
          kind: 'SEAT',
          currency: 'aed',
          unitAmount: 9500,
          active: true,
          providerPriceId: 'price_existing',
        },
        {
          id: 'bp-3',
          kind: 'ENTERPRISE_BASE',
          currency: 'usd',
          unitAmount: 25000,
          active: true,
          providerPriceId: null,
        },
      ];
      (priceRepo.find as jest.Mock).mockResolvedValue(rows);
      (provider.ensurePrice as jest.Mock)
        .mockResolvedValueOnce('price_new_usd')
        .mockResolvedValueOnce('price_new_ent_usd');
      (priceRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const result = await service.syncPrices();

      expect(provider.ensurePrice).toHaveBeenCalledTimes(2);
      expect(provider.ensurePrice).toHaveBeenCalledWith('SEAT', 'usd', 2500);
      expect(provider.ensurePrice).toHaveBeenCalledWith(
        'ENTERPRISE_BASE',
        'usd',
        25000,
      );
      expect(result).toEqual({ synced: 2, total: 3 });
    });

    it('returns zero counts when no active prices exist', async () => {
      (priceRepo.find as jest.Mock).mockResolvedValue([]);
      const result = await service.syncPrices();
      expect(result).toEqual({ synced: 0, total: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Unit 3 tests
  // -------------------------------------------------------------------------

  describe('getSubscriptionState', () => {
    it('returns the rich billing snapshot for a FREE company with no subscription', async () => {
      companyRepo.findOne.mockResolvedValue(makeCompany());
      priceRepo.findOne.mockResolvedValue({ unitAmount: 9500 } as any);
      userRepo.count.mockResolvedValue(1);

      const state = await service.getSubscriptionState(companyId);

      expect(state).toEqual({
        tier: SubscriptionTier.FREE,
        billingStatus: null,
        hasSubscription: false,
        purchasedSeats: 1,
        activeUsers: 1,
        currency: 'aed',
        seatAmount: 9500,
        canDowngradeToFree: true,
      });
      expect(state).not.toHaveProperty('billingSubscriptionId');
    });

    it('reports hasSubscription and blocks downgrade with more than 1 active user', async () => {
      companyRepo.findOne.mockResolvedValue(
        makeCompany({
          subscriptionTier: SubscriptionTier.PRO,
          billingStatus: 'active',
          billingSubscriptionId: 'sub_123',
          purchasedSeats: 4,
        }),
      );
      priceRepo.findOne.mockResolvedValue({ unitAmount: 9500 } as any);
      userRepo.count.mockResolvedValue(3);

      const state = await service.getSubscriptionState(companyId);

      expect(state.tier).toBe(SubscriptionTier.PRO);
      expect(state.hasSubscription).toBe(true);
      expect(state.activeUsers).toBe(3);
      expect(state.canDowngradeToFree).toBe(false);
      expect(state.seatAmount).toBe(9500);
      expect(state.currency).toBe('aed');
    });

    it('returns seatAmount null when no active SEAT price exists', async () => {
      companyRepo.findOne.mockResolvedValue(makeCompany());
      priceRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(1);

      const state = await service.getSubscriptionState(companyId);
      expect(state.seatAmount).toBeNull();
    });
  });

  describe('startCheckout', () => {
    const seatPriceRow: Partial<BillingPrice> = {
      id: 'bp-1',
      kind: 'SEAT',
      currency: 'aed',
      unitAmount: 9500,
      active: true,
      providerPriceId: 'price_aed_seat',
    };

    beforeEach(() => {
      companyRepo.findOne.mockResolvedValue(
        makeCompany({ billingCustomerId: 'cus_1' }),
      );
      priceRepo.findOne.mockResolvedValue(seatPriceRow as BillingPrice);
      userRepo.count.mockResolvedValue(2);
      (provider.createSubscription as jest.Mock).mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/test',
        subscriptionId: null,
      });
    });

    it('calls createSubscription with the resolved currency, seat price, and active user count', async () => {
      const result = await service.startCheckout(
        companyId,
        'http://localhost:4200/billing/success',
        'http://localhost:4200/billing/cancel',
      );

      expect(provider.createSubscription).toHaveBeenCalledWith({
        customerId: 'cus_1',
        seatPriceId: 'price_aed_seat',
        basePriceId: null,
        quantity: 2,
        successUrl: 'http://localhost:4200/billing/success',
        cancelUrl: 'http://localhost:4200/billing/cancel',
        companyId,
      });
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/test');
      expect(result.subscriptionId).toBeNull();
    });

    it('uses quantity 1 when company has no active users', async () => {
      userRepo.count.mockResolvedValue(0);
      (provider.createSubscription as jest.Mock).mockClear();
      await service.startCheckout(
        companyId,
        'http://localhost:4200/billing/success',
        'http://localhost:4200/billing/cancel',
      );
      const call = (provider.createSubscription as jest.Mock).mock.calls[0][0];
      expect(call.quantity).toBe(1);
    });

    it('throws NotFoundException when company does not exist', async () => {
      companyRepo.findOne.mockResolvedValue(null);
      await expect(
        service.startCheckout(
          companyId,
          'http://localhost:4200/billing/success',
          'http://localhost:4200/billing/cancel',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no active SEAT price is found', async () => {
      priceRepo.findOne.mockResolvedValue(null);
      await expect(
        service.startCheckout(
          companyId,
          'http://localhost:4200/billing/success',
          'http://localhost:4200/billing/cancel',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when SEAT price is not yet synced to Stripe', async () => {
      priceRepo.findOne.mockResolvedValue({
        ...seatPriceRow,
        providerPriceId: null,
      } as BillingPrice);
      await expect(
        service.startCheckout(
          companyId,
          'http://localhost:4200/billing/success',
          'http://localhost:4200/billing/cancel',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when the company is not on the FREE plan', async () => {
      companyRepo.findOne.mockResolvedValue(
        makeCompany({
          subscriptionTier: SubscriptionTier.PRO,
          billingCustomerId: 'cus_1',
        }),
      );
      await expect(
        service.startCheckout(
          companyId,
          'http://localhost:4200/billing/success',
          'http://localhost:4200/billing/cancel',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(provider.createSubscription).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a redirect URL is on a disallowed origin', async () => {
      await expect(
        service.startCheckout(
          companyId,
          'https://evil.example.com/success',
          'http://localhost:4200/billing/cancel',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.createSubscription).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a redirect URL is not absolute', async () => {
      await expect(
        service.startCheckout(
          companyId,
          '/billing/success',
          'http://localhost:4200/billing/cancel',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.createSubscription).not.toHaveBeenCalled();
    });
  });

  describe('changePlanForCompany', () => {
    const seatPriceRow: Partial<BillingPrice> = {
      id: 'bp-1',
      kind: 'SEAT',
      currency: 'aed',
      unitAmount: 9500,
      active: true,
      providerPriceId: 'price_aed_seat',
    };
    const basePriceRow: Partial<BillingPrice> = {
      id: 'bp-2',
      kind: 'ENTERPRISE_BASE',
      currency: 'aed',
      unitAmount: 95000,
      active: true,
      providerPriceId: 'price_aed_base',
    };

    const proCompany = makeCompany({
      subscriptionTier: SubscriptionTier.PRO,
      billingSubscriptionId: 'sub_pro',
      billingCustomerId: 'cus_1',
      purchasedSeats: 3,
    });

    beforeEach(() => {
      companyRepo.findOne.mockResolvedValue(proCompany);
      (provider.changePlan as jest.Mock).mockResolvedValue(undefined);
    });

    it('calls provider.changePlan with basePriceId for ENTERPRISE upgrade', async () => {
      priceRepo.findOne
        .mockResolvedValueOnce(seatPriceRow as BillingPrice)
        .mockResolvedValueOnce(basePriceRow as BillingPrice);

      await service.changePlanForCompany(companyId, 'ENTERPRISE');

      expect(provider.changePlan).toHaveBeenCalledWith({
        subscriptionId: 'sub_pro',
        customerId: 'cus_1',
        plan: 'ENTERPRISE',
        seatPriceId: 'price_aed_seat',
        basePriceId: 'price_aed_base',
      });
    });

    it('calls provider.changePlan with null basePriceId for PRO downgrade', async () => {
      const entCompany = makeCompany({
        subscriptionTier: SubscriptionTier.ENTERPRISE,
        billingSubscriptionId: 'sub_ent',
        billingCustomerId: 'cus_1',
        purchasedSeats: 3,
      });
      companyRepo.findOne.mockResolvedValue(entCompany);
      priceRepo.findOne.mockResolvedValue(seatPriceRow as BillingPrice);

      await service.changePlanForCompany(companyId, 'PRO');

      expect(provider.changePlan).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'PRO', basePriceId: null }),
      );
    });

    it('throws BadRequestException when company has no active subscription', async () => {
      companyRepo.findOne.mockResolvedValue(makeCompany());
      await expect(
        service.changePlanForCompany(companyId, 'ENTERPRISE'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancelSubscription', () => {
    const activeCompany = makeCompany({
      subscriptionTier: SubscriptionTier.PRO,
      billingSubscriptionId: 'sub_pro',
      billingCustomerId: 'cus_1',
    });

    beforeEach(() => {
      companyRepo.findOne.mockResolvedValue(activeCompany);
      userRepo.count.mockResolvedValue(1);
      (provider.cancel as jest.Mock).mockResolvedValue(undefined);
    });

    it('calls provider.cancel when company has exactly 1 active user', async () => {
      await service.cancelSubscription(companyId);
      expect(provider.cancel).toHaveBeenCalledWith({
        subscriptionId: 'sub_pro',
        customerId: 'cus_1',
      });
    });

    it('throws ConflictException (409) when company has more than 1 active user', async () => {
      userRepo.count.mockResolvedValue(3);
      await expect(
        service.cancelSubscription(companyId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(provider.cancel).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when company has no active subscription', async () => {
      companyRepo.findOne.mockResolvedValue(makeCompany());
      await expect(
        service.cancelSubscription(companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when company does not exist', async () => {
      companyRepo.findOne.mockResolvedValue(null);
      await expect(
        service.cancelSubscription(companyId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // Unit 4 tests
  // -------------------------------------------------------------------------

  describe('reserveSeat', () => {
    const baseCompany = makeCompany({
      subscriptionTier: SubscriptionTier.PRO,
      // purchasedSeats is deliberately STALE (5) vs the live provider quantity
      // (7) to prove the target derives from the live value, not this column.
      purchasedSeats: 5,
      billingSubscriptionId: 'sub_test_123',
      billingCustomerId: 'cus_test_1',
    });

    beforeEach(() => {
      (provider.getSeatQuantity as jest.Mock).mockResolvedValue(7);
    });

    it('returns null and never calls the provider for FREE companies', async () => {
      const result = await service.reserveSeat(makeCompany());
      expect(result).toBeNull();
      expect(provider.getSeatQuantity).not.toHaveBeenCalled();
      expect(provider.updateSeatQuantity).not.toHaveBeenCalled();
    });

    it('returns null and never calls the provider for a paid comp company with no subscription (Option B)', async () => {
      const unsubscribed = makeCompany({
        subscriptionTier: SubscriptionTier.PRO,
        billingSubscriptionId: null,
        billingCustomerId: null,
      });
      const result = await service.reserveSeat(unsubscribed);
      expect(result).toBeNull();
      expect(provider.getSeatQuantity).not.toHaveBeenCalled();
      expect(provider.updateSeatQuantity).not.toHaveBeenCalled();
    });

    it('sets updateSeatQuantity to the LIVE quantity + 1, ignoring the stale purchasedSeats column', async () => {
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValue(undefined);
      const reservation = await service.reserveSeat(baseCompany);
      expect(provider.getSeatQuantity).toHaveBeenCalledWith({
        subscriptionId: 'sub_test_123',
        customerId: 'cus_test_1',
      });
      expect(provider.updateSeatQuantity).toHaveBeenCalledWith(
        { subscriptionId: 'sub_test_123', customerId: 'cus_test_1' },
        8,
      );
      expect(reservation).toMatchObject({
        subscriptionId: 'sub_test_123',
        targetQuantity: 8,
      });
    });

    it('maps a provider rejection to HTTP 402', async () => {
      (provider.updateSeatQuantity as jest.Mock).mockRejectedValue(
        new Error('card declined'),
      );
      const err = await service.reserveSeat(baseCompany).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(err.getResponse()).toMatchObject({
        message: expect.stringContaining('No user was created'),
      });
    });

    it('maps a failed live-quantity read to HTTP 402 and never increments', async () => {
      (provider.getSeatQuantity as jest.Mock).mockRejectedValue(
        new Error('stripe unavailable'),
      );
      const err = await service.reserveSeat(baseCompany).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(provider.updateSeatQuantity).not.toHaveBeenCalled();
    });

    it('release() restores the captured pre-increment live quantity', async () => {
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValue(undefined);
      const reservation = await service.reserveSeat(baseCompany);
      (provider.updateSeatQuantity as jest.Mock).mockClear();
      await reservation!.release();
      expect(provider.updateSeatQuantity).toHaveBeenCalledWith(
        { subscriptionId: 'sub_test_123', customerId: 'cus_test_1' },
        7,
      );
    });

    it('release() swallows provider errors instead of throwing', async () => {
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValueOnce(
        undefined,
      );
      const reservation = await service.reserveSeat(baseCompany);
      (provider.updateSeatQuantity as jest.Mock).mockRejectedValueOnce(
        new Error('provider down'),
      );
      await expect(reservation!.release()).resolves.toBeUndefined();
    });

    it('never writes any Company column (single-writer rule)', async () => {
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValue(undefined);
      await service.reserveSeat(baseCompany);
      expect(companyRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('decrementSeat', () => {
    const baseCompany = makeCompany({
      subscriptionTier: SubscriptionTier.PRO,
      purchasedSeats: 5, // stale on purpose
      billingSubscriptionId: 'sub_test_123',
      billingCustomerId: 'cus_test_1',
    });

    it('returns null for FREE and for a paid comp with no subscription (Option B)', async () => {
      expect(await service.decrementSeat(makeCompany())).toBeNull();
      expect(
        await service.decrementSeat(
          makeCompany({
            subscriptionTier: SubscriptionTier.PRO,
            billingSubscriptionId: null,
          }),
        ),
      ).toBeNull();
      expect(provider.getSeatQuantity).not.toHaveBeenCalled();
    });

    it('sets updateSeatQuantity to max(live - 1, 1) from the live quantity', async () => {
      (provider.getSeatQuantity as jest.Mock).mockResolvedValue(4);
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValue(undefined);
      const handle = await service.decrementSeat(baseCompany);
      expect(provider.updateSeatQuantity).toHaveBeenCalledWith(
        { subscriptionId: 'sub_test_123', customerId: 'cus_test_1' },
        3,
      );
      expect(handle).not.toBeNull();
    });

    it('never sets the quantity below 1', async () => {
      (provider.getSeatQuantity as jest.Mock).mockResolvedValue(1);
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValue(undefined);
      await service.decrementSeat(baseCompany);
      expect(provider.updateSeatQuantity).toHaveBeenCalledWith(
        expect.anything(),
        1,
      );
    });

    it('compensate() restores the captured live quantity and swallows errors', async () => {
      (provider.getSeatQuantity as jest.Mock).mockResolvedValue(4);
      (provider.updateSeatQuantity as jest.Mock).mockResolvedValue(undefined);
      const handle = await service.decrementSeat(baseCompany);
      (provider.updateSeatQuantity as jest.Mock).mockClear();
      (provider.updateSeatQuantity as jest.Mock).mockRejectedValueOnce(
        new Error('down'),
      );
      await expect(handle!.compensate()).resolves.toBeUndefined();
      expect(provider.updateSeatQuantity).toHaveBeenCalledWith(
        expect.anything(),
        4,
      );
    });
  });

  describe('getLiveSeatQuantity', () => {
    it('returns the provider live quantity', async () => {
      (provider.getSeatQuantity as jest.Mock).mockResolvedValue(6);
      const qty = await service.getLiveSeatQuantity(
        makeCompany({
          billingSubscriptionId: 'sub_1',
          billingCustomerId: 'cus_1',
        }),
      );
      expect(qty).toBe(6);
    });

    it('throws HTTP 402 when the company has no live subscription', async () => {
      const err = await service
        .getLiveSeatQuantity(makeCompany())
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    });
  });
});
