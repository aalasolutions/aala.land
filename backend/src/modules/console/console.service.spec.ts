import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  SubscriptionTier,
} from '@modules/companies/entities/company.entity';
import { User } from '@modules/users/entities/user.entity';
import { BillingPrice } from '@modules/billing/entities/billing-price.entity';
import { BillingHistory } from '@modules/billing/entities/billing-history.entity';
import { WhatsappSettings } from '@modules/whatsapp/entities/whatsapp-settings.entity';
import { BillingService } from '@modules/billing/billing.service';
import { WhatsappService } from '@modules/whatsapp/whatsapp.service';
import { AuditService } from '@modules/audit/audit.service';
import { MediaService } from '@modules/properties/media.service';
import { LockStateService, UNLOCKED } from '@modules/lock/lock-state.service';
import { ConsoleService, OperatorActor } from './console.service';
import { CustomDeal } from './entities/custom-deal.entity';
import { LockLift } from './entities/lock-lift.entity';
import { ManualPayment } from './entities/manual-payment.entity';
import { PaymentRemedy } from './entities/payment-remedy.entity';

const DAY = 24 * 60 * 60 * 1000;
const ACTOR: OperatorActor = { userId: 'op-1', email: 'aamir@aala.land' };

function futureIso(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 'co-1',
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    subscriptionTier: SubscriptionTier.FREE,
    maxUsers: 1,
    maxRegions: 1,
    maxProperties: 25,
    subscriptionExpiresAt: null,
    activeRegions: ['punjab'],
    defaultRegionCode: 'punjab',
    storageUsedBytes: 0,
    purchasedSeats: 1,
    billingProvider: 'stripe',
    billingCustomerId: null,
    billingSubscriptionId: null,
    billingStatus: null,
    billingCurrency: null,
    billingMeta: null,
    marketerCode: null,
    billingLastEventAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Company;
}

interface RepoMock {
  query: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findAndCount: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  exists: jest.Mock;
  createQueryBuilder: jest.Mock;
}

