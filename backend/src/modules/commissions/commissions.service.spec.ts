import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import {
  Commission,
  CommissionStatus,
  CommissionType,
} from './entities/commission.entity';
import { Company } from '../companies/entities/company.entity';

describe('CommissionsService', () => {
  let service: CommissionsService;
  let repo: jest.Mocked<Repository<Commission>>;
  let companyRepo: jest.Mocked<Repository<Company>>;

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
            update: jest.fn(),
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
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
    repo = module.get(getRepositoryToken(Commission));
    companyRepo = module.get(getRepositoryToken(Company));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates commission and auto-calculates amount', async () => {
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
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
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      repo.create.mockReturnValue({
        ...mockCommission,
        commissionAmount: 5000,
      } as Commission);
      repo.save.mockResolvedValue({
        ...mockCommission,
        commissionAmount: 5000,
      } as Commission);

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

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('persists only the changed columns (no whole-entity save)', async () => {
      // findOne is called twice: once for existence, once to return the fresh row.
      repo.findOne
        .mockResolvedValueOnce({ ...mockCommission } as Commission)
        .mockResolvedValueOnce({
          ...mockCommission,
          status: CommissionStatus.APPROVED,
        } as Commission);
      repo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.update('commission-uuid-1', companyId, {
        status: CommissionStatus.APPROVED,
      });

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'commission-uuid-1', companyId },
        { status: CommissionStatus.APPROVED },
      );
      // Whole-entity save must not be used (that is the lost-update bug).
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.status).toBe(CommissionStatus.APPROVED);
    });

    it('sets paidAt when status changed to PAID and not already paid', async () => {
      repo.findOne
        .mockResolvedValueOnce({
          ...mockCommission,
          paidAt: null,
        } as Commission)
        .mockResolvedValueOnce({
          ...mockCommission,
          status: CommissionStatus.PAID,
        } as Commission);
      repo.update.mockResolvedValue({ affected: 1 } as any);

      await service.update('commission-uuid-1', companyId, {
        status: CommissionStatus.PAID,
      });

      const patch = repo.update.mock.calls[0][1];
      expect(patch.status).toBe(CommissionStatus.PAID);
      expect(patch.paidAt).toBeInstanceOf(Date);
    });

    it('does not overwrite an existing paidAt', async () => {
      const alreadyPaidAt = new Date('2026-01-01T00:00:00Z');
      repo.findOne
        .mockResolvedValueOnce({
          ...mockCommission,
          status: CommissionStatus.PAID,
          paidAt: alreadyPaidAt,
        } as Commission)
        .mockResolvedValueOnce({
          ...mockCommission,
          status: CommissionStatus.PAID,
          paidAt: alreadyPaidAt,
        } as Commission);
      repo.update.mockResolvedValue({ affected: 1 } as any);

      await service.update('commission-uuid-1', companyId, {
        status: CommissionStatus.PAID,
      });

      const patch = repo.update.mock.calls[0][1];
      expect(patch.paidAt).toBeUndefined();
    });

    it('does not call update when the DTO changes nothing', async () => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockCommission } as Commission)
        .mockResolvedValueOnce({ ...mockCommission } as Commission);

      await service.update('commission-uuid-1', companyId, {});

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when commission not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', companyId, {
          status: CommissionStatus.APPROVED,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('approves a PENDING commission via a guarded conditional UPDATE', async () => {
      repo.update.mockResolvedValue({ affected: 1 } as any);
      repo.findOne.mockResolvedValue({
        ...mockCommission,
        status: CommissionStatus.APPROVED,
      } as Commission);

      const result = await service.approve('commission-uuid-1', companyId);

      expect(repo.update).toHaveBeenCalledWith(
        {
          id: 'commission-uuid-1',
          companyId,
          status: CommissionStatus.PENDING,
        },
        { status: CommissionStatus.APPROVED },
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.status).toBe(CommissionStatus.APPROVED);
    });

    it('throws ConflictException when commission exists but is not PENDING', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as any);
      // assertExists finds the row -> it exists, so the conflict is the state guard.
      repo.findOne.mockResolvedValue({
        ...mockCommission,
        status: CommissionStatus.APPROVED,
      } as Commission);

      await expect(
        service.approve('commission-uuid-1', companyId),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when commission not found', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as any);
      repo.findOne.mockResolvedValue(null);

      await expect(service.approve('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('pay', () => {
    it('marks an APPROVED commission as PAID via a guarded conditional UPDATE', async () => {
      repo.update.mockResolvedValue({ affected: 1 } as any);
      repo.findOne.mockResolvedValue({
        ...mockCommission,
        status: CommissionStatus.PAID,
        paidAt: new Date(),
      } as Commission);

      const result = await service.pay('commission-uuid-1', companyId);

      expect(repo.update).toHaveBeenCalledWith(
        {
          id: 'commission-uuid-1',
          companyId,
          status: CommissionStatus.APPROVED,
        },
        expect.objectContaining({
          status: CommissionStatus.PAID,
          paidAt: expect.any(Date),
        }),
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.status).toBe(CommissionStatus.PAID);
      expect(result.paidAt).toBeInstanceOf(Date);
    });

    it('throws ConflictException when commission exists but is not APPROVED', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as any);
      repo.findOne.mockResolvedValue({
        ...mockCommission,
        status: CommissionStatus.PENDING,
      } as Commission);

      await expect(service.pay('commission-uuid-1', companyId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when commission is already PAID', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as any);
      repo.findOne.mockResolvedValue({
        ...mockCommission,
        status: CommissionStatus.PAID,
      } as Commission);

      await expect(service.pay('commission-uuid-1', companyId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when commission not found', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as any);
      repo.findOne.mockResolvedValue(null);

      await expect(service.pay('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSummary', () => {
    it('aggregates commission stats for agent via SQL', async () => {
      // Service aggregates in SQL (SUM/COUNT), returning a single raw row.
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalEarned: '18000',
          totalPaid: '10000',
          totalPending: '8000',
          count: '3',
        }),
      };
      repo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getSummary(agentId, companyId);

      expect(qb.where).toHaveBeenCalledWith('c.agentId = :agentId', {
        agentId,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('c.companyId = :companyId', {
        companyId,
      });
      expect(result.totalEarned).toBe(18000);
      expect(result.totalPaid).toBe(10000);
      expect(result.totalPending).toBe(8000);
      expect(result.count).toBe(3);
    });
  });
});
