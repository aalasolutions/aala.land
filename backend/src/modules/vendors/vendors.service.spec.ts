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
    specialty: VendorSpecialty.HVAC,
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
      companyRepo.findOne.mockResolvedValue({ defaultRegionCode: 'dubai' } as Company);
      const dto = {
        name: 'Al Futtaim Maintenance',
        email: 'info@alfuttaim.ae',
        phone: '+971501234567',
        specialty: VendorSpecialty.HVAC,
      };

      repo.create.mockReturnValue(mockVendor as Vendor);
      repo.save.mockResolvedValue(mockVendor as Vendor);

      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId, regionCode: 'dubai' });
      expect(repo.save).toHaveBeenCalledWith(mockVendor);
      expect(result).toEqual(mockVendor);
    });
  });

  describe('findAll', () => {
    it('returns paginated vendors sorted by createdAt DESC', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: [{ companyId }],
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

    it('returns vendors filtered by specialty', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      const result = await service.findAll(companyId, 1, 20, undefined, VendorSpecialty.HVAC);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: [{ companyId, specialty: VendorSpecialty.HVAC }],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.total).toBe(1);
    });

    it('returns vendors filtered by both search and specialty', async () => {
      repo.findAndCount.mockResolvedValue([[mockVendor as Vendor], 1]);

      await service.findAll(companyId, 1, 20, 'Futtaim', VendorSpecialty.HVAC);

      const callArgs = repo.findAndCount.mock.calls[0]![0]!;
      expect((callArgs as any).where).toHaveLength(4);
      expect((callArgs as any).where[0]).toHaveProperty('specialty');
      expect((callArgs as any).where[0].specialty).toBe(VendorSpecialty.HVAC);
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

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('vendor-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the vendor', async () => {
      const updated = { ...mockVendor, name: 'Updated Vendor' } as Vendor;
      repo.findOne.mockResolvedValue({ ...mockVendor } as Vendor);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('vendor-uuid-1', companyId, { name: 'Updated Vendor' });

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

      await expect(service.remove('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });
});
