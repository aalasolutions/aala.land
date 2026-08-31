import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@shared/enums/roles.enum';
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

    it('rejects a body regionCode outside the caller assignments', async () => {
      const dto = {
        agentId,
        type: CommissionType.SALE,
        grossAmount: 500000,
        commissionRate: 2,
        regionCode: 'punjab',
      };

      await expect(
        service.create(companyId, dto as any, {
          role: Role.MANAGER,
          regionCodes: ['makkah'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts a body regionCode the caller is assigned to', async () => {
      repo.create.mockReturnValue(mockCommission as Commission);
      repo.save.mockResolvedValue(mockCommission as Commission);
      const dto = {
        agentId,
        type: CommissionType.SALE,
        grossAmount: 500000,
        commissionRate: 2,
        regionCode: 'makkah',
      };

      await service.create(companyId, dto as any, {
        role: Role.MANAGER,
        regionCodes: ['makkah'],
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ regionCode: 'makkah' }),
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
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };

    // Stands in for Postgres: reads and conditional updates only touch the
    // seeded row when the where clause the service built admits its region.
    function seedCommissionInRegion(
      regionCode: string,
      status = CommissionStatus.PENDING,
    ) {
      const row = { ...mockCommission, regionCode, status } as Commission;
      const admits = (where: any) => {
        const filter = where?.regionCode;
        return !filter || (filter.value as string[]).includes(regionCode);
      };
      repo.findOne.mockImplementation((opts: any) =>
        Promise.resolve(admits(opts?.where) ? row : null),
      );
      repo.update.mockImplementation((criteria: any) =>
        Promise.resolve({
          affected: admits(criteria) && criteria.status === row.status ? 1 : 0,
        } as any),
      );
      return row;
    }

    it('denies findOne on a commission outside the caller assigned regions', async () => {
      seedCommissionInRegion('punjab');

      await expect(
        service.findOne('commission-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a by-id read in any region the caller is assigned to', async () => {
      seedCommissionInRegion('punjab');

      const result = await service.findOne(
        'commission-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('commission-uuid-1');
    });

    it('denies update on a commission outside the caller assigned regions', async () => {
      seedCommissionInRegion('punjab');

      await expect(
        service.update(
          'commission-uuid-1',
          companyId,
          { status: CommissionStatus.APPROVED },
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('denies approve on a commission outside the caller assigned regions', async () => {
      const row = seedCommissionInRegion('punjab');

      await expect(
        service.approve('commission-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
      expect(row.status).toBe(CommissionStatus.PENDING);
    });

    it('approves a commission inside the caller assigned regions', async () => {
      seedCommissionInRegion('punjab');

      const result = await service.approve(
        'commission-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('commission-uuid-1');
    });

    it('denies pay on a commission outside the caller assigned regions', async () => {
      seedCommissionInRegion('punjab', CommissionStatus.APPROVED);

      await expect(
        service.pay('commission-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('denies every by-id read when the caller has no assigned region', async () => {
      seedCommissionInRegion('makkah');

      await expect(
        service.findOne('commission-uuid-1', companyId, {
          role: 'manager',
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('leaves admins unconfined by their own assignments', async () => {
      seedCommissionInRegion('punjab');

      const result = await service.findOne(
        'commission-uuid-1',
        companyId,
        admin,
      );

      expect(result.id).toBe('commission-uuid-1');
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedCommissionInRegion('punjab');

      const result = await service.findOne('commission-uuid-1', companyId);

      expect(result.id).toBe('commission-uuid-1');
    });

    // Stands in for Postgres on list reads: the seeded rows survive only when
    // the where clause the service built admits their region.
    function seedCommissionsInRegions(regionCodes: string[]) {
      const rows = regionCodes.map(
        (regionCode) =>
          ({
            ...mockCommission,
            id: `commission-${regionCode}`,
            regionCode,
          }) as Commission,
      );
      repo.findAndCount.mockImplementation((opts: any) => {
        const codes = opts?.where?.regionCode?.value as string[] | undefined;
        const matched = codes
          ? rows.filter((row) => codes.includes(row.regionCode))
          : rows;
        return Promise.resolve([matched, matched.length]);
      });
      return rows;
    }

    // Stands in for Postgres on the aggregate: the fake only totals the seeded
    // rows the region predicate admits.
    function seedSummaryRows(rows: { regionCode: string; amount: number }[]) {
      let codes: string[] | undefined;
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockImplementation((_sql: string, params?: any) => {
          if (params?.regionCodes) {
            codes = params.regionCodes as string[];
          }
          return qb;
        }),
        getRawOne: jest.fn().mockImplementation(() => {
          const matched = codes
            ? rows.filter((row) => codes!.includes(row.regionCode))
            : rows;
          return Promise.resolve({
            totalEarned: String(
              matched.reduce((sum, row) => sum + row.amount, 0),
            ),
            totalPaid: '0',
            totalPending: '0',
            count: String(matched.length),
          });
        }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('confines the list to the caller assigned regions', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data.map((c) => c.regionCode)).toEqual(['makkah']);
      expect(result.total).toBe(1);
    });

    it('lists no commissions from a region outside the caller assignments', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        'punjab',
        makkahManager,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('narrows the list to a requested region the caller is assigned to', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        'punjab',
        twoRegionManager,
      );

      expect(result.data.map((c) => c.regionCode)).toEqual(['punjab']);
    });

    it('leaves the list unfiltered for admins', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        admin,
      );

      expect(result.data.map((c) => c.regionCode)).toEqual([
        'makkah',
        'punjab',
      ]);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(companyId, 1, 20, undefined, undefined, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result.data).toEqual([]);
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });

    it('confines findByAgent to the caller assigned regions', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findByAgent(
        agentId,
        companyId,
        1,
        20,
        makkahManager,
      );

      expect(result.data.map((c) => c.regionCode)).toEqual(['makkah']);
      expect(result.total).toBe(1);
    });

    it('returns every region on findByAgent for admins', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findByAgent(
        agentId,
        companyId,
        1,
        20,
        admin,
      );

      expect(result.data.map((c) => c.regionCode)).toEqual([
        'makkah',
        'punjab',
      ]);
    });

    it('returns no agent commissions when the caller has no assigned region', async () => {
      seedCommissionsInRegions(['makkah', 'punjab']);

      const result = await service.findByAgent(agentId, companyId, 1, 20, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result.data).toEqual([]);
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });

    it('totals only the commissions in the caller assigned regions', async () => {
      seedSummaryRows([
        { regionCode: 'makkah', amount: 1000 },
        { regionCode: 'punjab', amount: 2000 },
      ]);

      const result = await service.getSummary(
        agentId,
        companyId,
        makkahManager,
      );

      expect(result.totalEarned).toBe(1000);
      expect(result.count).toBe(1);
    });

    it('totals every region for admins', async () => {
      seedSummaryRows([
        { regionCode: 'makkah', amount: 1000 },
        { regionCode: 'punjab', amount: 2000 },
      ]);

      const result = await service.getSummary(agentId, companyId, admin);

      expect(result.totalEarned).toBe(3000);
      expect(result.count).toBe(2);
    });

    it('totals nothing when the caller has no assigned region', async () => {
      seedSummaryRows([
        { regionCode: 'makkah', amount: 1000 },
        { regionCode: 'punjab', amount: 2000 },
      ]);

      const result = await service.getSummary(agentId, companyId, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result).toEqual({
        totalEarned: 0,
        totalPaid: 0,
        totalPending: 0,
        count: 0,
      });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
