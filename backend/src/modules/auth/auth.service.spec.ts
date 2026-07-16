import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

jest.mock('bcryptjs');
jest.mock('crypto');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let companiesService: jest.Mocked<CompaniesService>;

  const mockUser = {
    id: 'user-uuid-1',
    name: 'Test Admin',
    email: 'admin@test.com',
    password: 'hashed-password',
    role: 'admin',
    companyId: 'company-uuid-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCompany = {
    id: 'company-uuid-1',
    name: 'Test Company',
    slug: 'test-company',
    isActive: true,
    activeRegions: ['dubai', 'abu-dhabi'],
    defaultRegionCode: 'dubai',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findByResetToken: jest.fn(),
            updateResetToken: jest.fn(),
            updatePassword: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: CompaniesService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockCompany),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    companiesService = module.get(CompaniesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateToken', () => {
    it('signs and returns a token', () => {
      const payload = {
        sub: 'user-123',
        email: 'user@test.com',
        companyId: 'company-uuid-1',
        role: 'user',
      };

      service.generateToken(payload);

      expect(jwtService.sign).toHaveBeenCalledWith(payload, undefined);
    });
  });

  describe('validateUser', () => {
    it('returns user data without password when credentials are valid', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('admin@test.com', 'correct-password');

      expect(result).not.toHaveProperty('password');
      expect(result!.email).toBe('admin@test.com');
    });

    it('returns null when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser('notfound@test.com', 'password');

      expect(result).toBeNull();
    });

    it('returns null when password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('admin@test.com', 'wrong-password');

      expect(result).toBeNull();
    });

    it('returns null when user is inactive', async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false } as any);
      (bcrypt.compare as jest.Mock).mockClear();

      const result = await service.validateUser('admin@test.com', 'correct-password');

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns accessToken, user info, regions, and defaultRegionCode', async () => {
      const result = await service.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
        companyId: mockUser.companyId,
        role: mockUser.role,
      });
      expect(companiesService.findOne).toHaveBeenCalledWith(mockUser.companyId);
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user).not.toHaveProperty('password');
      expect(result.defaultRegionCode).toBe('dubai');
      expect(result.regions).toHaveLength(2);
      expect(result.regions[0].code).toBe('dubai');
      expect(result.regions[0].currency).toBe('AED');
      expect(result.regions[1].code).toBe('abu-dhabi');
    });
  });

  describe('refresh', () => {
    it('returns new accessToken using user from JWT payload', async () => {
      const jwtPayload = {
        userId: 'user-uuid-1',
        email: 'admin@test.com',
        companyId: 'company-uuid-1',
        role: 'admin',
      };

      const result = await service.refresh(jwtPayload);

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: jwtPayload.email,
        sub: jwtPayload.userId,
        companyId: jwtPayload.companyId,
        role: jwtPayload.role,
      });
      expect(result.accessToken).toBe('mock-jwt-token');
    });
  });

  describe('forgotPassword', () => {
    const fakeToken = 'a'.repeat(64);

    beforeEach(() => {
      (crypto.randomBytes as jest.Mock).mockReturnValue({ toString: () => fakeToken });
    });

    it('generates token and saves it when email exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      const result = await service.forgotPassword('admin@test.com');

      expect(usersService.findByEmail).toHaveBeenCalledWith('admin@test.com');
      expect(usersService.updateResetToken).toHaveBeenCalledWith(
        mockUser.id,
        fakeToken,
        expect.any(Date),
      );
      expect(result.message).toContain('If the email exists');
    });

    it('returns success even when email does not exist (no leak)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('unknown@test.com');

      expect(usersService.updateResetToken).not.toHaveBeenCalled();
      expect(result.message).toContain('If the email exists');
    });

    it('sets token expiry to approximately 1 hour from now', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      await service.forgotPassword('admin@test.com');

      const savedExpiry = (usersService.updateResetToken as jest.Mock).mock.calls[0][2] as Date;
      const diffMs = savedExpiry.getTime() - Date.now();
      // Should be roughly 1 hour (3600000ms), allow 5 second tolerance
      expect(diffMs).toBeGreaterThan(3595000);
      expect(diffMs).toBeLessThanOrEqual(3600000);
    });
  });

  describe('resetPassword', () => {
    const validToken = 'valid-reset-token';
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);

    it('resets password when token is valid and not expired', async () => {
      usersService.findByResetToken.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@test.com',
        resetPasswordToken: validToken,
        resetPasswordExpires: futureDate,
      } as any);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      const result = await service.resetPassword(validToken, 'NewPass123!');

      expect(usersService.findByResetToken).toHaveBeenCalledWith(validToken);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 12);
      expect(usersService.updatePassword).toHaveBeenCalledWith('user-uuid-1', 'new-hashed-password');
      expect(usersService.updateResetToken).toHaveBeenCalledWith('user-uuid-1', null, null);
      expect(result.message).toContain('reset successfully');
    });

    it('throws BadRequestException when token not found', async () => {
      usersService.findByResetToken.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewPass123!'))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token is expired', async () => {
      usersService.findByResetToken.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@test.com',
        resetPasswordToken: validToken,
        resetPasswordExpires: pastDate,
      } as any);

      await expect(service.resetPassword(validToken, 'NewPass123!'))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when resetPasswordExpires is null', async () => {
      usersService.findByResetToken.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@test.com',
        resetPasswordToken: validToken,
        resetPasswordExpires: null,
      } as any);

      await expect(service.resetPassword(validToken, 'NewPass123!'))
        .rejects.toThrow(BadRequestException);
    });

    it('clears token fields after successful reset', async () => {
      usersService.findByResetToken.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@test.com',
        resetPasswordToken: validToken,
        resetPasswordExpires: futureDate,
      } as any);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      await service.resetPassword(validToken, 'NewPass123!');

      expect(usersService.updateResetToken).toHaveBeenCalledWith('user-uuid-1', null, null);
    });
  });

  describe('impersonateLogin', () => {
    it('returns full login-shape response with impersonatedBy in token', async () => {
      const impersonateUser = {
        email: 'agent@company.com',
        sub: 'agent-uuid-1',
        name: 'Jane Agent',
        companyId: 'company-uuid-1',
        role: 'agent',
      };

      companiesService.findOne.mockResolvedValue(mockCompany as any);
      jwtService.sign.mockReturnValue('impersonate-jwt-token');

      const result = await service.impersonateLogin(impersonateUser, 'admin-uuid-1');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'agent@company.com',
          sub: 'agent-uuid-1',
          companyId: 'company-uuid-1',
          role: 'agent',
          impersonatedBy: 'admin-uuid-1',
        }),
      );
      expect(result.user).toEqual({
        id: 'agent-uuid-1',
        name: 'Jane Agent',
        email: 'agent@company.com',
        role: 'agent',
        companyId: 'company-uuid-1',
      });
      expect(result.accessToken).toBe('impersonate-jwt-token');
      expect(result.refreshToken).toBe('impersonate-jwt-token');
      expect(result.defaultRegionCode).toBe('dubai');
      expect(result.regions).toBeDefined();
    });

    it('returns empty regions when user has no companyId', async () => {
      const impersonateUser = {
        email: 'super@admin.com',
        sub: 'super-uuid-1',
        name: 'Super Admin',
        companyId: null,
        role: 'super_admin',
      };

      const result = await service.impersonateLogin(impersonateUser, 'admin-uuid-1');

      expect(companiesService.findOne).not.toHaveBeenCalled();
      expect(result.regions).toEqual([]);
      expect(result.defaultRegionCode).toBe('');
    });
  });

  describe('getBootstrap', () => {
    it('returns fresh user, regions, defaultRegionCode, and subscriptionTier', async () => {
      usersService.findOne.mockResolvedValue(mockUser as any);
      companiesService.findOne.mockResolvedValue({ ...mockCompany, subscriptionTier: 'PRO' } as any);

      const result = await service.getBootstrap('user-uuid-1', 'company-uuid-1');

      expect(usersService.findOne).toHaveBeenCalledWith('user-uuid-1', 'company-uuid-1');
      expect(result.user).toEqual({
        id: 'user-uuid-1',
        name: 'Test Admin',
        email: 'admin@test.com',
        role: 'admin',
        companyId: 'company-uuid-1',
      });
      expect(result.regions).toBeDefined();
      expect(result.defaultRegionCode).toBe('dubai');
      expect(result.subscriptionTier).toBe('PRO');
    });

    it('returns empty regions and null subscriptionTier for a super admin with no companyId', async () => {
      usersService.findOne.mockResolvedValue({ ...mockUser, companyId: null } as any);

      const result = await service.getBootstrap('super-uuid-1', null);

      expect(usersService.findOne).toHaveBeenCalledWith('super-uuid-1', undefined);
      expect(companiesService.findOne).not.toHaveBeenCalled();
      expect(result.regions).toEqual([]);
      expect(result.defaultRegionCode).toBe('');
      expect(result.subscriptionTier).toBeNull();
    });
  });
});
