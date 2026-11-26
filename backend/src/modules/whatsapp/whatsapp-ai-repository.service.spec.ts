import { IsNull } from 'typeorm';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { UnitStatus } from '../properties/entities/unit.entity';

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
  const txChatRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const managerQuery = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn((cb: any) =>
    cb({
      query: managerQuery,
      getRepository: (entity: any) => {
        if (entity?.name === 'AiCreditUsage') return txUsageRepo;
        if (entity?.name === 'WhatsappChat') return txChatRepo;
        return txConversationRepo;
      },
    }),
  );

  return {
    companyRepo: {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'c1', name: 'Test Co', activeRegions: [] }),
    },
    unitRepo: {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    },
    mediaRepo: {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
    },
    settingsRepo: {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      manager: { transaction },
    },
    conversationRepo: {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      increment: jest.fn().mockResolvedValue(undefined),
    },
    usageRepo: {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    },
    billingHistoryRepo: { findOne: jest.fn().mockResolvedValue(null) },
    redis: {
      getOrSetJson: jest.fn(
        (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
      ),
    },
    userRepo: {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    },
    qb,
    usageQb,
    conversationQb,
    txUsageRepo,
    txConversationRepo,
    txChatRepo,
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
    repos.redis as any,
    repos.mediaRepo as any,
  );

