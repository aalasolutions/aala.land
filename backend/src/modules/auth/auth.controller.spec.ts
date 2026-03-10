import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockLoginResponse = {
    accessToken: 'mock-jwt-token',
    refreshToken: 'mock-refresh-token',
    user: {
      id: 'user-uuid-1',
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'admin',
      companyId: 'company-uuid-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('returns tokens when credentials are valid', async () => {
      authService.validateUser.mockResolvedValue({ id: 'user-uuid-1', email: 'admin@test.com' });
      authService.login.mockResolvedValue(mockLoginResponse as any);

      const result = await controller.login({ email: 'admin@test.com', password: 'pass' });

      expect(result).toEqual(mockLoginResponse);
    });

    it('throws UnauthorizedException when credentials are invalid', async () => {
      authService.validateUser.mockResolvedValue(null);

      await expect(
        controller.login({ email: 'bad@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('returns new accessToken', async () => {
      authService.refresh.mockResolvedValue({ accessToken: 'new-token' } as any);

      const req = { user: { userId: 'user-uuid-1', email: 'admin@test.com', companyId: 'c1', role: 'admin' } };
      const result = await controller.refresh(req) as any;

      expect(result.accessToken).toBe('new-token');
    });
  });

  describe('logout', () => {
    it('returns success message', async () => {
      const result = await controller.logout();
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('getProfile', () => {
    it('returns user from request', () => {
      const req = { user: { userId: 'user-uuid-1', email: 'admin@test.com' } };
      const result = controller.getProfile(req);
      expect(result.email).toBe('admin@test.com');
    });
  });
});
