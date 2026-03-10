import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { Commission, CommissionStatus, CommissionType } from './entities/commission.entity';

describe('CommissionsService', () => {
  let service: CommissionsService;
  let repo: jest.Mocked<Repository<Commission>>;

  const companyId = 'company-uuid-1';
  const agentId = 'agent-uuid-1';

  const mockCommission: Partial<Commission> = {
    id: 'commission-uuid-1',
    companyId,
    agentId,
    type: CommissionType.SALE,
    status: CommissionStatus.PENDING,
    grossAmount: 500000,
    commissionRate: 2,
    commissionAmount: 10000,
    currency: 'AED',
    paidAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        {
          provide: getRepositoryToken(Commission),
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

    service = module.get<CommissionsService>(CommissionsService);
    repo = module.get(getRepositoryToken(Commission));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates commission and auto-calculates amount', async () => {
      repo.create.mockReturnValue(mockCommission as Commission);
      repo.save.mockResolvedValue(mockCommission as Commission);

      const dto = {
        agentId,
        type: CommissionType.SALE,
        grossAmount: 500000,
        commissionRate: 2,
      };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          commissionAmount: 10000,
          companyId,
        }),
      );
    });

    it('calculates 2.5% of 200000 = 5000', async () => {
      repo.create.mockReturnValue({ ...mockCommission, commissionAmount: 5000 } as Commission);
      repo.save.mockResolvedValue({ ...mockCommission, commissionAmount: 5000 } as Commission);

      await service.create(companyId, {
        agentId,
        type: CommissionType.RENTAL,
        grossAmount: 200000,
        commissionRate: 2.5,
      } as any);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ commissionAmount: 5000 }),
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated commissions', async () => {
      repo.findAndCount.mockResolvedValue([[mockCommission as Commission], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByAgent', () => {
    it('returns paginated commissions for agent', async () => {
      repo.findAndCount.mockResolvedValue([[mockCommission as Commission], 1]);

      const result = await service.findByAgent(agentId, companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { agentId, companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns commission when found', async () => {
      repo.findOne.mockResolvedValue(mockCommission as Commission);

      const result = await service.findOne('commission-uuid-1', companyId);
      expect(result).toEqual(mockCommission);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates commission status to APPROVED', async () => {
      const updated = { ...mockCommission, status: CommissionStatus.APPROVED } as Commission;
      repo.findOne.mockResolvedValue({ ...mockCommission } as Commission);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('commission-uuid-1', companyId, { status: CommissionStatus.APPROVED });
      expect(result.status).toBe(CommissionStatus.APPROVED);
    });

    it('sets paidAt when status changed to PAID', async () => {
      const unpaid = { ...mockCommission, paidAt: null } as Commission;
      repo.findOne.mockResolvedValue(unpaid);
      repo.save.mockImplementation(async (c) => c as Commission);

      await service.update('commission-uuid-1', companyId, { status: CommissionStatus.PAID });

      expect(unpaid.paidAt).not.toBeNull();
    });
  });

  describe('getSummary', () => {
    it('aggregates commission stats for agent', async () => {
      const commissions: Partial<Commission>[] = [
        { ...mockCommission, status: CommissionStatus.PAID, commissionAmount: 10000 },
        { ...mockCommission, status: CommissionStatus.PENDING, commissionAmount: 5000 },
        { ...mockCommission, status: CommissionStatus.APPROVED, commissionAmount: 3000 },
      ];

      repo.find.mockResolvedValue(commissions as Commission[]);

      const result = await service.getSummary(agentId, companyId);

      expect(result.totalEarned).toBe(18000);
      expect(result.totalPaid).toBe(10000);
      expect(result.totalPending).toBe(8000);
      expect(result.count).toBe(3);
    });
  });
});
