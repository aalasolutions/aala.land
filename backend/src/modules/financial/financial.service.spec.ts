import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { Transaction, TransactionType, TransactionStatus, PaymentMethod } from './entities/transaction.entity';

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
      repo.findAndCount.mockResolvedValue([[mockTransaction as Transaction], 1]);

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

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'txn-uuid-1', companyId } });
      expect(result).toEqual(mockTransaction);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('txn-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates transaction status', async () => {
      repo.findOne.mockResolvedValue({ ...mockTransaction } as Transaction);
      repo.save.mockResolvedValue({ ...mockTransaction, status: TransactionStatus.COMPLETED } as Transaction);

      const result = await service.update('txn-uuid-1', companyId, { status: TransactionStatus.COMPLETED });

      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('sets paidAt when status is COMPLETED', async () => {
      const txnWithoutPaidAt = { ...mockTransaction, paidAt: null } as unknown as Transaction;
      repo.findOne.mockResolvedValue(txnWithoutPaidAt);
      repo.save.mockImplementation(async (t) => t as Transaction);

      await service.update('txn-uuid-1', companyId, { status: TransactionStatus.COMPLETED });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAt: expect.any(Date) }),
      );
    });
  });

  describe('getSummary', () => {
    it('returns totalIncome, totalExpense, and net', async () => {
      const transactions = [
        { ...mockTransaction, type: TransactionType.INCOME, status: TransactionStatus.COMPLETED, amount: 15000 },
        { ...mockTransaction, type: TransactionType.EXPENSE, status: TransactionStatus.PENDING, amount: 3000 },
      ] as Transaction[];
      repo.find.mockResolvedValue(transactions);

      const result = await service.getSummary(companyId);

      expect(result.totalIncome).toBe(15000);
      expect(result.totalExpense).toBe(3000);
      expect(result.net).toBe(12000);
    });
  });

  describe('getDepositReminders', () => {
    it('returns transactions grouped by due date proximity', async () => {
      const overdueTransaction = { ...mockTransaction, id: 'txn-overdue', dueDate: new Date('2025-01-01') } as Transaction;
      const todayTransaction = { ...mockTransaction, id: 'txn-today' } as Transaction;
      const weekTransaction = { ...mockTransaction, id: 'txn-week' } as Transaction;
      const monthTransaction = { ...mockTransaction, id: 'txn-month' } as Transaction;

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
});
