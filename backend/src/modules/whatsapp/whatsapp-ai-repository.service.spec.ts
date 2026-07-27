import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { UnitStatus } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';

const makeQb = () => ({
  setLock: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orIgnore: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(null),
  getRawMany: jest.fn().mockResolvedValue([]),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
});

const PERIOD = {
  start: new Date('2026-07-09T00:00:00.000Z'),
  end: new Date('2026-08-09T00:00:00.000Z'),
};

const makeRepos = () => {
  const qb = makeQb();
  const usageQb = makeQb();
  const conversationQb = makeQb();

  const txUsageRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(usageQb),
    increment: jest.fn().mockResolvedValue(undefined),
  };
  const txConversationRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(conversationQb),
    increment: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((v: any) => v),
    save: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const managerQuery = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn((cb: any) =>
    cb({
      query: managerQuery,
      getRepository: (entity: any) =>
        entity?.name === 'AiCreditUsage' ? txUsageRepo : txConversationRepo,
    }),
  );

  return {
    companyRepo: {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'c1', name: 'Test Co', activeRegions: [] }),
    },
    unitRepo: { find: jest.fn().mockResolvedValue([]) },
    settingsRepo: {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      manager: { transaction },
    },
    conversationRepo: {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    },
    usageRepo: {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    },
    billingHistoryRepo: { findOne: jest.fn().mockResolvedValue(null) },
    userRepo: { find: jest.fn().mockResolvedValue([]) },
    qb,
    usageQb,
    conversationQb,
    txUsageRepo,
    txConversationRepo,
    managerQuery,
  };
};

const makeService = (repos: ReturnType<typeof makeRepos>) =>
  new WhatsappAiRepositoryService(
    repos.companyRepo as any,
    repos.unitRepo as any,
    repos.settingsRepo as any,
    repos.conversationRepo as any,
    repos.usageRepo as any,
    repos.billingHistoryRepo as any,
    repos.userRepo as any,
  );

