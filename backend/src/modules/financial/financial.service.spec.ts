import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialAnalyticsService } from './financial-analytics.service';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from './entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Company } from '../companies/entities/company.entity';
import { regionTodaySql } from '../../shared/utils/region-time.util';

describe('FinancialService', () => {
  let service: FinancialService;
  let repo: jest.Mocked<Repository<Transaction>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let manager: { getRepository: jest.Mock; findOne: jest.Mock };

  const companyId = 'company-uuid-1';

  const mockTransaction: Partial<Transaction> = {
    id: 'txn-uuid-1',
    companyId,
    type: TransactionType.INCOME,
    status: TransactionStatus.PENDING,
    amount: 15000,
    currency: 'AED',
    description: 'Monthly rent',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    manager = {
      getRepository: jest.fn(() => repo),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialService,
        FinancialAnalyticsService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              innerJoin: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue(undefined),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<FinancialService>(FinancialService);
    repo = module.get(getRepositoryToken(Transaction));
    unitRepo = module.get(getRepositoryToken(Unit));
  });

  describe('archived unit', () => {
    const archivedUnit = { id: 'unit-archived', deletedAt: new Date() } as Unit;
    const shareLock = (id: string) => ({
      where: { id, companyId },
      select: { id: true, deletedAt: true },
      lock: { mode: 'pessimistic_read' },
    });

    it('refuses creating a transaction on an archived unit', async () => {
      unitRepo.findOne.mockResolvedValue(archivedUnit);

      await expect(
        service.create(companyId, {
          type: TransactionType.INCOME,
          amount: 100,
          unitId: 'unit-archived',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(unitRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'unit-archived', companyId },
        select: { id: true, deletedAt: true },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('404s a unit of another company on create', async () => {
      unitRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(companyId, {
          type: TransactionType.INCOME,
          amount: 100,
          unitId: 'unit-foreign',
        } as any),
      ).rejects.toThrow(new NotFoundException('Unit not found'));
      expect(unitRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'unit-foreign', companyId },
        select: { id: true, deletedAt: true },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    describe('unit region scope on create', () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 100,
        unitId: 'unit-punjab',
      } as any;
      const agent = { role: 'agent', regionCodes: ['dubai'] };

      it('404s a unit outside the caller assigned regions', async () => {
        unitRepo.findOne.mockResolvedValue(null);

        await expect(
          service.create(companyId, dto, undefined, agent as any),
        ).rejects.toThrow(new NotFoundException('Unit not found'));
        expect(unitRepo.findOne).toHaveBeenCalledWith({
          where: {
            id: 'unit-punjab',
            companyId,
            asset: {
              locality: { city: { regionCode: In(['dubai']) } },
            },
          },
          select: { id: true, deletedAt: true },
        });
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('404s without a query when the caller has no regions', async () => {
        await expect(
          service.create(companyId, dto, undefined, {
            role: 'agent',
            regionCodes: [],
          } as any),
        ).rejects.toThrow(new NotFoundException('Unit not found'));
        expect(unitRepo.findOne).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('does not scope the unit lookup for an admin', async () => {
        unitRepo.findOne.mockResolvedValue(null);

        await expect(
          service.create(companyId, dto, undefined, {
            role: 'company_admin',
            regionCodes: ['dubai'],
          } as any),
        ).rejects.toThrow(NotFoundException);
        expect(unitRepo.findOne).toHaveBeenCalledWith({
          where: { id: 'unit-punjab', companyId },
          select: { id: true, deletedAt: true },
        });
      });
    });

    it('refuses create when the unit is archived after the first read', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-archived',
        deletedAt: null,
      } as Unit);
      manager.findOne.mockResolvedValue(archivedUnit);
      repo.create.mockReturnValue(mockTransaction as Transaction);

      await expect(
        service.create(companyId, { unitId: 'unit-archived' } as any),
      ).rejects.toThrow('This unit is archived.');
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-archived'),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the unit is deleted while waiting for the lock', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-gone',
        deletedAt: null,
      } as Unit);
      manager.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockTransaction as Transaction);

      await expect(
        service.create(companyId, { unitId: 'unit-gone' } as any),
      ).rejects.toThrow(new NotFoundException('Unit not found'));
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses updating a transaction on an archived unit', async () => {
      repo.findOne.mockResolvedValue({
        ...mockTransaction,
        unitId: 'unit-archived',
      } as Transaction);
      manager.findOne.mockResolvedValue(archivedUnit);

      await expect(
        service.update('txn-uuid-1', companyId, {
          status: TransactionStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        'This unit is archived. Its records can no longer be edited.',
      );
      expect(repo.findOne).toHaveBeenLastCalledWith({
        where: { id: 'txn-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-archived'),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('allows a transaction on a live unit', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-live',
        deletedAt: null,
      } as Unit);
      manager.findOne.mockResolvedValue({ id: 'unit-live', deletedAt: null });
      repo.create.mockReturnValue(mockTransaction as Transaction);
      repo.save.mockResolvedValue(mockTransaction as Transaction);

      await expect(
        service.create(companyId, { unitId: 'unit-live' } as any),
      ).resolves.toEqual(mockTransaction);
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-live'),
      );
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a transaction', async () => {
      repo.create.mockReturnValue(mockTransaction as Transaction);
      repo.save.mockResolvedValue(mockTransaction as Transaction);

      const dto = { type: TransactionType.INCOME, amount: 15000 };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        regionCode: null,
      });
      expect(result).toEqual(mockTransaction);
    });

    it('refuses a region the caller is not assigned to', async () => {
      const dto = { type: TransactionType.INCOME, amount: 15000 };

      await expect(
        service.create(companyId, dto as any, 'punjab', {
          role: 'manager',
          regionCodes: ['makkah'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('stores the caller active region when no unit is linked', async () => {
      repo.create.mockReturnValue(mockTransaction as Transaction);
      repo.save.mockResolvedValue(mockTransaction as Transaction);

      const dto = { type: TransactionType.INCOME, amount: 15000 };
      await service.create(companyId, dto as any, 'makkah', {
        role: 'manager',
        regionCodes: ['makkah'],
      });

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        regionCode: 'makkah',
      });
    });
  });

  describe('findAll', () => {
    const listQb = () => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([[mockTransaction as Transaction], 1]),
    });

    it('returns paginated transactions for company', async () => {
      const qb: any = listQb();
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll(companyId, { page: 1, limit: 20 });

      expect(qb.where).toHaveBeenCalledWith('t.companyId = :companyId', {
        companyId,
      });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('t.id', 'DESC');
      expect(result.data).toEqual([mockTransaction]);
      expect(result.total).toBe(1);
    });

    it('echoes the clamped page and limit, not the raw caller input', async () => {
      const qb: any = listQb();
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll(companyId, {
        page: -3,
        limit: 5000,
      });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(500);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(500);
    });

    it('filters on the money date when a range is given, and keeps undated rows', async () => {
      const qb: any = listQb();
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll(companyId, {
        page: 1,
        limit: 20,
        from: '2026-02-01',
        to: '2026-02-28',
      });

      const clause = qb.andWhere.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('BETWEEN'),
      );
      expect(clause[0]).toContain('BETWEEN :from::date AND :to::date');
      // Outstanding is a state of today, so a pending row stays listed whatever the range.
      expect(clause[0]).toContain('IS NULL');
      expect(clause[1]).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    });

    it('rejects a range that is not a YYYY-MM-DD pair', async () => {
      const qb: any = listQb();
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(
        service.findAll(companyId, {
          page: 1,
          limit: 20,
          from: 'nonsense',
          to: '2026-02-28',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('returns transaction when found', async () => {
      repo.findOne.mockResolvedValue(mockTransaction as Transaction);

      const result = await service.findOne('txn-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'txn-uuid-1', companyId },
      });
      expect(result).toEqual(mockTransaction);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('txn-uuid-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    // The row carries no region, so its window pivots on the UTC day.
    const todayForRegion = () => new Date().toISOString().slice(0, 10);

    it('updates transaction status', async () => {
      repo.findOne.mockResolvedValue({ ...mockTransaction } as Transaction);
      repo.save.mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
      } as Transaction);

      const result = await service.update('txn-uuid-1', companyId, {
        status: TransactionStatus.COMPLETED,
        transactionDate: todayForRegion(),
      });

      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('refuses COMPLETED when no date is given and the row has none', async () => {
      repo.findOne.mockResolvedValue({ ...mockTransaction } as Transaction);

      await expect(
        service.update('txn-uuid-1', companyId, {
          status: TransactionStatus.COMPLETED,
        }),
      ).rejects.toThrow(/needs the date the money arrived/);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts COMPLETED when the row already carries a date', async () => {
      repo.findOne.mockResolvedValue({
        ...mockTransaction,
        transactionDate: todayForRegion(),
      } as Transaction);
      repo.save.mockImplementation(async (t) => t as Transaction);

      await service.update('txn-uuid-1', companyId, {
        status: TransactionStatus.COMPLETED,
      });

      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('returns totalIncome, totalExpense, and net', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalIncome: '15000',
          totalExpense: '3000',
          net: '12000',
        }),
      };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getSummary(companyId);

      expect(result.totalIncome).toBe(15000);
      expect(result.totalExpense).toBe(3000);
      expect(result.net).toBe(12000);
    });

    it('takes net from the SQL-computed value rather than re-subtracting in JS', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        // A value a naive `totalIncome - totalExpense` float subtraction would not reproduce.
        getRawOne: jest.fn().mockResolvedValue({
          totalIncome: '100000.1',
          totalExpense: '12237.93',
          net: '87762.17',
        }),
      };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getSummary(companyId);

      expect(result.net).toBe(87762.17);
    });
  });

  describe('getDepositReminders', () => {
    const today = regionTodaySql('t.region_code');
    const weekEnd = `(${today} + (7 - EXTRACT(DOW FROM ${today}))::int)`;
    const monthEnd = `((date_trunc('month', ${today}) + interval '1 month - 1 day')::date)`;
    const bucketConditions = [
      `t.due_date < ${today}`,
      `t.due_date = ${today}`,
      `t.due_date > ${today} AND t.due_date <= ${weekEnd}`,
      `t.due_date > ${weekEnd} AND t.due_date <= ${monthEnd}`,
    ];

    // One builder per bucket, resolved in call order.
    function seedBuckets(results: Transaction[][]) {
      const builders: any[] = [];
      repo.createQueryBuilder.mockImplementation((() => {
        const rows = results[builders.length] ?? [];
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue(rows),
        };
        builders.push(qb);
        return qb;
      }) as any);
      return builders;
    }

    it('returns transactions grouped by due date proximity', async () => {
      const overdueTransaction = {
        ...mockTransaction,
        id: 'txn-overdue',
        dueDate: '2025-01-01',
      } as Transaction;
      const todayTransaction = {
        ...mockTransaction,
        id: 'txn-today',
      } as Transaction;
      const weekTransaction = {
        ...mockTransaction,
        id: 'txn-week',
      } as Transaction;
      const monthTransaction = {
        ...mockTransaction,
        id: 'txn-month',
      } as Transaction;

      const builders = seedBuckets([
        [overdueTransaction],
        [todayTransaction],
        [weekTransaction],
        [monthTransaction],
      ]);

      const result = await service.getDepositReminders(companyId);

      expect(result.overdue).toEqual([overdueTransaction]);
      expect(result.dueToday).toEqual([todayTransaction]);
      expect(result.dueThisWeek).toEqual([weekTransaction]);
      expect(result.dueThisMonth).toEqual([monthTransaction]);
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(4);
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(repo.find).not.toHaveBeenCalled();
      builders.forEach((qb, i) => {
        expect(qb.andWhere).toHaveBeenCalledWith(bucketConditions[i]);
      });
    });

    it('uses non-overlapping region-day buckets in the row region zone', async () => {
      const builders = seedBuckets([]);

      await service.getDepositReminders(companyId);

      expect(today).toContain("WHEN t.region_code IN ('dubai'");
      expect(today).toContain('now() AT TIME ZONE');
      const conditions = builders.map((qb) => qb.andWhere.mock.calls[2][0]);
      expect(conditions).toEqual(bucketConditions);
    });

    it('returns empty arrays when no matching transactions', async () => {
      seedBuckets([]);

      const result = await service.getDepositReminders(companyId);

      expect(result.overdue).toEqual([]);
      expect(result.dueToday).toEqual([]);
      expect(result.dueThisWeek).toEqual([]);
      expect(result.dueThisMonth).toEqual([]);
    });

    it('filters by company, INCOME type and PENDING status, ordered and capped', async () => {
      const builders = seedBuckets([]);

      await service.getDepositReminders(companyId);

      expect(builders).toHaveLength(4);
      for (const qb of builders) {
        expect(qb.where).toHaveBeenCalledWith('t.company_id = :companyId', {
          companyId,
        });
        expect(qb.andWhere).toHaveBeenCalledWith('t.type = :type', {
          type: TransactionType.INCOME,
        });
        expect(qb.andWhere).toHaveBeenCalledWith('t.status = :status', {
          status: TransactionStatus.PENDING,
        });
        expect(qb.orderBy).toHaveBeenCalledWith('t.due_date', 'ASC');
        expect(qb.take).toHaveBeenCalledWith(100);
        expect(qb.andWhere).not.toHaveBeenCalledWith(
          't.region_code IN (:...regionCodes)',
          expect.anything(),
        );
      }
    });

    it('narrows every bucket to the requested region', async () => {
      const builders = seedBuckets([]);

      await service.getDepositReminders(companyId, 'dubai');

      for (const qb of builders) {
        expect(qb.andWhere).toHaveBeenCalledWith(
          't.region_code IN (:...regionCodes)',
          { regionCodes: ['dubai'] },
        );
      }
    });

    it('narrows every bucket to a scoped caller regions', async () => {
      const builders = seedBuckets([]);

      await service.getDepositReminders(companyId, undefined, {
        role: 'manager',
        regionCodes: ['makkah', 'punjab'],
      });

      for (const qb of builders) {
        expect(qb.andWhere).toHaveBeenCalledWith(
          't.region_code IN (:...regionCodes)',
          { regionCodes: ['makkah', 'punjab'] },
        );
      }
    });

    it('queries nothing when the caller has no assigned region', async () => {
      const result = await service.getDepositReminders(companyId, undefined, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result).toEqual({
        overdue: [],
        dueToday: [],
        dueThisWeek: [],
        dueThisMonth: [],
      });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };
    const unassignedManager = { role: 'manager', regionCodes: [] };

    const rows = [
      { id: 'txn-makkah', unitId: 'unit-makkah', regionCode: 'makkah' },
      { id: 'txn-punjab', unitId: 'unit-punjab', regionCode: 'punjab' },
      { id: 'txn-no-unit', unitId: null, regionCode: null },
    ];

    // Stands in for Postgres: the predicate admits a transaction with no unit at all.
    function seedTransactions() {
      let codes: string[] | undefined;
      const capture = (_sql: string, params?: any) => {
        if (params && Array.isArray(params.regionCodes)) {
          codes = params.regionCodes as string[];
        }
        return qb;
      };
      const visible = () =>
        codes
          ? rows.filter(
              (r) =>
                r.unitId === null || codes!.includes(r.regionCode as string),
            )
          : rows;
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        where: jest.fn(capture),
        andWhere: jest.fn(capture),
        getManyAndCount: jest.fn(() =>
          Promise.resolve([visible(), visible().length]),
        ),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.findAndCount.mockResolvedValue([rows as any, rows.length]);
      return qb;
    }

    it('confines the list to the caller regions with no regionCode argument', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, {
        page: 1,
        limit: 20,
        caller: makkahManager,
      });

      expect(result.data.map((t) => t.id)).toEqual([
        'txn-makkah',
        'txn-no-unit',
      ]);
      expect(result.total).toBe(2);
    });

    it('lists no transaction from a region outside the caller assignments', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, {
        page: 1,
        limit: 20,
        regionCode: 'punjab',
        caller: makkahManager,
      });

      expect(result.data.map((t) => t.id)).not.toContain('txn-punjab');
    });

    it('narrows the list to a requested region the caller is assigned to', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, {
        page: 1,
        limit: 20,
        regionCode: 'punjab',
        caller: twoRegionManager,
      });

      expect(result.data.map((t) => t.id)).toEqual([
        'txn-punjab',
        'txn-no-unit',
      ]);
    });

    it('leaves the list unfiltered for admins', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, {
        page: 1,
        limit: 20,
        caller: admin,
      });

      expect(result.data.map((t) => t.id)).toEqual([
        'txn-makkah',
        'txn-punjab',
        'txn-no-unit',
      ]);
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, { page: 1, limit: 20 });

      expect(result.total).toBe(3);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, {
        page: 1,
        limit: 20,
        caller: unassignedManager,
      });

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });
  });
  describe('getCategoryBreakdown', () => {
    const aggregateQb = (rows: unknown[]) => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });

    it('returns one row per category with numeric totals', async () => {
      const qb: any = aggregateQb([
        { category: 'RENT', type: TransactionType.INCOME, total: '96000.50' },
        {
          category: 'MAINTENANCE',
          type: TransactionType.EXPENSE,
          total: '8238',
        },
      ]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getCategoryBreakdown(companyId);

      expect(result).toEqual([
        { category: 'RENT', type: TransactionType.INCOME, total: 96000.5 },
        {
          category: 'MAINTENANCE',
          type: TransactionType.EXPENSE,
          total: 8238,
        },
      ]);
      // Sorts by the named aggregate alias, not its position in the select list.
      expect(qb.orderBy).toHaveBeenCalledWith('total', 'DESC');
    });

    it('labels a null category as OTHER', async () => {
      const qb: any = aggregateQb([
        { category: null, type: TransactionType.INCOME, total: '10' },
      ]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getCategoryBreakdown(companyId);

      expect(result[0].category).toBe('OTHER');
    });

    it('applies the date range when both ends are valid', async () => {
      const qb: any = aggregateQb([]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.getCategoryBreakdown(companyId, {
        from: '2026-04-01',
        to: '2026-06-30',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
        from: '2026-04-01',
        to: '2026-06-30',
      });
    });

    it('returns nothing without querying when the caller has no regions', async () => {
      const result = await service.getCategoryBreakdown(companyId, {
        caller: { role: 'manager', regionCodes: [] } as any,
      });

      expect(result).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getCashflowTrend', () => {
    const trendQb = (rows: unknown[]) => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });

    it('zero-fills months the query did not return', async () => {
      const qb: any = trendQb([]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getCashflowTrend(companyId, { periods: 6 });

      expect(result).toHaveLength(6);
      expect(result.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
      // Oldest first, ending with the current month.
      const months = result.map((p) => p.month);
      expect([...months].sort()).toEqual(months);
    });

    it('maps returned months onto the series as numbers', async () => {
      const qb: any = trendQb([]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      const series = await service.getCashflowTrend(companyId, { periods: 6 });
      const latest = series[series.length - 1].month;

      const filled: any = trendQb([
        { bucket: latest, income: '1500.25', expense: '400' },
      ]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(filled);

      const result = await service.getCashflowTrend(companyId, { periods: 6 });

      expect(result[result.length - 1]).toMatchObject({
        month: latest,
        income: 1500.25,
        expense: 400,
      });
      expect(result[0]).toMatchObject({
        month: result[0].month,
        income: 0,
        expense: 0,
      });
    });

    it('carries the calendar bounds of each month alongside its key', async () => {
      const qb: any = trendQb([]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getCashflowTrend(companyId, {
        periods: 2,
        from: '2026-02-01',
        to: '2026-02-28',
      });

      expect(result).toEqual([
        {
          month: '2026-01',
          from: '2026-01-01',
          to: '2026-01-31',
          income: 0,
          expense: 0,
        },
        {
          month: '2026-02',
          from: '2026-02-01',
          to: '2026-02-28',
          income: 0,
          expense: 0,
        },
      ]);
    });

    it('returns a zero-filled series without querying when the caller has no regions', async () => {
      const result = await service.getCashflowTrend(companyId, {
        periods: 6,
        caller: { role: 'manager', regionCodes: [] } as any,
      });

      expect(result).toHaveLength(6);
      expect(result.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    // 20:00Z on the last of February is already March 1 in Asia/Dubai but still February in Asia/Riyadh.
    describe('at a region month boundary', () => {
      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-02-28T20:00:00Z'));
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('ends on the newest region month rather than the UTC month', async () => {
        const qb: any = trendQb([]);
        (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

        const result = await service.getCashflowTrend(companyId, {
          periods: 6,
          regionCode: 'dubai',
        });

        expect(result[result.length - 1].month).toBe('2026-03');
      });

      it('keeps the series on the caller region month', async () => {
        const qb: any = trendQb([]);
        (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

        const result = await service.getCashflowTrend(companyId, {
          periods: 6,
          caller: { role: 'manager', regionCodes: ['riyadh'] } as any,
        });

        expect(result[result.length - 1].month).toBe('2026-02');
      });
    });

    it('bounds the raw business date so the predicate can use an index', async () => {
      const qb: any = trendQb([]);
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getCashflowTrend(companyId, { periods: 6 });

      const bound = qb.andWhere.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes(':seriesFrom'),
      );
      expect(bound[0]).toContain(
        'BETWEEN :seriesFrom::date AND :seriesTo::date',
      );
      expect(bound[0]).not.toContain('date_trunc');
      expect(bound[1]).toEqual({
        seriesFrom: `${result[0].month}-01`,
        seriesTo: result[result.length - 1].to,
      });
    });

    describe('when the range is not a whole calendar month', () => {
      it('returns six blocks the length of the range, ending with it', async () => {
        const qb: any = trendQb([]);
        (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

        const result = await service.getCashflowTrend(companyId, {
          periods: 6,
          from: '2026-09-15',
          to: '2026-09-21',
        });

        expect(result).toHaveLength(6);
        expect(result[result.length - 1]).toMatchObject({
          from: '2026-09-15',
          to: '2026-09-21',
        });
        expect(result[0]).toMatchObject({
          from: '2026-08-11',
          to: '2026-08-17',
        });
        expect(result[0].month).toBeUndefined();
      });

      it('buckets on the block width and bounds the whole series', async () => {
        const qb: any = trendQb([]);
        (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

        await service.getCashflowTrend(companyId, {
          periods: 6,
          from: '2026-09-15',
          to: '2026-09-21',
        });

        expect(qb.setParameters).toHaveBeenCalledWith(
          expect.objectContaining({
            seriesFrom: '2026-08-11',
            seriesTo: '2026-09-21',
            bucketSize: 7,
          }),
        );
      });

      it('maps a returned bucket index onto its block', async () => {
        const qb: any = trendQb([
          { bucket: '5', income: '900', expense: '100.5' },
        ]);
        (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

        const result = await service.getCashflowTrend(companyId, {
          periods: 6,
          from: '2026-09-19',
          to: '2026-09-21',
        });

        expect(result[5]).toEqual({
          from: '2026-09-19',
          to: '2026-09-21',
          income: 900,
          expense: 100.5,
        });
        expect(result[4]).toEqual({
          from: '2026-09-16',
          to: '2026-09-18',
          income: 0,
          expense: 0,
        });
      });
    });
  });
  // 20:30Z is already the next calendar day in Asia/Dubai: region day 2026-09-22, UTC day 2026-09-21.
  describe('transaction date window', () => {
    const regionCode = 'dubai';
    const caller = { role: 'manager', regionCodes: [regionCode] } as any;

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-21T20:30:00Z'));
      (repo.create as jest.Mock).mockImplementation((value: unknown) => value);
      (repo.save as jest.Mock).mockImplementation(
        (value: unknown) => value as Transaction,
      );
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const createDated = (transactionDate: string) =>
      service.create(
        companyId,
        { type: TransactionType.INCOME, amount: 100, transactionDate } as any,
        regionCode,
        caller,
      );

    const dated = (transactionDate: string | null) =>
      ({
        ...mockTransaction,
        regionCode,
        transactionDate,
        createdAt: new Date('2026-09-21T20:30:00Z'),
      }) as Transaction;

    it('accepts a create dated exactly 30 days back on the region day', async () => {
      const result = await createDated('2026-08-23');

      expect(result.transactionDate).toBe('2026-08-23');
    });

    it('refuses a create dated 31 days back and names the region earliest', async () => {
      // 2026-08-22 is still inside the window on the UTC day, not on the region day.
      await expect(createDated('2026-08-22')).rejects.toThrow(
        /earliest date accepted today is 2026-08-23/,
      );
      await expect(createDated('2026-08-22')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts a create dated today on the region day', async () => {
      const result = await createDated('2026-09-22');

      expect(result.transactionDate).toBe('2026-09-22');
    });

    it('refuses a create dated tomorrow: money cannot arrive in the future', async () => {
      await expect(createDated('2026-09-23')).rejects.toThrow(
        /cannot be in the future. The latest date accepted today is 2026-09-22/,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('keeps a record dated exactly 30 days back editable', async () => {
      repo.findOne.mockResolvedValue(dated('2026-08-23'));

      const result = await service.update('txn-uuid-1', companyId, {
        status: TransactionStatus.COMPLETED,
      });

      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    // PARKED with the lock itself: it froze PENDING rent-due rows before their due date.
    it.skip('locks a record dated 31 days back', async () => {
      repo.findOne.mockResolvedValue(dated('2026-08-22'));

      await expect(
        service.update('txn-uuid-1', companyId, {
          status: TransactionStatus.COMPLETED,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.skip('locks every field of an aged record, not only its date', async () => {
      // Dated 20 days back and edited 20 days later: 40 days old on the region day.
      repo.findOne.mockResolvedValue(dated('2026-08-13'));

      await expect(
        service.update('txn-uuid-1', companyId, { amount: 999 }),
      ).rejects.toThrow(/dated 2026-08-13, 40 days ago/);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.skip('ages an undated record on the region day it was created', async () => {
      const row = dated(null);
      // 21:00Z on 2026-08-21 is already 2026-08-22 in Asia/Dubai: 31 region days old.
      row.createdAt = new Date('2026-08-21T21:00:00Z');
      repo.findOne.mockResolvedValue(row);

      await expect(
        service.update('txn-uuid-1', companyId, { amount: 999 }),
      ).rejects.toThrow(ConflictException);
    });

    it('keeps an undated record created 30 region days back editable', async () => {
      const row = dated(null);
      row.createdAt = new Date('2026-08-22T21:00:00Z');
      repo.findOne.mockResolvedValue(row);

      const result = await service.update('txn-uuid-1', companyId, {
        amount: 999,
      });

      expect(result.amount).toBe(999);
    });

    it('refuses backdating an editable record beyond the window', async () => {
      repo.findOne.mockResolvedValue(dated('2026-09-20'));

      await expect(
        service.update('txn-uuid-1', companyId, {
          transactionDate: '2024-01-15',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts a new date inside the window on an editable record', async () => {
      repo.findOne.mockResolvedValue(dated('2026-09-20'));

      const result = await service.update('txn-uuid-1', companyId, {
        transactionDate: '2026-08-23',
      });

      expect(result.transactionDate).toBe('2026-08-23');
    });
  });
});