describe('WhatsappAiRepositoryService', () => {
  let service: WhatsappAiRepositoryService;
  let repos: ReturnType<typeof makeRepos>;

  beforeEach(() => {
    repos = makeRepos();
    service = makeService(repos);
  });

  describe('unitPhotoLinks', () => {
    it('returns null and reads no media for a unit that is not an available listing of the company', async () => {
      await expect(service.unitPhotoLinks('c1', 'unit-1', 3)).resolves.toBe(
        null,
      );
      expect(repos.unitRepo.findOne.mock.calls[0][0].where).toMatchObject({
        id: 'unit-1',
        companyId: 'c1',
        status: 'available',
      });
      expect(repos.mediaRepo.find).not.toHaveBeenCalled();
    });

    it('reads company-scoped web-link images in the query, primary first then newest, before the limit', async () => {
      const unit = { id: 'unit-1' };
      repos.unitRepo.findOne.mockResolvedValue(unit);
      repos.mediaRepo.find.mockResolvedValue([
        { url: 'https://media.example.com/a.jpg' },
      ]);
      await expect(service.unitPhotoLinks('c1', 'unit-1', 3)).resolves.toEqual({
        unit,
        links: ['https://media.example.com/a.jpg'],
      });
      const options = repos.mediaRepo.find.mock.calls[0][0];
      expect(options).toMatchObject({
        where: { companyId: 'c1', unitId: 'unit-1', type: 'image' },
        order: { isPrimary: 'DESC', createdAt: 'DESC' },
        take: 3,
      });
      expect(options.where.url.getSql('m.url')).toBe("m.url ~* '^https?://'");
    });
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
          where: {
            companyId: 'c1',
            status: UnitStatus.AVAILABLE,
            deletedAt: IsNull(),
          },
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
          messagesCount: 0,
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

    it('rides an open window free and writes nothing', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 3 });
      repos.conversationQb.getOne.mockResolvedValue({ id: 'open-1' });

      const result = await consume();

      expect(result).toEqual({
        allowed: true,
        charged: false,
        conversationId: 'open-1',
      });
      // The turn can still die at the LLM, so nothing is counted until it is delivered.
      expect(repos.txConversationRepo.increment).not.toHaveBeenCalled();
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

      // Same key derivation as shared/utils/company-lock.util.ts, or this critical
      // section lands in a different lock namespace from the seat/plan mutations.
      expect(repos.managerQuery).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
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

    it('writes the connected number onto a new window when the chat row has one', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 0 });
      repos.conversationQb.getOne.mockResolvedValue(null);
      repos.txChatRepo.findOne.mockResolvedValue({ phoneNumberId: 'pn-1' });

      await consume();

      expect(repos.txChatRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'c1', userId: 'u1', chatId: 'chat1' },
        }),
      );
      expect(repos.txConversationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumberId: 'pn-1' }),
      );
    });

    it('leaves phone_number_id null when the chat row is not found', async () => {
      repos.usageQb.getOne.mockResolvedValue({ creditsUsed: 0 });
      repos.conversationQb.getOne.mockResolvedValue(null);
      repos.txChatRepo.findOne.mockResolvedValue(null);

      await consume();

      expect(repos.txConversationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumberId: null }),
      );
    });
  });

  describe('refundConversationCredit', () => {
    const refund = () =>
      service.refundConversationCredit('c1', 'conv-1', PERIOD.start);

    it('deletes the unused window and lowers the count under the company lock', async () => {
      repos.managerQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 'conv-1' }], 1])
        .mockResolvedValueOnce([[], 1]);

      await expect(refund()).resolves.toBe(true);

      expect(repos.settingsRepo.manager.transaction).toHaveBeenCalledTimes(1);
      const calls = repos.managerQuery.mock.calls;
      expect(calls[0]).toEqual([
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['c1'],
      ]);
      expect(calls[1][0]).toMatch(
        /DELETE FROM "whatsapp_ai_conversations"[\s\S]*"id" = \$1 AND "company_id" = \$2 AND "messages_count" = 0/,
      );
      expect(calls[1][1]).toEqual(['conv-1', 'c1']);
      expect(calls[2][0]).toMatch(
        /GREATEST\("credits_used" - 1, 0\)[\s\S]*"company_id" = \$1 AND "period_start" = \$2/,
      );
      expect(calls[2][1]).toEqual(['c1', PERIOD.start]);
    });

    it('keeps the credit when the window already carried a reply', async () => {
      repos.managerQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[], 0]);

      await expect(refund()).resolves.toBe(false);

      expect(repos.managerQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordTurnDelivered', () => {
    it('counts the reply against the conversation, scoped to the company', async () => {
      await service.recordTurnDelivered('c1', 'conv-1');

      expect(repos.conversationRepo.increment).toHaveBeenCalledWith(
        { id: 'conv-1', companyId: 'c1' },
        'messagesCount',
        1,
      );
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
    let unitQb: Record<string, jest.Mock>;
    let placeRows: Record<string, unknown>[];
    let tallyRows: Record<string, unknown>[];
    let unitRows: Record<string, unknown>[];

    const agent = (regionCodes: string[]) =>
      repos.userRepo.findOne.mockResolvedValue({
        id: 'u1',
        role: 'agent',
        regionCodes,
      });

    const whereCalls = () =>
      unitQb.andWhere.mock.calls.map(([clause, params]) => ({
        clause: typeof clause === 'string' ? clause : 'brackets',
        params,
      }));

    const placeRow = (
      assetId: string,
      assetName: string,
      localityName: string,
      cityName: string,
      regionCode: string,
      country: string,
    ) => ({
      assetId,
      assetName,
      localityId: `l-${localityName}`,
      localityName,
      cityId: `c-${cityName}`,
      cityName,
      regionCode,
      country,
      type: 'RENTAL',
      count: '2',
    });

    const tallyRow = (
      regionCode: string,
      area: string,
      matching: number,
      inBudget = matching,
      city = 'City',
    ) => ({
      regionCode,
      localityId: `l-${area}`,
      area,
      city,
      matching: String(matching),
      inBudget: String(inBudget),
      minMatching: '100',
      maxMatching: '900',
      minInBudget: '100',
      maxInBudget: '500',
    });

    beforeEach(() => {
      placeRows = [
        placeRow('a1', 'Liberty Crest', 'Gulberg', 'Lahore', 'punjab', 'PK'),
        placeRow('a2', 'Block J Homes', 'Johar Town', 'Lahore', 'punjab', 'PK'),
        placeRow('a3', 'Azure Quay', 'Dubai Marina', 'Dubai', 'dubai', 'AE'),
        placeRow('a4', 'Bay Sail', 'Business Bay', 'Dubai', 'dubai', 'AE'),
        placeRow('a5', 'Qasr', 'Downtown', 'Dubai', 'dubai', 'AE'),
      ];
      tallyRows = [tallyRow('dubai', 'Downtown', 3)];
      unitRows = [];
      unitQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'unit-1' }]),
        getRawMany: jest.fn().mockImplementation(() => {
          const last = unitQb.select.mock.calls.at(-1)?.[1];
          return Promise.resolve(
            last === 'assetId'
              ? placeRows
              : last === 'unitNumber'
                ? unitRows
                : tallyRows,
          );
        }),
      };
      repos.unitRepo.createQueryBuilder.mockReturnValue(unitQb);
      service = makeService(repos);
    });

    it('looks a unit up by its number alone when the searched city does not hold it', async () => {
      agent(['dubai', 'punjab']);
      const search = jest
        .spyOn(service as any, 'search')
        .mockResolvedValueOnce({ units: [], total: 0, locations: [] })
        .mockResolvedValueOnce({ units: [{ id: 'u-2804' }], total: 1 });
      const result = await service.searchProperties('c1', 'u1', {
        unit: '2804',
        city: ['Pakistan'],
        type: 'RENT',
      });
      expect(search.mock.calls[1][2]).toEqual({ unit: '2804', type: 'RENT' });
      expect(result).toMatchObject({ total: 1, unitElsewhere: true });
    });

    it('counts the listings a kind or amenity filter alone left out', async () => {
      agent(['dubai']);
      const search = jest
        .spyOn(service as any, 'search')
        .mockResolvedValueOnce({ units: [], total: 0, locations: [] })
        .mockResolvedValueOnce({ units: [{ id: 'u-1' }], total: 4 });
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Dubai'],
        kind: ['villa'],
        amenities: [['pool']],
        page: 2,
      });
      expect(search.mock.calls[1][2]).toEqual({ city: ['Dubai'] });
      expect(result.unfiltered).toBe(4);
      expect(result.units).toEqual([]);
    });

    it('does not count without filters when none was a kind or amenity', async () => {
      agent(['dubai']);
      const search = jest
        .spyOn(service as any, 'search')
        .mockResolvedValue({ units: [], total: 0, locations: [] });
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Dubai'],
        minBedrooms: 9,
      });
      expect(search).toHaveBeenCalledTimes(1);
      expect(result.unfiltered).toBeUndefined();
    });

    it('counts web-link images of the returned units in one company-scoped query', async () => {
      agent(['dubai']);
      unitQb.getMany.mockResolvedValue([{ id: 'unit-1' }, { id: 'unit-2' }]);
      const mediaQb = repos.mediaRepo.createQueryBuilder();
      repos.mediaRepo.createQueryBuilder.mockClear();
      mediaQb.getRawMany.mockResolvedValue([{ unitId: 'unit-1', count: '4' }]);
      const result = await service.searchProperties('c1', 'u1', {});
      expect(result.photos).toEqual({ 'unit-1': 4, 'unit-2': 0 });
      expect(repos.mediaRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mediaQb.getRawMany).toHaveBeenCalledTimes(1);
      expect(mediaQb.where).toHaveBeenCalledWith('m.companyId = :companyId', {
        companyId: 'c1',
      });
      expect(mediaQb.andWhere).toHaveBeenCalledWith(
        'm.unitId IN (:...unitIds)',
        { unitIds: ['unit-1', 'unit-2'] },
      );
      expect(mediaQb.andWhere).toHaveBeenCalledWith('m.type = :type', {
        type: 'image',
      });
      expect(mediaQb.andWhere).toHaveBeenCalledWith("m.url ~* '^https?://'");
      expect(mediaQb.groupBy).toHaveBeenCalledWith('m.unitId');
      expect(repos.mediaRepo.find).not.toHaveBeenCalled();
    });

    it('returns the listings without photo counts when the count query fails', async () => {
      agent(['dubai']);
      unitQb.getMany.mockResolvedValue([{ id: 'unit-1' }]);
      const mediaQb = repos.mediaRepo.createQueryBuilder();
      mediaQb.getRawMany.mockRejectedValue(new Error('db down'));
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);
      const result = await service.searchProperties('c1', 'u1', {});
      expect(result.units).toEqual([{ id: 'unit-1' }]);
      expect(result.photos).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Photo counts unavailable for company c1'),
      );
    });

    it('reads no media when the search returns no units', async () => {
      agent(['dubai']);
      unitQb.getMany.mockResolvedValue([]);
      const result = await service.searchProperties('c1', 'u1', {});
      expect(result.photos).toBeUndefined();
      expect(repos.mediaRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns nothing for a user outside the company, without querying units', async () => {
      const result = await service.searchProperties('c1', 'u1', {});
      expect(repos.userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1', companyId: 'c1' } }),
      );
      expect(result).toEqual({ units: [], total: 0 });
      expect(repos.unitRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns nothing for an agent with no assigned regions', async () => {
      agent([]);
      const result = await service.searchProperties('c1', 'u1', {});
      expect(result).toEqual({ units: [], total: 0 });
      expect(repos.unitRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('limits an agent to their regions and to available, unarchived company units', async () => {
      agent(['dubai']);
      await service.searchProperties('c1', 'u1', {});
      expect(unitQb.where).toHaveBeenCalledWith('u.companyId = :companyId', {
        companyId: 'c1',
      });
      expect(whereCalls()).toEqual(
        expect.arrayContaining([
          {
            clause: 'u.status = :status',
            params: { status: UnitStatus.AVAILABLE },
          },
          { clause: 'u.deletedAt IS NULL', params: undefined },
          {
            clause: 'ci.regionCode IN (:...regionCodes)',
            params: { regionCodes: ['dubai'] },
          },
        ]),
      );
    });

    it('does not narrow regions for a company admin', async () => {
      repos.userRepo.findOne.mockResolvedValue({
        id: 'u1',
        role: 'company_admin',
        regionCodes: [],
      });
      await service.searchProperties('c1', 'u1', {});
      expect(whereCalls().map((c) => c.clause)).not.toContain(
        'ci.regionCode IN (:...regionCodes)',
      );
    });

    it('reads place rows company-wide through the shared cache and scopes them in memory', async () => {
      agent(['punjab']);
      const result = await service.searchProperties('c1', 'u1', {
        city: ['لاہور'],
      });
      expect(repos.redis.getOrSetJson).toHaveBeenCalledWith(
        'ref:company-places:c1',
        expect.any(Number),
        expect.any(Function),
      );
      expect(whereCalls()).toContainEqual({
        clause: 'a.id = ANY(CAST(:assetIds AS uuid[]))',
        params: { assetIds: ['a1', 'a2'] },
      });
      expect(result.locations?.[0]).toMatchObject({
        label: 'city 1',
        status: 'matched',
        matches: [expect.objectContaining({ name: 'Lahore', level: 'city' })],
      });
    });

    it('reads places, amenities and unit numbers once while the cache entry stays', async () => {
      agent(['dubai']);
      const stored = new Map<string, unknown>();
      repos.redis.getOrSetJson.mockImplementation(
        async (key: string, _ttl: number, load: () => Promise<unknown>) => {
          if (!stored.has(key)) stored.set(key, await load());
          return JSON.parse(JSON.stringify(stored.get(key)));
        },
      );
      await service.searchProperties('c1', 'u1', { place: ['Downtown'] });
      await service.searchProperties('c1', 'u1', { place: ['Marina'] });
      const placeQueries = () =>
        unitQb.select.mock.calls.filter(([, a]) => a === 'assetId').length;
      expect(placeQueries()).toBe(1);
      stored.clear();
      await service.searchProperties('c1', 'u1', { place: ['Marina'] });
      expect(placeQueries()).toBe(2);
    });

    it('resolves a place inside the city it was given with', async () => {
      agent(['punjab', 'dubai']);
      await service.searchProperties('c1', 'u1', {
        city: ['Dubai'],
        place: ['Downtown Dubai'],
      });
      expect(whereCalls()).toContainEqual({
        clause: 'a.id = ANY(CAST(:assetIds AS uuid[]))',
        params: { assetIds: ['a5'] },
      });
    });

    it('returns no units and the cities with their counts when a place is unknown', async () => {
      agent(['punjab', 'dubai']);
      tallyRows = [
        tallyRow('dubai', 'Downtown', 6, 6, 'Dubai'),
        tallyRow('punjab', 'Gulberg', 4, 4, 'Lahore'),
      ];
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Atlantis'],
      });
      expect(unitQb.getMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        units: [],
        total: 0,
        citiesWithListings: [
          { name: 'Dubai', count: 6 },
          { name: 'Lahore', count: 4 },
        ],
      });
      expect(result.locations?.[0].status).toBe('unknown');
    });

    it('names no city when no city holds what was asked', async () => {
      agent(['dubai']);
      tallyRows = [];
      const result = await service.searchProperties('c1', 'u1', {
        minBedrooms: 9,
      });
      expect(result.citiesWithListings).toEqual([]);
    });

    it('counts other cities with every filter but the city, place and unit, within the budget', async () => {
      agent(['punjab', 'dubai', 'sharjah']);
      placeRows.push(
        placeRow('a7', 'Majaz', 'Al Majaz', 'Sharjah', 'sharjah', 'AE'),
      );
      tallyRows = [
        tallyRow('sharjah', 'Al Majaz', 3, 1, 'Sharjah'),
        tallyRow('dubai', 'Downtown', 2, 0, 'Dubai'),
      ];
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Atlantis'],
        kind: ['villa'],
        maxPrice: 5000,
        budgetCurrency: 'AED',
        budgetPeriod: 'month',
      });
      expect(result.citiesWithListings).toEqual([
        { name: 'Sharjah', count: 1 },
      ]);
      expect(whereCalls()).toContainEqual({
        clause: 'u.subType IN (:...subTypes)',
        params: { subTypes: ['VILLA'] },
      });
    });

    it('lists only cities in the searched country on an empty result', async () => {
      agent(['punjab', 'dubai', 'texas', 'sharjah']);
      placeRows.push(
        placeRow('a6', 'Mueller', 'Mueller', 'Austin', 'texas', 'US'),
        placeRow('a7', 'Majaz', 'Al Majaz', 'Sharjah', 'sharjah', 'AE'),
      );
      tallyRows = [];
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Dubai'],
        minBedrooms: 9,
      });
      expect(result.citiesWithListings).toEqual([]);
      tallyRows = [
        tallyRow('sharjah', 'Al Majaz', 2, 2, 'Sharjah'),
        tallyRow('texas', 'Mueller', 5, 5, 'Austin'),
      ];
      unitQb.getMany.mockResolvedValue([]);
      const other = await service.searchProperties('c1', 'u1', {
        city: ['Dubai'],
        place: ['Binaya'],
        minBedrooms: 9,
      });
      expect(other.citiesWithListings).toEqual([{ name: 'Sharjah', count: 2 }]);
    });

    it('takes the country from the budget currency and never names a city elsewhere', async () => {
      agent(['punjab', 'dubai', 'texas']);
      placeRows.push(
        placeRow('a6', 'Mueller', 'Mueller', 'Austin', 'texas', 'US'),
      );
      tallyRows = [];
      const result = await service.searchProperties('c1', 'u1', {
        minBedrooms: 9,
        maxPrice: 50000,
        budgetCurrency: 'PKR',
        budgetPeriod: 'month',
      });
      expect(result.citiesWithListings).toEqual([]);
      tallyRows = [
        tallyRow('punjab', 'Gulberg', 4, 4, 'Lahore'),
        tallyRow('texas', 'Mueller', 5, 5, 'Austin'),
      ];
      const lahore = await service.searchProperties('c1', 'u1', {
        city: ['Atlantis'],
        maxPrice: 50000,
        budgetCurrency: 'PKR',
        budgetPeriod: 'month',
      });
      expect(lahore.citiesWithListings).toEqual([{ name: 'Lahore', count: 4 }]);
    });

    it("names the company's own cities when the place is not one of its places", async () => {
      agent(['punjab', 'dubai']);
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Riyadh'],
      });
      expect(result.total).toBe(0);
      expect(result.citiesWithListings?.length).toBeGreaterThan(0);
    });

    it('asks which city when a place lies in several cities and no city was given', async () => {
      agent(['punjab', 'sindh']);
      placeRows.push(
        placeRow(
          'a8',
          'Block D Homes',
          'DHA Phase 5',
          'Lahore',
          'punjab',
          'PK',
        ),
        placeRow('a9', 'Khayaban', 'DHA Phase 6', 'Karachi', 'sindh', 'PK'),
      );
      const result = await service.searchProperties('c1', 'u1', {
        place: ['DHA'],
      });
      expect(result.cityChoice).toEqual({
        label: 'place 1',
        options: expect.arrayContaining([
          { place: 'DHA Phase 5', city: 'Lahore' },
          { place: 'DHA Phase 6', city: 'Karachi' },
        ]),
      });
      expect(result.citiesWithListings).toBeUndefined();
      expect(unitQb.getMany).not.toHaveBeenCalled();
      const given = await service.searchProperties('c1', 'u1', {
        city: ['Lahore'],
        place: ['DHA'],
      });
      expect(given.cityChoice).toBeUndefined();
    });

    it('names the other city holding a place that is missing from the searched city', async () => {
      agent(['punjab', 'sindh']);
      placeRows.push(
        placeRow(
          'a8',
          'Block D Homes',
          'DHA Phase 5',
          'Lahore',
          'punjab',
          'PK',
        ),
        placeRow('a9', 'Khayaban', 'DHA Phase 6', 'Karachi', 'sindh', 'PK'),
      );
      const result = await service.searchProperties('c1', 'u1', {
        city: ['Karachi'],
        place: ['DHA Phase 5'],
      });
      const term = result.locations?.find((t) => t.label === 'place 1');
      expect(term?.status).toBe('unknown');
      expect(term?.elsewhere).toEqual([
        expect.objectContaining({ name: 'DHA Phase 5', within: 'Lahore' }),
      ]);
    });

    it('reads one grouped tally and one page: three queries with the user lookup', async () => {
      agent(['dubai']);
      const result = await service.searchProperties('c1', 'u1', { page: 1 });
      expect(repos.unitRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(unitQb.offset).toHaveBeenCalledWith(0);
      expect(unitQb.limit).toHaveBeenCalledWith(5);
      expect(result).toMatchObject({ total: 3, units: [{ id: 'unit-1' }] });
    });

    it('skips the page query past the end', async () => {
      agent(['dubai']);
      const result = await service.searchProperties('c1', 'u1', { page: 2 });
      expect(unitQb.getMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ total: 3, offset: 5, units: [] });
    });

    it('infers the budget currency when every matching listing shares one', async () => {
      agent(['punjab']);
      tallyRows = [tallyRow('punjab', 'Gulberg', 4, 2)];
      const result = await service.searchProperties('c1', 'u1', {
        maxPrice: 10000000,
      });
      expect(result).toMatchObject({ budgetInferred: 'PKR', total: 2 });
      expect(whereCalls()).toContainEqual({
        clause: 'ci.regionCode IN (:...budgetRegions)',
        params: { budgetRegions: expect.arrayContaining(['punjab', 'sindh']) },
      });
    });

    it('compares a budget without a currency with each listing in its own currency', async () => {
      agent(['punjab', 'dubai']);
      tallyRows = [
        tallyRow('punjab', 'Gulberg', 4, 2),
        tallyRow('dubai', 'Downtown', 3, 1),
      ];
      const result = await service.searchProperties('c1', 'u1', {
        maxPrice: 10000000,
      });
      expect(result.budgetInferred).toBeUndefined();
      expect(result.total).toBe(3);
      expect(whereCalls()).toContainEqual({
        clause:
          "(CASE WHEN u.propertyType = 'RENTAL' AND :budgetReference >= u.price * 3.4641 THEN u.price * 12 <= :maxPrice ELSE u.price <= :maxPrice END)",
        params: { budgetReference: 10000000, maxPrice: 10000000 },
      });
      expect(whereCalls().map((c) => c.clause)).not.toContain(
        'ci.regionCode IN (:...budgetRegions)',
      );
    });

    it('compares a budget in a currency no listing uses in each listing currency', async () => {
      agent(['dubai']);
      const result = await service.searchProperties('c1', 'u1', {
        maxPrice: 3000,
        unknownCurrency: 'EUR',
      });
      expect(result.budgetInferred).toBeUndefined();
      expect(unitQb.getMany).toHaveBeenCalled();
    });

    it('counts listings in another currency apart from the budget currency', async () => {
      agent(['punjab', 'dubai', 'texas']);
      tallyRows = [
        tallyRow('dubai', 'Downtown', 3, 1),
        tallyRow('texas', 'Mueller', 3, 3),
        tallyRow('punjab', 'Gulberg', 2, 2),
      ];
      const result = await service.searchProperties('c1', 'u1', {
        maxPrice: 8000,
        budgetCurrency: 'AED',
      });
      expect(result.total).toBe(1);
      expect(result.otherCurrency).toEqual([
        { currency: 'USD', count: 3 },
        { currency: 'PKR', count: 2 },
      ]);
    });

    it('takes turns between currencies in a price sort, largest group first', async () => {
      agent(['punjab', 'dubai']);
      tallyRows = [
        tallyRow('dubai', 'Downtown', 3),
        tallyRow('punjab', 'Gulberg', 5),
      ];
      const result = await service.searchProperties('c1', 'u1', {
        sort: 'price_low',
      });
      expect(result.currencies?.map((c) => c.currency)).toEqual(['PKR', 'AED']);
      const rank =
        '(CAST(:currencyRanks AS int[]))[array_position(CAST(:rankedRegions AS text[]), ci.regionCode)]';
      expect(unitQb.orderBy).toHaveBeenCalledWith(
        `ROW_NUMBER() OVER (PARTITION BY ${rank} ORDER BY u.price ASC NULLS LAST, u.id ASC)`,
      );
      expect(unitQb.addOrderBy).toHaveBeenCalledWith(rank);
      expect(unitQb.setParameter).toHaveBeenCalledWith('rankedRegions', [
        'dubai',
        'punjab',
      ]);
      expect(unitQb.setParameter).toHaveBeenCalledWith('currencyRanks', [1, 0]);
    });

    it('asks for a city instead of searching every city for an amenity alone, naming only the cities that have it', async () => {
      agent(['punjab', 'dubai']);
      tallyRows = [
        { ...tallyRow('dubai', 'Downtown', 2), city: 'Dubai' },
        { ...tallyRow('dubai', 'Dubai Marina', 1), city: 'Dubai' },
        { ...tallyRow('punjab', 'Gulberg', 1), city: 'Lahore' },
        { ...tallyRow('punjab', 'Johar Town', 0), city: 'Johar' },
      ];
      const result = await service.searchProperties('c1', 'u1', {
        amenities: [['sea_view']],
      });
      expect(result).toMatchObject({
        cityNeeded: true,
        total: 0,
        citiesWithListings: [
          { name: 'Dubai', count: 3 },
          { name: 'Lahore', count: 1 },
        ],
      });
      expect(unitQb.getMany).not.toHaveBeenCalled();
    });

    it('searches an amenity alone when only one city has it, from the same tally', async () => {
      agent(['punjab', 'dubai']);
      tallyRows = [{ ...tallyRow('dubai', 'Jumeirah', 3), city: 'Dubai' }];
      const result = await service.searchProperties('c1', 'u1', {
        amenities: [['private_pool']],
      });
      expect(result.cityNeeded).toBeUndefined();
      expect(result.total).toBe(3);
      expect(repos.unitRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('asks for a city when an amenity sent as a place is the only requirement', async () => {
      agent(['punjab', 'dubai']);
      tallyRows = [
        { ...tallyRow('dubai', 'Downtown', 2), city: 'Dubai' },
        { ...tallyRow('punjab', 'Gulberg', 1), city: 'Lahore' },
      ];
      unitQb.getRawMany.mockImplementation(() => {
        const last = unitQb.select.mock.calls.at(-1)?.[1];
        return Promise.resolve(
          last === 'assetId'
            ? placeRows
            : last === 'key'
              ? [{ key: 'sea_view' }]
              : tallyRows,
        );
      });
      const result = await service.searchProperties('c1', 'u1', {
        place: ['Sea View'],
      });
      expect(result.cityNeeded).toBe(true);
      expect(result.routed?.[0]).toContain('the amenity Sea view');
    });

    it('searches an amenity alone when the listings are in one city', async () => {
      agent(['dubai']);
      const result = await service.searchProperties('c1', 'u1', {
        amenities: [['sea_view']],
      });
      expect(result.cityNeeded).toBeUndefined();
      expect(result.total).toBe(3);
    });

    it('compares a budget without a period with the period each rental is closer to', async () => {
      agent(['dubai']);
      tallyRows = [tallyRow('dubai', 'Downtown', 3, 1)];
      const result = await service.searchProperties('c1', 'u1', {
        maxPrice: 150000,
        budgetCurrency: 'AED',
      });
      expect(result.total).toBe(1);
      expect(unitQb.addSelect).toHaveBeenCalledWith(
        "COUNT(*) FILTER (WHERE (CASE WHEN u.propertyType = 'RENTAL' AND :budgetReference >= u.price * 3.4641 THEN u.price * 12 <= :maxPrice ELSE u.price <= :maxPrice END))",
        'inBudget',
      );
    });

    it.each([
      ['month', 'u.price <= :maxPrice'],
      [
        'year',
        "(CASE WHEN u.propertyType = 'RENTAL' THEN u.price * 12 <= :maxPrice ELSE u.price <= :maxPrice END)",
      ],
    ] as const)(
      'compares a %s budget with that reading only',
      async (budgetPeriod, clause) => {
        agent(['dubai']);
        const result = await service.searchProperties('c1', 'u1', {
          maxPrice: 150000,
          budgetCurrency: 'AED',
          budgetPeriod,
        });
        expect(result.total).toBeGreaterThan(0);
        expect(whereCalls()).toContainEqual({
          clause,
          params: { maxPrice: 150000 },
        });
      },
    );

    const UNIT_CORE =
      "regexp_replace(regexp_replace(lower(regexp_replace(u.unitNumber, '[^a-zA-Z0-9]', '', 'g')), '^[a-z]{2,}([0-9])', '\\1'), '^0+([0-9])', '\\1') IN (:...unitKeys)";

    it('matches a unit by its number without the leading word, so either reading of a unit after its building is one key', async () => {
      agent(['dubai']);
      await service.searchProperties('c1', 'u1', {
        unit: 'villa 22',
        unitAlt: '22',
      });
      expect(whereCalls()).toContainEqual({
        clause: UNIT_CORE,
        params: { unitKeys: ['22'] },
      });
    });

    it('keeps a single letter before the number and drops leading zeros', async () => {
      agent(['sindh']);
      unitRows = [
        { assetId: 'a1', unitNumber: 'A-403' },
        { assetId: 'a1', unitNumber: 'TH 08' },
      ];
      await service.searchProperties('c1', 'u1', { unit: 'A-403' });
      await service.searchProperties('c1', 'u1', { unit: 'TH 08' });
      const keys = whereCalls()
        .filter((c) => c.clause === UNIT_CORE)
        .map((c) => c.params);
      expect(keys).toEqual(
        expect.arrayContaining([{ unitKeys: ['a403'] }, { unitKeys: ['8'] }]),
      );
    });

    it('requires one of the amenity keys asked for, never a substring', async () => {
      agent(['dubai']);
      await service.searchProperties('c1', 'u1', {
        amenities: [['ac'], ['covered_parking', 'free_parking']],
      });
      const clauses = whereCalls().filter((c) =>
        c.clause.includes('u.amenities'),
      );
      expect(clauses).toEqual([
        {
          clause: 'u.amenities ?| CAST(:amenity0 AS text[])',
          params: { amenity0: ['ac'] },
        },
        {
          clause: 'u.amenities ?| CAST(:amenity1 AS text[])',
          params: { amenity1: ['covered_parking', 'free_parking'] },
        },
        {
          clause: 'u.amenities ?| CAST(:amenity0 AS text[])',
          params: { amenity0: ['ac'] },
        },
        {
          clause: 'u.amenities ?| CAST(:amenity1 AS text[])',
          params: { amenity1: ['covered_parking', 'free_parking'] },
        },
      ]);
    });
  });

  describe('listLocations', () => {
    it('returns the scoped place rows, filtered by listing type', async () => {
      repos.userRepo.findOne.mockResolvedValue({
        id: 'u1',
        role: 'agent',
        regionCodes: ['dubai'],
      });
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { assetId: 'a1', regionCode: 'dubai', type: 'RENTAL', count: '3' },
          { assetId: 'a1', regionCode: 'dubai', type: 'FOR_SALE', count: '1' },
          { assetId: 'a2', regionCode: 'punjab', type: 'FOR_SALE', count: '4' },
        ]),
      };
      repos.unitRepo.createQueryBuilder.mockReturnValue(qb);
      service = makeService(repos);
      const rows = await service.listLocations('c1', 'u1', 'SALE');
      expect(rows).toEqual([
        { assetId: 'a1', regionCode: 'dubai', type: 'FOR_SALE', count: 1 },
      ]);
    });
  });
});
