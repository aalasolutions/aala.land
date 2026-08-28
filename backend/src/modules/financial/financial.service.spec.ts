import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { FinancialService } from './financial.service';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from './entities/transaction.entity';

describe('FinancialService', () => {
  let service: FinancialService;
  let repo: jest.Mocked<Repository<Transaction>>;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialService,
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
      ],
    }).compile();

    service = module.get<FinancialService>(FinancialService);
    repo = module.get(getRepositoryToken(Transaction));
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

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockTransaction);
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
    it('returns transactions grouped by due date proximity', async () => {
      const overdueTransaction = {
        ...mockTransaction,
        id: 'txn-overdue',
        dueDate: new Date('2025-01-01'),
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

      repo.find
        .mockResolvedValueOnce([overdueTransaction])
        .mockResolvedValueOnce([todayTransaction])
        .mockResolvedValueOnce([weekTransaction])
        .mockResolvedValueOnce([monthTransaction]);

      const result = await service.getDepositReminders(companyId);

      expect(result.overdue).toEqual([overdueTransaction]);
      expect(result.dueToday).toEqual([todayTransaction]);
      expect(result.dueThisWeek).toEqual([weekTransaction]);
      expect(result.dueThisMonth).toEqual([monthTransaction]);
      expect(repo.find).toHaveBeenCalledTimes(4);
    });

    it('returns empty arrays when no matching transactions', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.getDepositReminders(companyId);

      expect(result.overdue).toEqual([]);
      expect(result.dueToday).toEqual([]);
      expect(result.dueThisWeek).toEqual([]);
      expect(result.dueThisMonth).toEqual([]);
    });

    it('filters by INCOME type and PENDING status', async () => {
      repo.find.mockResolvedValue([]);

      await service.getDepositReminders(companyId);

      for (const call of repo.find.mock.calls) {
        const where = (call[0] as any).where;
        expect(where.companyId).toBe(companyId);
        expect(where.type).toBe(TransactionType.INCOME);
        expect(where.status).toBe(TransactionStatus.PENDING);
      }
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
              (r) => r.unitId === null || codes!.includes(r.regionCode as string),
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
