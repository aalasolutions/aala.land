import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let service: jest.Mocked<CompaniesService>;

  const mockCompany = {
    id: 'company-uuid-1',
    name: 'Test Company',
    slug: 'test-company',
    isActive: true,
    activeRegions: ['dubai'],
    defaultRegionCode: 'dubai',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const paginated = { data: [mockCompany], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        {
          provide: CompaniesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CompaniesController>(CompaniesController);
    service = module.get(CompaniesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a company', async () => {
      service.create.mockResolvedValue(mockCompany as any);

      const result = await controller.create({ name: 'Test Company', slug: 'test-company' });

      expect(service.create).toHaveBeenCalledWith({ name: 'Test Company', slug: 'test-company' });
      expect(result).toEqual(mockCompany);
    });
  });

  describe('findAll', () => {
    it('returns paginated list of companies', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(1, 20);

      expect(service.findAll).toHaveBeenCalledWith(1, 20);
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('returns a company by id', async () => {
      service.findOne.mockResolvedValue(mockCompany as any);

      const result = await controller.findOne('company-uuid-1');

      expect(service.findOne).toHaveBeenCalledWith('company-uuid-1');
      expect(result).toEqual(mockCompany);
    });

    it('propagates NotFoundException when company not found', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates a company', async () => {
      service.update.mockResolvedValue({ ...mockCompany, name: 'Updated' } as any);

      const result = await controller.update('company-uuid-1', { name: 'Updated' });

      expect(service.update).toHaveBeenCalledWith('company-uuid-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('getRegions', () => {
    it('returns the MENA_REGIONS array', () => {
      const result = controller.getRegions();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      const dubai = result.find((r: any) => r.code === 'dubai');
      expect(dubai).toBeDefined();
      expect(dubai.currency).toBe('AED');
      expect(dubai.country).toBe('AE');
    });
  });
});
