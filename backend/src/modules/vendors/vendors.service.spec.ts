import { BadRequestException } from '@nestjs/common';
import { Role } from '@shared/enums/roles.enum';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { Vendor, VendorSpecialty } from './entities/vendor.entity';
import { Company } from '../companies/entities/company.entity';

describe('VendorsService', () => {
  let service: VendorsService;
  let repo: jest.Mocked<Repository<Vendor>>;
  let companyRepo: jest.Mocked<Repository<Company>>;

  const companyId = 'company-uuid-1';

  const mockVendor: Partial<Vendor> = {
    id: 'vendor-uuid-1',
    companyId,
    name: 'Al Futtaim Maintenance',
    email: 'info@alfuttaim.ae',
    phone: '+971501234567',
    specialties: [VendorSpecialty.HVAC],
    companyName: 'Al Futtaim Group',
    address: 'Dubai Festival City',
    rating: 4.5,
    hourlyRate: 150,
    currency: 'AED',
    isActive: true,
    notes: 'Preferred HVAC vendor',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        {
          provide: getRepositoryToken(Vendor),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
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

    service = module.get<VendorsService>(VendorsService);
    repo = module.get(getRepositoryToken(Vendor));
    companyRepo = module.get(getRepositoryToken(Company));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a vendor', async () => {
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      const dto = {
        name: 'Al Futtaim Maintenance',
        email: 'info@alfuttaim.ae',
        phone: '+971501234567',
        specialties: [VendorSpecialty.HVAC],
      };

      repo.create.mockReturnValue(mockVendor as Vendor);
      repo.save.mockResolvedValue(mockVendor as Vendor);

      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        regionCode: 'dubai',
      });
      expect(repo.save).toHaveBeenCalledWith(mockVendor);
      expect(result).toEqual(mockVendor);
    });

    it('rejects a body regionCode outside the caller assignments', async () => {
      const dto = {
        name: 'Al Futtaim Maintenance',
        specialties: [VendorSpecialty.HVAC],
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
      const dto = {
        name: 'Al Futtaim Maintenance',
        specialties: [VendorSpecialty.HVAC],
        regionCode: 'makkah',
      };
      repo.create.mockReturnValue(mockVendor as Vendor);
      repo.save.mockResolvedValue(mockVendor as Vendor);

      await service.create(companyId, dto as any, {
        role: Role.MANAGER,
        regionCodes: ['makkah'],
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ regionCode: 'makkah' }),
      );
    });

    it('checks an admin against the company active regions, not assignments', async () => {
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
        activeRegions: ['dubai'],
      } as Company);
      const dto = {
        name: 'Al Futtaim Maintenance',
        specialties: [VendorSpecialty.HVAC],
        regionCode: 'punjab',
      };

      await expect(
        service.create(companyId, dto as any, {
          role: Role.COMPANY_ADMIN,
          regionCodes: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns paginated vendors sorted by createdAt DESC', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: [{ companyId, isActive: true }],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('returns paginated vendors with search filter', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      const result = await service.findAll(companyId, 1, 20, 'Futtaim');

      const callArgs = repo.findAndCount.mock.calls[0]![0]!;
      expect((callArgs as any).where).toHaveLength(4);
      expect((callArgs as any).where[0]).toHaveProperty('name');
      expect((callArgs as any).where[1]).toHaveProperty('email');
      expect((callArgs as any).where[2]).toHaveProperty('phone');
      expect((callArgs as any).where[3]).toHaveProperty('companyName');
      expect(result.total).toBe(1);
    });

    it('returns vendors filtered by specialty (jsonb containment)', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        VendorSpecialty.HVAC,
      );

      const callArgs = repo.findAndCount.mock.calls[0]![0]!;
      expect((callArgs as any).where).toHaveLength(1);
      expect((callArgs as any).where[0].companyId).toBe(companyId);
      // specialties filter is a Raw FindOperator (jsonb @>), not a plain value
      expect((callArgs as any).where[0].specialties).toBeDefined();
      expect((callArgs as any).where[0].specialties.type).toBe('raw');
      expect(result.total).toBe(1);
    });

    it('returns vendors filtered by both search and specialty', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      await service.findAll(companyId, 1, 20, 'Futtaim', VendorSpecialty.HVAC);

      const callArgs = repo.findAndCount.mock.calls[0]![0]!;
      expect((callArgs as any).where).toHaveLength(4);
      expect((callArgs as any).where[0]).toHaveProperty('specialties');
      expect((callArgs as any).where[0].specialties.type).toBe('raw');
      expect((callArgs as any).where[0]).toHaveProperty('name');
    });

    it('calculates correct skip for page 2', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(companyId, 2, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns vendor when found', async () => {
      repo.findOne.mockResolvedValue(mockVendor as Vendor);

      const result = await service.findOne('vendor-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'vendor-uuid-1', companyId },
      });
      expect(result).toEqual(mockVendor);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('vendor-uuid-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the vendor', async () => {
      const updated = { ...mockVendor, name: 'Updated Vendor' } as Vendor;
      repo.findOne.mockResolvedValue({ ...mockVendor } as Vendor);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('vendor-uuid-1', companyId, {
        name: 'Updated Vendor',
      });

      expect(result.name).toBe('Updated Vendor');
    });

    it('throws NotFoundException when vendor does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', companyId, { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft deletes by setting isActive to false', async () => {
      const activeVendor = { ...mockVendor, isActive: true } as Vendor;
      repo.findOne.mockResolvedValue(activeVendor);
      repo.save.mockImplementation(async (v) => v as Vendor);

      await service.remove('vendor-uuid-1', companyId);

      expect(activeVendor.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(activeVendor);
    });

    it('throws NotFoundException when vendor does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };

    // Stands in for Postgres: the seeded row is only returned when the where
    // clause the service built actually admits its region.
    function seedVendorInRegion(regionCode: string) {
      const row = { ...mockVendor, regionCode } as Vendor;
      repo.findOne.mockImplementation((opts: any) => {
        const filter = opts?.where?.regionCode;
        if (filter && !(filter.value as string[]).includes(regionCode)) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });
      repo.save.mockImplementation(async (v) => v as Vendor);
      return row;
    }

    it('denies findOne on a vendor outside the caller assigned regions', async () => {
      seedVendorInRegion('punjab');

      await expect(
        service.findOne('vendor-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a by-id read in any region the caller is assigned to', async () => {
      seedVendorInRegion('punjab');

      const result = await service.findOne(
        'vendor-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('vendor-uuid-1');
    });

    it('denies update on a vendor outside the caller assigned regions', async () => {
      seedVendorInRegion('punjab');

      await expect(
        service.update(
          'vendor-uuid-1',
          companyId,
          { name: 'Renamed' },
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('denies remove on a vendor outside the caller assigned regions', async () => {
      const row = seedVendorInRegion('punjab');

      await expect(
        service.remove('vendor-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(row.isActive).toBe(true);
    });

    it('denies every by-id read when the caller has no assigned region', async () => {
      seedVendorInRegion('makkah');

      await expect(
        service.findOne('vendor-uuid-1', companyId, {
          role: 'manager',
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('leaves admins unconfined by their own assignments', async () => {
      seedVendorInRegion('punjab');

      const result = await service.findOne('vendor-uuid-1', companyId, admin);

      expect(result.id).toBe('vendor-uuid-1');
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedVendorInRegion('punjab');

      const result = await service.findOne('vendor-uuid-1', companyId);

      expect(result.id).toBe('vendor-uuid-1');
    });

    // Stands in for Postgres on the list read: the seeded rows survive only
    // when the where clause the service built admits their region.
    function seedVendorsInRegions(regionCodes: string[]) {
      const rows = regionCodes.map(
        (regionCode) =>
          ({ ...mockVendor, id: `vendor-${regionCode}`, regionCode }) as Vendor,
      );
      repo.findAndCount.mockImplementation((opts: any) => {
        const codes = opts?.where?.[0]?.regionCode?.value as
          | string[]
          | undefined;
        const matched = codes
          ? rows.filter((row) => codes.includes(row.regionCode))
          : rows;
        return Promise.resolve([matched, matched.length]);
      });
      return rows;
    }

    it('confines the list to the caller assigned regions', async () => {
      seedVendorsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data.map((v) => v.regionCode)).toEqual(['makkah']);
      expect(result.total).toBe(1);
    });

    it('lists no vendors from a region outside the caller assignments', async () => {
      seedVendorsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        'punjab',
        makkahManager,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('narrows the list to a requested region the caller is assigned to', async () => {
      seedVendorsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        'punjab',
        twoRegionManager,
      );

      expect(result.data.map((v) => v.regionCode)).toEqual(['punjab']);
    });

    it('leaves the list unfiltered for admins', async () => {
      seedVendorsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        admin,
      );

      expect(result.data.map((v) => v.regionCode)).toEqual([
        'makkah',
        'punjab',
      ]);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedVendorsInRegions(['makkah', 'punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        { role: 'manager', regionCodes: [] },
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });
  });
});
