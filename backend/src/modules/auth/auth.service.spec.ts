import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('returns user data without password when credentials are valid', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('admin@test.com', 'correct-password');

      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('admin@test.com');
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
  });

  describe('login', () => {
    it('returns accessToken and user info', async () => {
      const result = await service.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
        companyId: mockUser.companyId,
        role: mockUser.role,
      });
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user).not.toHaveProperty('password');
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
});
