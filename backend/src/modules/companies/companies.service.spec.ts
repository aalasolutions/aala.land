import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let repo: jest.Mocked<Repository<Company>>;

  const mockCompany: Company = {
    id: 'company-uuid-1',
    name: 'Test Company',
    slug: 'test-company',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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

      const result = await service.create({ name: 'Test Company', slug: 'test-company' });

      expect(repo.create).toHaveBeenCalledWith({ name: 'Test Company', slug: 'test-company' });
      expect(repo.save).toHaveBeenCalledWith(mockCompany);
      expect(result).toEqual(mockCompany);
    });
  });

  describe('findAll', () => {
    it('returns paginated companies', async () => {
      repo.findAndCount.mockResolvedValue([[mockCompany], 1]);

      const result = await service.findAll(1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockCompany]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns company when found', async () => {
      repo.findOne.mockResolvedValue(mockCompany);

      const result = await service.findOne('company-uuid-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'company-uuid-1' } });
      expect(result).toEqual(mockCompany);
    });

    it('throws NotFoundException when company not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns a company', async () => {
      repo.findOne.mockResolvedValue(mockCompany);
      repo.save.mockResolvedValue({ ...mockCompany, name: 'Updated Name' });

      const result = await service.update('company-uuid-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('throws NotFoundException when company not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('returns company when found by slug', async () => {
      repo.findOne.mockResolvedValue(mockCompany);

      const result = await service.findBySlug('test-company');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { slug: 'test-company' } });
      expect(result).toEqual(mockCompany);
    });

    it('throws NotFoundException when slug not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('bad-slug')).rejects.toThrow(NotFoundException);
    });
  });
});
