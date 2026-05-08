import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';
import { Role } from '@shared/enums/roles.enum';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let repo: jest.Mocked<Repository<Company>>;

  const mockCompany: Company = {
    id: 'company-uuid-1',
    name: 'Test Company',
    slug: 'test-company',
    isActive: true,
    activeRegions: ['dubai'],
    defaultRegionCode: 'dubai',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Company;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: getRepositoryToken(Company),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    repo = module.get(getRepositoryToken(Company));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a company', async () => {
      repo.create.mockReturnValue(mockCompany);
      repo.save.mockResolvedValue(mockCompany);

      const result = await service.create({ name: 'Test Company', slug: 'test-company', defaultRegionCode: 'dubai' });

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(mockCompany);
      expect(result).toEqual(mockCompany);
    });
  });

  describe('findAll', () => {
    it('returns paginated companies', async () => {
      repo.findAndCount.mockResolvedValue([[mockCompany], 1]);

      const result = await service.findAll(1, 20);

      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns company when found', async () => {
      repo.findOne.mockResolvedValue(mockCompany);

      const result = await service.findOne('company-uuid-1');

      expect(result).toEqual(mockCompany);
    });

    it('throws NotFoundException when company not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns a company', async () => {
      repo.findOne.mockResolvedValue(mockCompany);
      repo.save.mockResolvedValue({ ...mockCompany, name: 'Updated Name' });

      const result = await service.update('company-uuid-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('strips restricted fields for ADMIN role', async () => {
      const dto: any = {
        name: 'Updated Company',
        activeRegions: ['dubai'],
        subscriptionTier: 'premium',
        maxUsers: 100,
      };

      repo.findOne.mockResolvedValue(mockCompany);
      repo.save.mockResolvedValue(mockCompany);

      await service.update('company-uuid-1', dto, Role.ADMIN);

      const savedArg = repo.save.mock.calls[0][0];

      expect(savedArg.name).toBe('Updated Company');
      expect(savedArg.activeRegions).toBeUndefined();
      expect(savedArg.subscriptionTier).toBeUndefined();
      expect(savedArg.maxUsers).toBeUndefined();
    });

    it('allows restricted fields for COMPANY_ADMIN', async () => {
      const dto: any = {
        name: 'Updated Company',
        activeRegions: ['dubai'],
      };

      repo.findOne.mockResolvedValue(mockCompany);
      repo.save.mockResolvedValue(mockCompany);

      await service.update('company-uuid-1', dto, Role.COMPANY_ADMIN);

      const savedArg = repo.save.mock.calls[0][0];

      expect(savedArg.activeRegions).toBeDefined();
    });

    it('validates activeRegions', async () => {
      repo.findOne.mockResolvedValue(mockCompany);

      await expect(
        service.update('company-uuid-1', { activeRegions: ['invalid'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findBySlug', () => {
    it('returns company by slug', async () => {
      repo.findOne.mockResolvedValue(mockCompany);

      const result = await service.findBySlug('test-company');

      expect(result).toEqual(mockCompany);
    });

    it('throws when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('bad')).rejects.toThrow(NotFoundException);
    });
  });
});