describe('WhatsappAiRepositoryService', () => {
  let service: WhatsappAiRepositoryService;
  let repos: ReturnType<typeof makeRepos>;

  beforeEach(() => {
    repos = makeRepos();
    service = makeService(repos);
  });

  describe('getCompanyAndUnits', () => {
    it('returns company from companyRepo', async () => {
      const result = await service.getCompanyAndUnits('c1');
      expect(result.company).toEqual({
        id: 'c1',
        name: 'Test Co',
        activeRegions: [],
      });
    });

    it('queries units with AVAILABLE status for the given company', async () => {
      await service.getCompanyAndUnits('c1');
      expect(repos.unitRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'c1', status: UnitStatus.AVAILABLE },
          take: 40,
        }),
      );
    });

    it('returns cached result on second call without hitting DB again', async () => {
      await service.getCompanyAndUnits('c1');
      await service.getCompanyAndUnits('c1');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(1);
      expect(repos.unitRepo.find).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after clearContextCache', async () => {
      await service.getCompanyAndUnits('c1');
      service.clearContextCache('c1');
      await service.getCompanyAndUnits('c1');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('cache is scoped per companyId', async () => {
      await service.getCompanyAndUnits('c1');
      await service.getCompanyAndUnits('c2');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCompany', () => {
    it('reads the company row alone, without the unit join', async () => {
      const company = await service.getCompany('c1');
      expect(company).toEqual({
        id: 'c1',
        name: 'Test Co',
        activeRegions: [],
      });
      expect(repos.unitRepo.find).not.toHaveBeenCalled();
    });

    it('caches so the metering path does not re-query per message', async () => {
      await service.getCompany('c1');
      await service.getCompany('c1');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after clearContextCache', async () => {
      await service.getCompany('c1');
      service.clearContextCache('c1');
      await service.getCompany('c1');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCompanyPrompt', () => {
    it('returns null when no settings row exists', async () => {
      const result = await service.getCompanyPrompt('c1');
      expect(result).toBeNull();
    });

    it('returns aiPrompt string when settings row exists', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({
        aiPrompt: 'Custom prompt',
      });
      service = makeService(repos);
      const result = await service.getCompanyPrompt('c1');
      expect(result).toBe('Custom prompt');
    });

    it('returns null when aiPrompt is empty string', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiPrompt: '' });
      service = makeService(repos);
      const result = await service.getCompanyPrompt('c1');
      expect(result).toBeNull();
    });

    it('returns cached prompt on second call without re-fetching DB', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiPrompt: 'Cached' });
      service = makeService(repos);
      await service.getCompanyPrompt('c1');
      await service.getCompanyPrompt('c1');
      expect(repos.settingsRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after clearPromptCache', async () => {
      await service.getCompanyPrompt('c1');
      service.clearPromptCache('c1');
      await service.getCompanyPrompt('c1');
      expect(repos.settingsRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('persistAiEnabled', () => {
    it('calls upsert with correct companyId and value', async () => {
      await service.persistAiEnabled('c1', true);
      expect(repos.settingsRepo.upsert).toHaveBeenCalledWith(
        { companyId: 'c1', aiEnabled: true },
        ['companyId'],
      );
    });
  });

  describe('consumeConversationCredit', () => {
    const consume = (allowance = 50) =>
      service.consumeConversationCredit('c1', 'u1', 'chat1', allowance, PERIOD);

    it('charges a credit and opens a 24h window when none is open', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 3 });
      repos.conversationQb.getOne.mockResolvedValue(null);

      const result = await consume();

      expect(result).toEqual({
        allowed: true,
        charged: true,
        conversationId: 'conv-1',
      });
      expect(repos.txConversationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'c1',
          userId: 'u1',
          chatId: 'chat1',
          messagesCount: 1,
          periodStart: PERIOD.start,
        }),
      );
      expect(repos.txUsageRepo.increment).toHaveBeenCalledWith(
        { companyId: 'c1', periodStart: PERIOD.start },
        'creditsUsed',
        1,
      );
    });

    it('sets expiresAt exactly 24 hours after startedAt', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 0 });
      repos.conversationQb.getOne.mockResolvedValue(null);

      await consume();

      const saved = repos.txConversationRepo.save.mock.calls[0][0] as any;
      expect(saved.expiresAt.getTime() - saved.startedAt.getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
    });

    it('rides an open window free and only bumps the message count', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 3 });
      repos.conversationQb.getOne.mockResolvedValue({ id: 'open-1' });

      const result = await consume();

      expect(result).toEqual({
        allowed: true,
        charged: false,
        conversationId: 'open-1',
      });
      expect(repos.txConversationRepo.increment).toHaveBeenCalledWith(
        { id: 'open-1' },
        'messagesCount',
        1,
      );
      expect(repos.txUsageRepo.increment).not.toHaveBeenCalled();
      expect(repos.txConversationRepo.save).not.toHaveBeenCalled();
    });

    it('serves an open window even after the allowance is exhausted', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 50 });
      repos.conversationQb.getOne.mockResolvedValue({ id: 'open-1' });

      const result = await consume(50);

      expect(result.allowed).toBe(true);
      expect(result.charged).toBe(false);
    });

    it('denies a new window once the allowance is spent, writing nothing', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 50 });
      repos.conversationQb.getOne.mockResolvedValue(null);

      const result = await consume(50);

      expect(result).toEqual({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      expect(repos.txConversationRepo.save).not.toHaveBeenCalled();
      expect(repos.txUsageRepo.increment).not.toHaveBeenCalled();
    });

    it('takes a company-scoped advisory lock before any period-dependent work', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 0 });

      await consume();

      expect(repos.managerQuery).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        ['c1'],
      );
      // Must precede the usage upsert: the usage row key includes period_start, so
      // locking it cannot serialize two turns either side of a period boundary.
      expect(repos.managerQuery.mock.invocationCallOrder[0]).toBeLessThan(
        repos.usageQb.orIgnore.mock.invocationCallOrder[0],
      );
    });

    it('takes the row lock before reading the window (ordering only, not a race test)', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 0 });

      await consume();

      expect(repos.usageQb.orIgnore).toHaveBeenCalled();
      expect(repos.usageQb.setLock).toHaveBeenCalledWith('pessimistic_write');
      // The lock is taken before the window is read, so window creation for a
      // company is serialized even across app instances.
      expect(repos.usageQb.setLock.mock.invocationCallOrder[0]).toBeLessThan(
        repos.conversationQb.getOne.mock.invocationCallOrder[0],
      );
    });

    it('wraps the check in a single transaction', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 0 });
      await consume();
      expect(repos.settingsRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws when the counter row is missing after the upsert', async () => {
      repos.usageQb.getOne.mockResolvedValue(null);
      await expect(consume()).rejects.toThrow('ai_credit_usage row missing');
    });
  });

  describe('refundConversationCredit', () => {
    it('deletes the window and decrements the counter in one transaction', async () => {
      await service.refundConversationCredit('c1', 'conv-1', PERIOD.start);

      expect(repos.txConversationRepo.delete).toHaveBeenCalledWith({
        id: 'conv-1',
        companyId: 'c1',
      });
      expect(repos.usageQb.execute).toHaveBeenCalled();
      expect(repos.settingsRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCreditUsage', () => {
    it('returns 0 used when the period has no counter row yet', async () => {
      repos.usageRepo.findOne.mockResolvedValue(null);
      const result = await service.getCreditUsage('c1', PERIOD.start);
      expect(result).toEqual({ used: 0, openWindows: 0 });
    });

    it('returns the stored count and the open window count', async () => {
      repos.usageRepo.findOne.mockResolvedValue({ creditsUsed: 12 });
      repos.conversationRepo.count.mockResolvedValue(3);
      const result = await service.getCreditUsage('c1', PERIOD.start);
      expect(result).toEqual({ used: 12, openWindows: 3 });
    });
  });

  describe('claimExhaustedNotification', () => {
    it('returns true for the caller that wins the claim', async () => {
      repos.qb.execute.mockResolvedValue({ affected: 1 });
      await expect(
        service.claimExhaustedNotification('c1', PERIOD.start),
      ).resolves.toBe(true);
    });

    it('returns false when the email was already claimed this period', async () => {
      repos.qb.execute.mockResolvedValue({ affected: 0 });
      await expect(
        service.claimExhaustedNotification('c1', PERIOD.start),
      ).resolves.toBe(false);
    });
  });

  describe('getPeriodAnchor', () => {
    it('uses the latest invoice period_start when the company has been billed', async () => {
      const invoiceStart = new Date('2026-07-03T00:00:00.000Z');
      repos.billingHistoryRepo.findOne.mockResolvedValue({
        periodStart: invoiceStart,
      });
      const anchor = await service.getPeriodAnchor({
        id: 'c1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      } as any);
      expect(anchor).toEqual(invoiceStart);
    });

    it('falls back to createdAt when the company has never been invoiced', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      repos.billingHistoryRepo.findOne.mockResolvedValue(null);
      const anchor = await service.getPeriodAnchor({
        id: 'c1',
        createdAt,
      } as any);
      expect(anchor).toEqual(createdAt);
    });

    it('caches the anchor so it is not queried per message', async () => {
      const company = { id: 'c1', createdAt: new Date() } as any;
      await service.getPeriodAnchor(company);
      await service.getPeriodAnchor(company);
      expect(repos.billingHistoryRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAgentCreditBreakdown', () => {
    it('returns an empty list when nothing was consumed', async () => {
      repos.qb.getRawMany.mockResolvedValue([]);
      const result = await service.getAgentCreditBreakdown('c1', PERIOD.start);
      expect(result).toEqual([]);
      expect(repos.userRepo.find).not.toHaveBeenCalled();
    });

    it('resolves agent names and sorts by credits spent', async () => {
      repos.qb.getRawMany.mockResolvedValue([
        { userId: 'u1', credits: '2', aiTurns: '9', leads: '2' },
        { userId: 'u2', credits: '7', aiTurns: '20', leads: '5' },
      ]);
      repos.userRepo.find.mockResolvedValue([
        { id: 'u1', name: 'Agent One', email: 'one@test.com' },
        { id: 'u2', name: 'Agent Two', email: 'two@test.com' },
      ]);

      const result = await service.getAgentCreditBreakdown('c1', PERIOD.start);

      expect(result).toEqual([
        { userId: 'u2', name: 'Agent Two', credits: 7, aiTurns: 20, leads: 5 },
        { userId: 'u1', name: 'Agent One', credits: 2, aiTurns: 9, leads: 2 },
      ]);
    });

    it('labels a consumer whose user row is gone rather than dropping their spend', async () => {
      repos.qb.getRawMany.mockResolvedValue([
        { userId: 'gone', credits: '4', aiTurns: '10', leads: '3' },
      ]);
      repos.userRepo.find.mockResolvedValue([]);

      const result = await service.getAgentCreditBreakdown('c1', PERIOD.start);

      expect(result).toEqual([
        {
          userId: 'gone',
          name: 'Removed user',
          credits: 4,
          aiTurns: 10,
          leads: 3,
        },
      ]);
    });
  });

  describe('loadAiEnabled', () => {
    it('returns null when no settings row', async () => {
      const result = await service.loadAiEnabled('c1');
      expect(result).toBeNull();
    });

    it('returns aiEnabled value when row exists', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiEnabled: false });
      service = makeService(repos);
      const result = await service.loadAiEnabled('c1');
      expect(result).toBe(false);
    });
  });

  describe('searchProperties', () => {
    it('queries AVAILABLE units for the company with no filters', async () => {
      await service.searchProperties('c1', {});
      expect(repos.unitRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'c1',
            status: UnitStatus.AVAILABLE,
          }),
        }),
      );
    });

    it('maps RENT type filter (uppercase) to PropertyType.RENTAL', async () => {
      await service.searchProperties('c1', { type: 'RENT' });
      expect(repos.unitRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ propertyType: PropertyType.RENTAL }),
        }),
      );
    });

    it('normalizes lowercase "sale" type filter to PropertyType.FOR_SALE', async () => {
      await service.searchProperties('c1', { type: 'sale' });
      expect(repos.unitRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            propertyType: PropertyType.FOR_SALE,
          }),
        }),
      );
    });

    it('does not include propertyType in where when not provided', async () => {
      await service.searchProperties('c1', {});
      const call = repos.unitRepo.find.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('propertyType');
    });

    it('includes bedrooms filter directly in where', async () => {
      await service.searchProperties('c1', { bedrooms: 2 });
      expect(repos.unitRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bedrooms: 2 }),
        }),
      );
    });

    it('includes city filter nested under asset.locality.city', async () => {
      await service.searchProperties('c1', { city: 'karachi' });
      const call = repos.unitRepo.find.mock.calls[0][0];
      expect(call.where.asset?.locality?.city?.name).toBeDefined();
    });

    it('returns units from unitRepo', async () => {
      const fakeUnits = [{ id: 'u1', bedrooms: 2 }];
      repos.unitRepo.find.mockResolvedValue(fakeUnits);
      const result = await service.searchProperties('c1', {});
      expect(result).toEqual(fakeUnits);
    });
  });
});
