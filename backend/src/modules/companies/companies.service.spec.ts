import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let repo: jest.Mocked<Repository<Company>>;
  let userRepo: jest.Mocked<Repository<User>>;

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
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    repo = module.get(getRepositoryToken(Company));
    userRepo = module.get(getRepositoryToken(User));
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
    it('returns paginated companies with usersCount', async () => {
      repo.findAndCount.mockResolvedValue([[mockCompany], 1]);

      const result = await service.findAll(1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ ...mockCompany, usersCount: 0 });
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

    it('throws ForbiddenException for restricted fields when ADMIN role', async () => {
      const dto: any = {
        name: 'Updated Company',
        activeRegions: ['dubai'],
        subscriptionTier: 'premium',
        maxUsers: 100,
      };

      repo.findOne.mockResolvedValue(mockCompany);

      await expect(service.update('company-uuid-1', dto, Role.ADMIN)).rejects.toThrow(ForbiddenException);
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
        service.update('company-uuid-1', { activeRegions: ['invalid'] }, Role.SUPER_ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOneWithAdminEmail', () => {
    it('returns company with admin email when admin exists', async () => {
      repo.findOne.mockResolvedValue(mockCompany);
      userRepo.findOne.mockResolvedValue({ email: 'admin@test.com' } as any);
      userRepo.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

      const result = await service.findOneWithAdminEmail('company-uuid-1');

      expect(result.adminEmail).toBe('admin@test.com');
      expect(result.id).toBe(mockCompany.id);
    });

    it('returns company with null email when no admin exists', async () => {
      repo.findOne.mockResolvedValue(mockCompany);
      userRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.findOneWithAdminEmail('company-uuid-1');

      expect(result.adminEmail).toBeNull();
    });

    it('throws NotFoundException when company not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOneWithAdminEmail('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should include usersCount in findOneWithAdminEmail response', async () => {
      const mockCompany = { id: 'c1', name: 'Test Co', subscriptionTier: 'FREE', maxUsers: 1 } as any;
      jest.spyOn(service, 'findOne').mockResolvedValue(mockCompany);
      userRepo.findOne.mockResolvedValue({ email: 'admin@test.com' } as any);
      userRepo.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);

      const result = await service.findOneWithAdminEmail('c1');

      expect(result.usersCount).toBe(3);
      expect(result.inactiveUsersCount).toBe(1);
      expect(userRepo.count).toHaveBeenCalledWith({ where: { companyId: 'c1', isActive: true } });
      expect(userRepo.count).toHaveBeenCalledWith({ where: { companyId: 'c1', isActive: false } });
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