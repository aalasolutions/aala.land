import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ImpersonateService } from './impersonate.service';
import { AuthGoogleService } from './auth-google.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let impersonateService: jest.Mocked<ImpersonateService>;
  let googleService: jest.Mocked<AuthGoogleService>;

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
    regions: [
      { code: 'dubai', name: 'Dubai', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
    ],
    defaultRegionCode: 'dubai',
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
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            impersonateLogin: jest.fn(),
            getBootstrap: jest.fn(),
          },
        },
        {
          provide: ImpersonateService,
          useValue: {
            impersonate: jest.fn(),
          },
        },
        {
          provide: AuthGoogleService,
          useValue: {
            googleLogin: jest.fn(),
            googleSignup: jest.fn(),
            linkGoogleAccount: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    impersonateService = module.get(ImpersonateService);
    googleService = module.get(AuthGoogleService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('returns tokens when credentials are valid', async () => {
      authService.validateUser.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        companyId: 'company-uuid-1',
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
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

  describe('googleLogin', () => {
    it('delegates Google login to AuthGoogleService', async () => {
      googleService.googleLogin.mockResolvedValue(mockLoginResponse as any);

      const result = await controller.googleLogin({ idToken: 'google-id-token' });

      expect(googleService.googleLogin).toHaveBeenCalledWith('google-id-token');
      expect(result).toEqual(mockLoginResponse);
    });
  });

  describe('googleSignup', () => {
    it('delegates Google signup with company name and region', async () => {
      googleService.googleSignup.mockResolvedValue(mockLoginResponse as any);

      const result = await controller.googleSignup({
        idToken: 'google-id-token',
        companyName: 'Acme Real Estate',
        regionCode: 'dubai',
      });

      expect(googleService.googleSignup).toHaveBeenCalledWith(
        'google-id-token',
        'Acme Real Estate',
        'dubai',
      );
      expect(result).toEqual(mockLoginResponse);
    });
  });

  describe('linkGoogleAccount', () => {
    it('delegates Google account linking for the current user', async () => {
      googleService.linkGoogleAccount.mockResolvedValue({
        message: 'Google account linked successfully',
        googleLinked: true,
      });

      const req = { user: { userId: 'user-uuid-1', email: 'admin@test.com', companyId: 'c1', role: 'admin' } };
      const result = await controller.linkGoogleAccount(req as any, { idToken: 'google-id-token' });

      expect(googleService.linkGoogleAccount).toHaveBeenCalledWith('user-uuid-1', 'google-id-token');
      expect(result.googleLinked).toBe(true);
    });
  });

  describe('logout', () => {
    it('returns success message', async () => {
      const result = await controller.logout();
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('getProfile', () => {
    it('returns a fresh bootstrap bundle for the current user', async () => {
      const bootstrap = {
        user: { id: 'user-uuid-1', name: 'Test Admin', email: 'admin@test.com', role: 'admin', companyId: 'company-uuid-1' },
        regions: mockLoginResponse.regions,
        defaultRegionCode: 'dubai',
        subscriptionTier: 'FREE',
      };
      authService.getBootstrap.mockResolvedValue(bootstrap as any);

      const req = { user: { userId: 'user-uuid-1', email: 'admin@test.com', companyId: 'company-uuid-1', role: 'admin' } };
      const result = await controller.getProfile(req as any);

      expect(authService.getBootstrap).toHaveBeenCalledWith('user-uuid-1', 'company-uuid-1');
      expect(result.user.email).toBe('admin@test.com');
      expect(result.subscriptionTier).toBe('FREE');
    });
  });

  describe('forgotPassword', () => {
    it('calls authService.forgotPassword and returns message', async () => {
      const response = { message: 'If the email exists, a password reset link has been sent.' };
      authService.forgotPassword.mockResolvedValue(response);

      const result = await controller.forgotPassword({ email: 'admin@test.com' });

      expect(authService.forgotPassword).toHaveBeenCalledWith('admin@test.com');
      expect(result.message).toContain('If the email exists');
    });

    it('returns success message even for non-existent email', async () => {
      const response = { message: 'If the email exists, a password reset link has been sent.' };
      authService.forgotPassword.mockResolvedValue(response);

      const result = await controller.forgotPassword({ email: 'unknown@test.com' });

      expect(result.message).toContain('If the email exists');
    });
  });

  describe('resetPassword', () => {
    it('calls authService.resetPassword and returns success', async () => {
      const response = { message: 'Password has been reset successfully.' };
      authService.resetPassword.mockResolvedValue(response);

      const result = await controller.resetPassword({ token: 'valid-token', newPassword: 'NewPass123!' });

      expect(authService.resetPassword).toHaveBeenCalledWith('valid-token', 'NewPass123!');
      expect(result.message).toContain('reset successfully');
    });

    it('propagates BadRequestException from service', async () => {
      authService.resetPassword.mockRejectedValue(new BadRequestException('Invalid or expired reset token'));

      await expect(
        controller.resetPassword({ token: 'bad-token', newPassword: 'NewPass123!' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('impersonate', () => {
    it('returns full login response when SUPER_ADMIN impersonates a user', async () => {
      const mockImpersonateUser = {
        email: 'agent@company.com',
        sub: 'agent-uuid-1',
        name: 'Jane Agent',
        companyId: 'company-uuid-1',
        role: 'agent',
      };

      const mockImpersonateResponse = {
        ...mockLoginResponse,
        user: {
          id: 'agent-uuid-1',
          name: 'Jane Agent',
          email: 'agent@company.com',
          role: 'agent',
          companyId: 'company-uuid-1',
        },
      };

      impersonateService.impersonate.mockResolvedValue(mockImpersonateUser as any);
      (authService as any).impersonateLogin.mockResolvedValue(mockImpersonateResponse);

      const req = { user: { userId: 'super-admin-uuid', email: 'super@admin.com', companyId: null, role: 'super_admin' } };
      const result = await controller.impersonate(req as any, { userId: 'agent-uuid-1' });

      expect(impersonateService.impersonate).toHaveBeenCalledWith('agent-uuid-1');
      expect((authService as any).impersonateLogin).toHaveBeenCalledWith(mockImpersonateUser, 'super-admin-uuid');
      expect(result).toEqual(mockImpersonateResponse);
    });
  });
});
