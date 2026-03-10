import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Role } from '@shared/enums/roles.enum';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs');

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;

  const companyId = 'company-uuid-1';

  const mockUser: User = {
    id: 'user-uuid-1',
    name: 'Test Agent',
    email: 'agent@test.com',
    password: 'hashed-password',
    role: Role.AGENT,
    companyId,
    phone: null,
    preferredLanguage: 'en',
    dateFormat: 'DD/MM/YYYY',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    lastLoginAt: null,
    isActive: true,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    company: null as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(getRepositoryToken(User));

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a user with hashed password', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      const dto = { name: 'Test Agent', email: 'agent@test.com', password: 'pass123', companyId };
      const result = await service.create(dto as any, companyId);

      expect(bcrypt.hash).toHaveBeenCalledWith('pass123', 10);
      expect(result).toEqual(mockUser);
    });

    it('throws ConflictException when email already exists', async () => {
      repo.findOne.mockResolvedValue(mockUser);

      const dto = { name: 'Test', email: 'agent@test.com', password: 'pass123', companyId };
      await expect(service.create(dto as any, companyId)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns paginated users for company', async () => {
      repo.findAndCount.mockResolvedValue([[mockUser], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockUser]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns user when found within company', async () => {
      repo.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne('user-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'user-uuid-1', companyId } });
      expect(result).toEqual(mockUser);
    });

    it('throws NotFoundException when user not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user belongs to different company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates user fields', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      repo.save.mockResolvedValue({ ...mockUser, name: 'Updated Name' });

      const result = await service.update('user-uuid-1', companyId, { name: 'Updated Name' } as any);

      expect(result.name).toBe('Updated Name');
    });

    it('hashes new password if provided', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      await service.update('user-uuid-1', companyId, { password: 'new-password' } as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 10);
    });
  });

  describe('remove', () => {
    it('removes user', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      repo.remove.mockResolvedValue(mockUser);

      await service.remove('user-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockUser);
    });

    it('throws NotFoundException when user not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });
});
