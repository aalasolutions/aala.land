import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { LeasesService } from './leases.service';
import { Lease, LeaseStatus, LeaseType } from './entities/lease.entity';

describe('LeasesService', () => {
  let service: LeasesService;
  let repo: jest.Mocked<Repository<Lease>>;

  const companyId = 'company-uuid-1';

  const mockLease: Partial<Lease> = {
    id: 'lease-uuid-1',
    companyId,
    unitId: 'unit-uuid-1',
    tenantName: 'Ahmed Al-Rashid',
    tenantEmail: 'ahmed@example.com',
    type: LeaseType.RESIDENTIAL,
    status: LeaseStatus.ACTIVE,
    monthlyRent: 5000,
    currency: 'AED',
    numberOfCheques: 4,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeasesService,
        {
          provide: getRepositoryToken(Lease),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LeasesService>(LeasesService);
    repo = module.get(getRepositoryToken(Lease));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a lease', async () => {
      repo.create.mockReturnValue(mockLease as Lease);
      repo.save.mockResolvedValue(mockLease as Lease);

      const dto = {
        unitId: 'unit-uuid-1',
        tenantName: 'Ahmed Al-Rashid',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 5000,
      };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockLease);
    });
  });

  describe('findAll', () => {
    it('returns paginated leases', async () => {
      repo.findAndCount.mockResolvedValue([[mockLease as Lease], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.total).toBe(1);
      expect(result.data).toEqual([mockLease]);
    });
  });

  describe('findOne', () => {
    it('returns lease when found', async () => {
      repo.findOne.mockResolvedValue(mockLease as Lease);

      const result = await service.findOne('lease-uuid-1', companyId);
      expect(result).toEqual(mockLease);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('lease-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUnit', () => {
    it('returns leases for unit', async () => {
      repo.find.mockResolvedValue([mockLease as Lease]);

      const result = await service.findByUnit('unit-uuid-1', companyId);

      expect(repo.find).toHaveBeenCalledWith({
        where: { unitId: 'unit-uuid-1', companyId },
        order: { startDate: 'DESC' },
      });
      expect(result).toEqual([mockLease]);
    });
  });

  describe('update', () => {
    it('updates lease fields', async () => {
      const updated = { ...mockLease, status: LeaseStatus.EXPIRED } as Lease;
      repo.findOne.mockResolvedValue({ ...mockLease } as Lease);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('lease-uuid-1', companyId, { status: LeaseStatus.EXPIRED });

      expect(result.status).toBe(LeaseStatus.EXPIRED);
    });
  });

  describe('remove', () => {
    it('removes lease', async () => {
      repo.findOne.mockResolvedValue(mockLease as Lease);
      repo.remove.mockResolvedValue(mockLease as Lease);

      await service.remove('lease-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockLease);
    });
  });
});
