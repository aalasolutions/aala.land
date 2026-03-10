import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ChequesService } from './cheques.service';
import { Cheque, ChequeStatus, ChequeType } from './entities/cheque.entity';

describe('ChequesService', () => {
  let service: ChequesService;
  let repo: jest.Mocked<Repository<Cheque>>;

  const companyId = 'company-uuid-1';

  const mockCheque: Partial<Cheque> = {
    id: 'cheque-uuid-1',
    companyId,
    leaseId: 'lease-uuid-1',
    chequeNumber: 'CHQ001',
    bankName: 'Emirates NBD',
    accountHolder: 'Ahmed Al-Rashid',
    amount: 15000,
    currency: 'AED',
    dueDate: new Date('2026-03-01'),
    status: ChequeStatus.PENDING,
    type: ChequeType.RENT,
    ocrProcessed: false,
    ocrData: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChequesService,
        {
          provide: getRepositoryToken(Cheque),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChequesService>(ChequesService);
    repo = module.get(getRepositoryToken(Cheque));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a cheque', async () => {
      repo.create.mockReturnValue(mockCheque as Cheque);
      repo.save.mockResolvedValue(mockCheque as Cheque);

      const dto = {
        chequeNumber: 'CHQ001',
        bankName: 'Emirates NBD',
        accountHolder: 'Ahmed',
        amount: 15000,
        dueDate: '2026-03-01',
      };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockCheque);
    });
  });

  describe('findAll', () => {
    it('returns paginated cheques sorted by due date', async () => {
      repo.findAndCount.mockResolvedValue([[mockCheque as Cheque], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { dueDate: 'ASC' },
      });
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns cheque when found', async () => {
      repo.findOne.mockResolvedValue(mockCheque as Cheque);

      const result = await service.findOne('cheque-uuid-1', companyId);
      expect(result).toEqual(mockCheque);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('cheque-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates cheque status to DEPOSITED', async () => {
      const updated = { ...mockCheque, status: ChequeStatus.DEPOSITED } as Cheque;
      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('cheque-uuid-1', companyId, { status: ChequeStatus.DEPOSITED });

      expect(result.status).toBe(ChequeStatus.DEPOSITED);
    });
  });

  describe('processOcr', () => {
    it('processes OCR when API key not configured returns stub data', async () => {
      const originalEnv = process.env;
      delete process.env.OCR_API_KEY;

      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      repo.save.mockImplementation(async (c) => c as Cheque);

      const result = await service.processOcr('cheque-uuid-1', companyId, 'https://example.com/cheque.jpg');

      expect(result.ocrImageUrl).toBe('https://example.com/cheque.jpg');
      expect(result.ocrProcessed).toBe(true);
      expect(result.ocrData).toEqual({ raw: null, confidence: 0, provider: 'none' });

      process.env = originalEnv;
    });

    it('marks ocrProcessed false when OCR API throws', async () => {
      process.env.OCR_API_KEY = 'test-key';

      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      repo.save.mockImplementation(async (c) => c as Cheque);

      jest.spyOn(service as any, 'runOcrExtraction').mockRejectedValue(new Error('OCR error'));

      const result = await service.processOcr('cheque-uuid-1', companyId, 'https://example.com/cheque.jpg');

      expect(result.ocrProcessed).toBe(false);

      delete process.env.OCR_API_KEY;
    });
  });

  describe('remove', () => {
    it('removes cheque', async () => {
      repo.findOne.mockResolvedValue(mockCheque as Cheque);
      repo.remove.mockResolvedValue(mockCheque as Cheque);

      await service.remove('cheque-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockCheque);
    });
  });
});
