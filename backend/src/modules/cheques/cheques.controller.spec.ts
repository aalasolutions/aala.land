import { Test, TestingModule } from '@nestjs/testing';
import { ChequesController } from './cheques.controller';
import { ChequesService } from './cheques.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChequeStatus, ChequeType } from './entities/cheque.entity';

describe('ChequesController', () => {
  let controller: ChequesController;
  let service: jest.Mocked<ChequesService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockCheque = {
    id: 'cheque-uuid-1',
    companyId,
    chequeNumber: 'CHQ001',
    bankName: 'Emirates NBD',
    amount: 15000,
    status: ChequeStatus.PENDING,
    type: ChequeType.RENT,
  };

  const paginated = { data: [mockCheque], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChequesController],
      providers: [
        {
          provide: ChequesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            bounce: jest.fn(),
            getCollectionSchedule: jest.fn(),
            processOcr: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChequesController>(ChequesController);
    service = module.get(ChequesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates cheque scoped to company', async () => {
      service.create.mockResolvedValue(mockCheque as any);

      const dto = { chequeNumber: 'CHQ001', bankName: 'Emirates NBD', accountHolder: 'Ahmed', amount: 15000, dueDate: '2026-03-01' };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
    });
  });

  describe('findAll', () => {
    it('returns paginated cheques', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20);
    });
  });

  describe('findOne', () => {
    it('returns cheque by id', async () => {
      service.findOne.mockResolvedValue(mockCheque as any);

      await controller.findOne('cheque-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('cheque-uuid-1', companyId);
    });
  });

  describe('update', () => {
    it('updates cheque', async () => {
      service.update.mockResolvedValue({ ...mockCheque, status: ChequeStatus.DEPOSITED } as any);

      await controller.update('cheque-uuid-1', { status: ChequeStatus.DEPOSITED }, mockReq);

      expect(service.update).toHaveBeenCalledWith('cheque-uuid-1', companyId, { status: ChequeStatus.DEPOSITED });
    });
  });

  describe('bounce', () => {
    it('records a cheque bounce', async () => {
      const bounced = { ...mockCheque, status: ChequeStatus.BOUNCED, bounceCount: 1 };
      service.bounce.mockResolvedValue(bounced as any);

      const dto = { bounceReason: 'Insufficient funds' };
      await controller.bounce('cheque-uuid-1', dto, mockReq);

      expect(service.bounce).toHaveBeenCalledWith('cheque-uuid-1', companyId, dto);
    });
  });

  describe('getCollectionSchedule', () => {
    it('returns cheque collection schedule', async () => {
      const schedule = {
        overdue: [mockCheque],
        thisWeek: [],
        nextWeek: [],
        thisMonth: [],
      };
      service.getCollectionSchedule.mockResolvedValue(schedule as any);

      const result = await controller.getCollectionSchedule(mockReq);

      expect(service.getCollectionSchedule).toHaveBeenCalledWith(companyId);
      expect(result).toEqual(schedule);
    });
  });

  describe('processOcr', () => {
    it('triggers OCR processing', async () => {
      service.processOcr.mockResolvedValue({ ...mockCheque, ocrProcessed: true } as any);

      await controller.processOcr('cheque-uuid-1', 'https://example.com/cheque.jpg', mockReq);

      expect(service.processOcr).toHaveBeenCalledWith('cheque-uuid-1', companyId, 'https://example.com/cheque.jpg');
    });
  });

  describe('remove', () => {
    it('removes cheque', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('cheque-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('cheque-uuid-1', companyId);
    });
  });
});
