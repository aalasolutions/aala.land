import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
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
    it('returns paginated transactions for company', async () => {
      repo.findAndCount.mockResolvedValue([
        [mockTransaction as Transaction],
        1,
      ]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        relations: ['unit'],
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockTransaction]);
      expect(result.total).toBe(1);
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
    it('updates transaction status', async () => {
      repo.findOne.mockResolvedValue({ ...mockTransaction } as Transaction);
      repo.save.mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
      } as Transaction);

      const result = await service.update('txn-uuid-1', companyId, {
        status: TransactionStatus.COMPLETED,
      });

      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('sets paidAt when status is COMPLETED', async () => {
      const txnWithoutPaidAt = {
        ...mockTransaction,
        paidAt: null,
      } as unknown as Transaction;
      repo.findOne.mockResolvedValue(txnWithoutPaidAt);
      repo.save.mockImplementation(async (t) => t as Transaction);

      await service.update('txn-uuid-1', companyId, {
        status: TransactionStatus.COMPLETED,
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAt: expect.any(Date) }),
      );
    });
  });

  describe('getSummary', () => {
    it('returns totalIncome, totalExpense, and net', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValue({ totalIncome: '15000', totalExpense: '3000' }),
      };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.getSummary(companyId);

      expect(result.totalIncome).toBe(15000);
      expect(result.totalExpense).toBe(3000);
      expect(result.net).toBe(12000);
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

    // Stands in for Postgres on the QueryBuilder read. The predicate is
    // "unit is null OR unit sits in one of these regions", so an unlinked
    // transaction survives whatever the caller is assigned to.
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

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data.map((t) => t.id)).toEqual([
        'txn-makkah',
        'txn-no-unit',
      ]);
      expect(result.total).toBe(2);
    });

    it('lists no transaction from a region outside the caller assignments', async () => {
      seedTransactions();

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        'punjab',
        makkahManager,
      );

      expect(result.data.map((t) => t.id)).not.toContain('txn-punjab');
    });

    it('narrows the list to a requested region the caller is assigned to', async () => {
      seedTransactions();

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        'punjab',
        twoRegionManager,
      );

      expect(result.data.map((t) => t.id)).toEqual([
        'txn-punjab',
        'txn-no-unit',
      ]);
    });

    it('leaves the list unfiltered for admins', async () => {
      seedTransactions();

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        admin,
      );

      expect(result.data.map((t) => t.id)).toEqual([
        'txn-makkah',
        'txn-punjab',
        'txn-no-unit',
      ]);
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedTransactions();

      const result = await service.findAll(companyId, 1, 20);

      expect(result.total).toBe(3);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedTransactions();

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        unassignedManager,
      );

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });
  });
});