function repoMock(): RepoMock {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    getExists: jest.fn().mockResolvedValue(false),
  };
  return {
    query: jest.fn().mockResolvedValue([]),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    save: jest
      .fn()
      .mockImplementation((x) => Promise.resolve({ id: 'gen-id', ...x })),
    create: jest.fn().mockImplementation((x) => x),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    exists: jest.fn().mockResolvedValue(false),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

describe('ConsoleService', () => {
  let service: ConsoleService;
  let companyRepo: RepoMock;
  let userRepo: RepoMock;
  let dealRepo: RepoMock;
  let liftRepo: RepoMock;
  let paymentRepo: RepoMock;
  let remedyRepo: RepoMock;
  let priceRepo: RepoMock;
  let billingHistoryRepo: RepoMock;
  let whatsappSettingsRepo: RepoMock;
  let billingService: {
    getSubscriptionState: jest.Mock;
    syncPrices: jest.Mock;
    refundCardPayment: jest.Mock;
    creditNextBill: jest.Mock;
  };
  let lockStateService: {
    getLockState: jest.Mock;
    getLockStates: jest.Mock;
    findActiveLift: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let mediaService: {
    uploadConsoleReceipt: jest.Mock;
    getDocumentStream: jest.Mock;
  };
  let whatsappService: { countConnectedInstances: jest.Mock };

  beforeEach(async () => {
    companyRepo = repoMock();
    userRepo = repoMock();
    dealRepo = repoMock();
    liftRepo = repoMock();
    paymentRepo = repoMock();
    remedyRepo = repoMock();
    priceRepo = repoMock();
    billingHistoryRepo = repoMock();
    whatsappSettingsRepo = repoMock();
    billingService = {
      getSubscriptionState: jest.fn().mockResolvedValue({ tier: 'FREE' }),
      syncPrices: jest
        .fn()
        .mockResolvedValue({ synced: 0, failed: 0, total: 0 }),
      refundCardPayment: jest.fn().mockResolvedValue({ refundId: 're_1' }),
      creditNextBill: jest.fn().mockResolvedValue({ creditId: 'cbtxn_1' }),
    };
    lockStateService = {
      getLockState: jest.fn().mockResolvedValue(UNLOCKED),
      getLockStates: jest.fn().mockResolvedValue({
        states: new Map(),
        activeDeals: new Map(),
      }),
      findActiveLift: jest.fn().mockResolvedValue(null),
    };
    auditService = { log: jest.fn().mockResolvedValue({}) };
    mediaService = {
      uploadConsoleReceipt: jest.fn().mockResolvedValue({
        s3Key: 'land/companies/co-1/console-receipts/r.png',
        fileSize: 10,
      }),
      getDocumentStream: jest.fn(),
    };
    whatsappService = { countConnectedInstances: jest.fn().mockReturnValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsoleService,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(CustomDeal), useValue: dealRepo },
        { provide: getRepositoryToken(LockLift), useValue: liftRepo },
        { provide: getRepositoryToken(ManualPayment), useValue: paymentRepo },
        { provide: getRepositoryToken(PaymentRemedy), useValue: remedyRepo },
        { provide: getRepositoryToken(BillingPrice), useValue: priceRepo },
        {
          provide: getRepositoryToken(BillingHistory),
          useValue: billingHistoryRepo,
        },
        {
          provide: getRepositoryToken(WhatsappSettings),
          useValue: whatsappSettingsRepo,
        },
        { provide: BillingService, useValue: billingService },
        { provide: LockStateService, useValue: lockStateService },
        { provide: AuditService, useValue: auditService },
        { provide: MediaService, useValue: mediaService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    service = module.get(ConsoleService);
  });

  // ---- A. Deals -----------------------------------------------------------

  describe('grantDeal', () => {
    const dto = {
      priceAmount: 100000,
      currency: 'PKR',
      basis: 'per_seat' as const,
      seatCap: 5,
      untilDate: futureIso(90),
      whyNote: 'PK team, word of mouth',
    };

    it('creates the deal, lowercases the currency, and audits it', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      dealRepo.findOne.mockResolvedValue(null);

      const deal = await service.grantDeal('co-1', dto, ACTOR);

      expect(dealRepo.save).toHaveBeenCalled();
      expect(deal.currency).toBe('pkr');
      expect(deal.grantedByEmail).toBe(ACTOR.email);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'co-1',
          userId: 'op-1',
          entityType: 'ConsoleDeal',
        }),
      );
    });

    it('409s when an active deal already exists', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      dealRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(service.grantDeal('co-1', dto, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(dealRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a past until-date (would lock immediately)', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      await expect(
        service.grantDeal(
          'co-1',
          { ...dto, untilDate: new Date(Date.now() - DAY).toISOString() },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects lifetime combined with an until-date, and neither', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      await expect(
        service.grantDeal('co-1', { ...dto, lifetime: true }, ACTOR),
      ).rejects.toThrow('one or the other');
      await expect(
        service.grantDeal('co-1', { ...dto, untilDate: undefined }, ACTOR),
      ).rejects.toThrow('until-date');
    });

    it('lifts a FREE no-subscription company to PRO with the deal seat cap', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      dealRepo.findOne.mockResolvedValue(null);
      await service.grantDeal('co-1', dto, ACTOR);
      expect(companyRepo.update).toHaveBeenCalledWith(
        'co-1',
        expect.objectContaining({
          maxUsers: 5,
          subscriptionTier: SubscriptionTier.PRO,
        }),
      );
    });

    it('NEVER touches company columns when a live subscription exists (webhook single-writer)', async () => {
      companyRepo.findOne.mockResolvedValue(
        company({
          billingSubscriptionId: 'sub_1',
          billingStatus: 'active',
          subscriptionTier: SubscriptionTier.PRO,
        }),
      );
      dealRepo.findOne.mockResolvedValue(null);
      await service.grantDeal('co-1', dto, ACTOR);
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('maps a lost unique-index race to the same 409 as the pre-check (F5)', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      dealRepo.findOne.mockResolvedValue(null);
      dealRepo.save.mockRejectedValue({ code: '23505' });
      await expect(service.grantDeal('co-1', dto, ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });

    it('accepts a lifetime deal with no until-date', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      dealRepo.findOne.mockResolvedValue(null);
      const deal = await service.grantDeal(
        'co-1',
        { ...dto, untilDate: undefined, lifetime: true },
        ACTOR,
      );
      expect(deal.untilDate).toBeNull();
    });
  });

  describe('updateDeal / endDeal', () => {
    it('404s when there is no active deal to edit', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      dealRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateDeal(
          'co-1',
          {
            priceAmount: 1,
            currency: 'usd',
            basis: 'total_month',
            seatCap: 2,
            lifetime: true,
            whyNote: 'x',
          },
          ACTOR,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('ends the active deal and stamps who ended it', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      const deal: Record<string, unknown> = {
        id: 'deal-1',
        companyId: 'co-1',
        endedAt: null,
      };
      dealRepo.findOne.mockResolvedValue(deal);
      await service.endDeal('co-1', ACTOR);
      expect(dealRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          endedAt: expect.any(Date),
          endedBy: 'op-1',
        }),
      );
      // Ending a deal is a pricing event, not a capacity event.
      expect(companyRepo.update).not.toHaveBeenCalled();
    });
  });

  // ---- B. Lift ------------------------------------------------------------

  describe('liftLock / endLift', () => {
    it('409s when the company is not locked', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      lockStateService.getLockState.mockResolvedValue(UNLOCKED);
      await expect(
        service.liftLock('co-1', { liftUntil: futureIso(10) }, ACTOR),
      ).rejects.toThrow(ConflictException);
    });

    it('records the lift with grantor identity when locked', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      lockStateService.getLockState.mockResolvedValue({
        ...UNLOCKED,
        locked: true,
      });
      const lift = await service.liftLock(
        'co-1',
        { liftUntil: futureIso(10) },
        ACTOR,
      );
      expect(lift.grantedByEmail).toBe(ACTOR.email);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'ConsoleLockLift' }),
      );
    });

    it('rejects a lift date in the past', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      await expect(
        service.liftLock(
          'co-1',
          { liftUntil: new Date(Date.now() - DAY).toISOString() },
          ACTOR,
        ),
      ).rejects.toThrow('future');
    });

    it('endLift 404s without an active lift, ends it when present', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      lockStateService.findActiveLift.mockResolvedValue(null);
      await expect(service.endLift('co-1', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      const lift: Record<string, unknown> = { id: 'lift-1', endedAt: null };
      lockStateService.findActiveLift.mockResolvedValue(lift);
      await service.endLift('co-1', ACTOR);
      expect(liftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ endedAt: expect.any(Date), endedBy: 'op-1' }),
      );
    });
  });

  // ---- C. Manual payments -------------------------------------------------

  describe('recordPayment', () => {
    const dto = {
      amount: 90000,
      currency: 'PKR',
      receivedAt: '2026-07-19',
      coversStart: '2026-07-01',
      coversEnd: '2026-07-31',
    };

    it('requires notes or a receipt (DOCUMENT IT)', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      await expect(
        service.recordPayment('co-1', dto, undefined, ACTOR),
      ).rejects.toThrow('notes or a receipt');
    });

    it('rejects an inverted covers period', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      await expect(
        service.recordPayment(
          'co-1',
          { ...dto, notes: 'txn 8842', coversEnd: '2026-06-01' },
          undefined,
          ACTOR,
        ),
      ).rejects.toThrow('coversEnd');
    });

    it('records with notes only, lowercased currency, and audits', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      const payment = await service.recordPayment(
        'co-1',
        { ...dto, notes: 'JazzCash transfer, txn 8842' },
        undefined,
        ACTOR,
      );
      expect(payment.currency).toBe('pkr');
      expect(payment.receiptKey).toBeNull();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'ConsoleManualPayment' }),
      );
    });

    it('uploads the receipt through the media service when provided', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      const file = { path: '/tmp/x', mimetype: 'image/png' } as never;
      const payment = await service.recordPayment('co-1', dto, file, ACTOR);
      expect(mediaService.uploadConsoleReceipt).toHaveBeenCalledWith(
        'co-1',
        file,
      );
      expect(payment.receiptKey).toContain('console-receipts');
    });
  });

  describe('getReceiptStream (F1)', () => {
    it('persists the receipt mime at record time and serves it as contentType', async () => {
      companyRepo.findOne.mockResolvedValue(company());
      const file = { path: '/tmp/x', mimetype: 'image/png' } as never;
      const payment = await service.recordPayment(
        'co-1',
        {
          amount: 90000,
          currency: 'PKR',
          receivedAt: '2026-07-19',
          coversStart: '2026-07-01',
          coversEnd: '2026-07-31',
        },
        file,
        ACTOR,
      );
      expect(payment.receiptMime).toBe('image/png');

      const stream = { pipe: jest.fn() };
      mediaService.getDocumentStream.mockResolvedValue(stream);
      paymentRepo.findOne.mockResolvedValue({
        id: 'mp-1',
        receiptKey: 'land/companies/co-1/console-receipts/1-r.png',
        receiptMime: 'image/png',
      });
      const result = await service.getReceiptStream('mp-1');
      expect(result.contentType).toBe('image/png');
    });

    it('falls back to the key extension for rows recorded before receipt_mime existed', async () => {
      mediaService.getDocumentStream.mockResolvedValue({ pipe: jest.fn() });
      paymentRepo.findOne.mockResolvedValue({
        id: 'mp-2',
        receiptKey: 'land/companies/co-1/console-receipts/2-scan.JPG',
        receiptMime: null,
      });
      const result = await service.getReceiptStream('mp-2');
      expect(result.contentType).toBe('image/jpeg');
    });
  });

  // ---- D. Make it right ---------------------------------------------------

  describe('applyRemedy', () => {
    const paidRow = {
      id: 'bh-1',
      companyId: 'co-1',
      stripeInvoiceId: 'in_1',
      type: 'payment_succeeded',
      amount: 250000,
      currency: 'usd',
    };

    it('card discount credits the next bill through the billing facade', async () => {
      billingHistoryRepo.findOne.mockResolvedValue(paidRow);
      companyRepo.findOne.mockResolvedValue(
        company({ billingCustomerId: 'cus_1' }),
      );
      const remedy = await service.applyRemedy(
        {
          source: 'card',
          paymentId: 'bh-1',
          remedy: 'discount_next_bill',
          amount: 50000,
          whyNote: 'AI failed for two days',
        },
        ACTOR,
      );
      expect(billingService.creditNextBill).toHaveBeenCalledWith(
        'cus_1',
        50000,
        'usd',
      );
      expect(remedy.providerRef).toBe('cbtxn_1');
      expect(remedy.kind).toBe('discount_next_bill');
    });

    it('card full refund passes null amount to the provider and records the payment amount', async () => {
      billingHistoryRepo.findOne.mockResolvedValue(paidRow);
      companyRepo.findOne.mockResolvedValue(company());
      const remedy = await service.applyRemedy(
        {
          source: 'card',
          paymentId: 'bh-1',
          remedy: 'refund',
          scope: 'full',
          whyNote: 'downtime',
        },
        ACTOR,
      );
      expect(billingService.refundCardPayment).toHaveBeenCalledWith(
        'in_1',
        null,
      );
      expect(remedy.amount).toBe(250000);
      expect(remedy.refundScope).toBe('full');
    });

    it('card partial refund passes the exact amount', async () => {
      billingHistoryRepo.findOne.mockResolvedValue(paidRow);
      companyRepo.findOne.mockResolvedValue(company());
      await service.applyRemedy(
        {
          source: 'card',
          paymentId: 'bh-1',
          remedy: 'refund',
          scope: 'partial',
          amount: 100000,
          whyNote: 'partial outage',
        },
        ACTOR,
      );
      expect(billingService.refundCardPayment).toHaveBeenCalledWith(
        'in_1',
        100000,
      );
    });

    it('rejects: amount over payment, full with amount, partial without amount, missing scope, discount without amount', async () => {
      billingHistoryRepo.findOne.mockResolvedValue(paidRow);
      companyRepo.findOne.mockResolvedValue(company());
      const base = {
        source: 'card' as const,
        paymentId: 'bh-1',
        whyNote: 'x',
      };
      await expect(
        service.applyRemedy(
          { ...base, remedy: 'refund', scope: 'partial', amount: 999999999 },
          ACTOR,
        ),
      ).rejects.toThrow('cannot exceed');
      await expect(
        service.applyRemedy(
          { ...base, remedy: 'refund', scope: 'full', amount: 1 },
          ACTOR,
        ),
      ).rejects.toThrow('full refund');
      await expect(
        service.applyRemedy(
          { ...base, remedy: 'refund', scope: 'partial' },
          ACTOR,
        ),
      ).rejects.toThrow('partial refund needs an amount');
      await expect(
        service.applyRemedy({ ...base, remedy: 'refund' }, ACTOR),
      ).rejects.toThrow('scope');
      await expect(
        service.applyRemedy({ ...base, remedy: 'discount_next_bill' }, ACTOR),
      ).rejects.toThrow('discount needs an amount');
      expect(billingService.refundCardPayment).not.toHaveBeenCalled();
      expect(billingService.creditNextBill).not.toHaveBeenCalled();
    });

    it('rejects anchoring to a failed payment', async () => {
      billingHistoryRepo.findOne.mockResolvedValue({
        ...paidRow,
        type: 'payment_failed',
      });
      await expect(
        service.applyRemedy(
          {
            source: 'card',
            paymentId: 'bh-1',
            remedy: 'refund',
            scope: 'full',
            whyNote: 'x',
          },
          ACTOR,
        ),
      ).rejects.toThrow('PAID payment');
    });

    it('manual-rail remedies record the obligation without any provider call', async () => {
      paymentRepo.findOne.mockResolvedValue({
        id: 'mp-1',
        companyId: 'co-1',
        amount: 90000,
        currency: 'pkr',
      });
      companyRepo.findOne.mockResolvedValue(company());
      const remedy = await service.applyRemedy(
        {
          source: 'manual',
          paymentId: 'mp-1',
          remedy: 'refund',
          scope: 'partial',
          amount: 20000,
          whyNote: 'no response for a week',
        },
        ACTOR,
      );
      expect(billingService.refundCardPayment).not.toHaveBeenCalled();
      expect(billingService.creditNextBill).not.toHaveBeenCalled();
      expect(remedy.providerRef).toBeNull();
      expect(remedy.manualPaymentId).toBe('mp-1');
      expect(remedy.billingHistoryId).toBeNull();
      expect(remedy.currency).toBe('pkr');
    });
  });

  // ---- F. Price health ----------------------------------------------------

  describe('getPriceHealth', () => {
    it('auto-syncs when rows are missing their registration, then reports statuses', async () => {
      const before = [
        {
          id: 'p1',
          kind: 'SEAT',
          currency: 'usd',
          unitAmount: 2500,
          providerPriceId: null,
          lastSyncError: null,
          lastSyncErrorAt: null,
        },
      ];
      const after = [
        {
          id: 'p1',
          kind: 'SEAT',
          currency: 'usd',
          unitAmount: 2500,
          providerPriceId: 'price_1',
          lastSyncError: null,
          lastSyncErrorAt: null,
        },
      ];
      priceRepo.find.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      const health = (await service.getPriceHealth()) as {
        rows: { status: string }[];
        registered: number;
      };
      expect(billingService.syncPrices).toHaveBeenCalled();
      expect(health.rows[0].status).toBe('registered');
      expect(health.registered).toBe(1);
    });

    it('reports a failed row with the provider error verbatim, no sync when all registered rows exist', async () => {
      const errAt = new Date();
      priceRepo.find.mockResolvedValue([
        {
          id: 'p1',
          kind: 'SEAT',
          currency: 'usd',
          unitAmount: 2500,
          providerPriceId: 'price_1',
          lastSyncError: null,
          lastSyncErrorAt: null,
        },
        {
          id: 'p2',
          kind: 'SEAT',
          currency: 'pkr',
          unitAmount: 100000,
          providerPriceId: null,
          lastSyncError:
            'Invalid currency: pkr is not supported for this account',
          lastSyncErrorAt: errAt,
        },
      ]);
      const health = (await service.getPriceHealth()) as {
        rows: { status: string; lastError: string | null }[];
        failed: number;
      };
      // A row with a recorded error still triggers a retrying auto-sync.
      expect(health.rows[1].status).toBe('failed');
      expect(health.rows[1].lastError).toBe(
        'Invalid currency: pkr is not supported for this account',
      );
      expect(health.failed).toBe(1);
    });
  });

  // ---- E + G. Scoreboard and marketers ------------------------------------

  describe('MRR read model (overview + marketers)', () => {
    function wireCompanies(
      companies: Company[],
      dealEntries: [string, unknown][] = [],
    ) {
      companyRepo.find.mockResolvedValue(companies);
      lockStateService.getLockStates.mockResolvedValue({
        states: new Map(companies.map((c) => [c.id, UNLOCKED])),
        activeDeals: new Map(dealEntries as never),
      });
      priceRepo.find.mockResolvedValue([
        { kind: 'SEAT', currency: 'usd', unitAmount: 2500, active: true },
        {
          kind: 'ENTERPRISE_BASE',
          currency: 'usd',
          unitAmount: 25000,
          active: true,
        },
      ]);
    }

    it('computes per-currency MRR across both rails with no FX', async () => {
      const cardPro = company({
        id: 'co-card',
        billingSubscriptionId: 'sub_1',
        billingStatus: 'active',
        billingCurrency: 'usd',
        subscriptionTier: SubscriptionTier.PRO,
        purchasedSeats: 4,
      });
      const dealCo = company({ id: 'co-deal' });
      const freeCo = company({ id: 'co-free' });
      wireCompanies(
        [cardPro, dealCo, freeCo],
        [
          [
            'co-deal',
            {
              companyId: 'co-deal',
              priceAmount: 100000,
              currency: 'pkr',
              basis: 'per_seat',
              seatCap: 5,
              untilDate: null,
              endedAt: null,
            },
          ],
        ],
      );

      const overview = (await service.getOverview()) as {
        customers: number;
        payingCustomers: number;
        mrr: { currency: string; mrrMinor: number; companies: number }[];
      };
      expect(overview.customers).toBe(3);
      expect(overview.payingCustomers).toBe(2);
      const usd = overview.mrr.find((m) => m.currency === 'usd');
      const pkr = overview.mrr.find((m) => m.currency === 'pkr');
      expect(usd).toEqual({
        currency: 'usd',
        mrrMinor: 4 * 2500,
        companies: 1,
      });
      expect(pkr).toEqual({
        currency: 'pkr',
        mrrMinor: 5 * 100000,
        companies: 1,
      });
    });

    it('prices ENTERPRISE as base plus extra seats, and a total_month deal as flat', async () => {
      const ent = company({
        id: 'co-ent',
        billingSubscriptionId: 'sub_e',
        billingStatus: 'active',
        billingCurrency: 'usd',
        subscriptionTier: SubscriptionTier.ENTERPRISE,
        purchasedSeats: 3,
      });
      const flatDeal = company({ id: 'co-flat' });
      wireCompanies(
        [ent, flatDeal],
        [
          [
            'co-flat',
            {
              companyId: 'co-flat',
              priceAmount: 80000,
              currency: 'usd',
              basis: 'total_month',
              seatCap: 20,
              untilDate: null,
              endedAt: null,
            },
          ],
        ],
      );
      const overview = (await service.getOverview()) as {
        mrr: { currency: string; mrrMinor: number }[];
      };
      const usd = overview.mrr.find((m) => m.currency === 'usd');
      // ENT: 25000 base + 2 extra seats x 2500 = 30000; flat deal adds 80000.
      expect(usd!.mrrMinor).toBe(30000 + 80000);
    });

    it('counts a zero-cost deal company as a customer but NEVER as paying (F2)', async () => {
      const freeDeal = company({ id: 'co-freedeal' });
      wireCompanies(
        [freeDeal],
        [
          [
            'co-freedeal',
            {
              companyId: 'co-freedeal',
              priceAmount: 0,
              currency: 'usd',
              basis: 'per_seat',
              seatCap: 3,
              untilDate: null,
              endedAt: null,
            },
          ],
        ],
      );
      const overview = (await service.getOverview()) as {
        customers: number;
        payingCustomers: number;
        mrr: unknown[];
      };
      expect(overview.customers).toBe(1);
      expect(overview.payingCustomers).toBe(0);
      expect(overview.mrr).toEqual([]);

      const report = await service.getMarketersReport();
      expect(report.rows[0]).toMatchObject({ companies: 1, paying: 0 });
    });

    it('excludes a locked (expired-deal) company from paying', async () => {
      const lockedCo = company({ id: 'co-locked' });
      companyRepo.find.mockResolvedValue([lockedCo]);
      lockStateService.getLockStates.mockResolvedValue({
        states: new Map([
          [
            'co-locked',
            {
              locked: true,
              lifted: false,
              liftUntil: null,
              dealExpiredAt: 'x',
            },
          ],
        ]),
        activeDeals: new Map([
          [
            'co-locked',
            {
              companyId: 'co-locked',
              priceAmount: 100000,
              currency: 'pkr',
              basis: 'per_seat',
              seatCap: 5,
              untilDate: new Date(Date.now() - DAY),
              endedAt: null,
            },
          ],
        ]),
      });
      priceRepo.find.mockResolvedValue([]);
      const overview = (await service.getOverview()) as {
        payingCustomers: number;
      };
      expect(overview.payingCustomers).toBe(0);
    });

    it('groups marketers with the un-attributed aggregate row last', async () => {
      const a = company({ id: 'co-a', marketerCode: 'BILAL01' });
      const b = company({ id: 'co-b', marketerCode: 'BILAL01' });
      const none = company({ id: 'co-none' });
      wireCompanies([a, b, none]);
      const report = await service.getMarketersReport();
      expect(report.rows).toHaveLength(2);
      expect(report.rows[0]).toMatchObject({
        marketerCode: 'BILAL01',
        companies: 2,
      });
      expect(report.rows[1]).toMatchObject({
        marketerCode: null,
        companies: 1,
      });
    });
  });

  // ---- Upcoming manual payments -------------------------------------------

  describe('getUpcomingManualPayments', () => {
    it('returns due and overdue rows, overdue pinned first, card-rail companies skipped', async () => {
      paymentRepo.query.mockResolvedValue([
        {
          companyId: 'co-due',
          amount: '90000',
          currency: 'pkr',
          coversEnd: new Date(Date.now() + 5 * DAY),
        },
        {
          companyId: 'co-overdue',
          amount: '50000',
          currency: 'pkr',
          coversEnd: new Date(Date.now() - 3 * DAY),
        },
        {
          companyId: 'co-far',
          amount: '10000',
          currency: 'usd',
          coversEnd: new Date(Date.now() + 60 * DAY),
        },
        {
          companyId: 'co-card',
          amount: '10000',
          currency: 'usd',
          coversEnd: new Date(Date.now() + 2 * DAY),
        },
        // Churned one-time payer: > 90 days past covers-end, must drop out (F3).
        {
          companyId: 'co-stale',
          amount: '5000',
          currency: 'usd',
          coversEnd: new Date(Date.now() - 120 * DAY),
        },
      ]);
      companyRepo.find.mockResolvedValue([
        {
          id: 'co-due',
          name: 'Due Co',
          billingSubscriptionId: null,
          billingStatus: null,
        },
        {
          id: 'co-overdue',
          name: 'Overdue Co',
          billingSubscriptionId: null,
          billingStatus: null,
        },
        {
          id: 'co-far',
          name: 'Far Co',
          billingSubscriptionId: null,
          billingStatus: null,
        },
        {
          id: 'co-card',
          name: 'Card Co',
          billingSubscriptionId: 'sub_1',
          billingStatus: 'active',
        },
        {
          id: 'co-stale',
          name: 'Stale Co',
          billingSubscriptionId: null,
          billingStatus: null,
        },
      ]);
      const result = await service.getUpcomingManualPayments(14);
      expect(result.rows.map((r) => r.companyId)).toEqual([
        'co-overdue',
        'co-due',
      ]);
      expect(result.rows[0]).toMatchObject({ overdue: true, amount: 50000 });
      expect(result.overdueWindowDays).toBe(90);
    });
  });
});
