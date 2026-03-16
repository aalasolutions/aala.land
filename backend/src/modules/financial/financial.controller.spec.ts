import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionType, TransactionStatus } from './entities/transaction.entity';

describe('FinancialController', () => {
  let controller: FinancialController;
  let service: jest.Mocked<FinancialService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId } };

  const mockTransaction = {
    id: 'txn-uuid-1',
    companyId,
    type: TransactionType.INCOME,
    status: TransactionStatus.PENDING,
    amount: 15000,
    currency: 'AED',
  };

  const paginated = { data: [mockTransaction], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialController],
      providers: [
        {
          provide: FinancialService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            getSummary: jest.fn(),
            getDepositReminders: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FinancialController>(FinancialController);
    service = module.get(FinancialService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a transaction scoped to company', async () => {
      service.create.mockResolvedValue(mockTransaction as any);

      const dto = { type: TransactionType.INCOME, amount: 15000 };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockTransaction);
    });
  });

  describe('findAll', () => {
    it('returns paginated transactions', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, undefined, undefined);
      expect(result).toEqual(paginated);
    });
  });

  describe('getSummary', () => {
    it('returns financial summary', async () => {
      const summary = { totalIncome: 15000, totalExpense: 0, net: 15000, currency: 'AED' };
      service.getSummary.mockResolvedValue(summary as any);

      const result = await controller.getSummary(mockReq);

      expect(service.getSummary).toHaveBeenCalledWith(companyId);
      expect(result).toEqual(summary);
    });
  });

  describe('findOne', () => {
    it('returns transaction by id', async () => {
      service.findOne.mockResolvedValue(mockTransaction as any);

      const result = await controller.findOne('txn-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('txn-uuid-1', companyId);
      expect(result).toEqual(mockTransaction);
    });

    it('propagates NotFoundException', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('bad-id', mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates transaction', async () => {
      service.update.mockResolvedValue({ ...mockTransaction, status: TransactionStatus.COMPLETED } as any);

      const result = await controller.update('txn-uuid-1', { status: TransactionStatus.COMPLETED }, mockReq);

      expect(service.update).toHaveBeenCalledWith('txn-uuid-1', companyId, { status: TransactionStatus.COMPLETED });
    });
  });

  describe('getDepositReminders', () => {
    it('returns deposit reminders grouped by due date', async () => {
      const reminders = {
        overdue: [mockTransaction],
        dueToday: [],
        dueThisWeek: [],
        dueThisMonth: [],
      };
      service.getDepositReminders.mockResolvedValue(reminders as any);

      const result = await controller.getDepositReminders(mockReq);

      expect(service.getDepositReminders).toHaveBeenCalledWith(companyId);
      expect(result).toEqual(reminders);
    });
  });
});
