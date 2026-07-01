import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGoogleService } from './auth-google.service';
import { AuthService } from './auth.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { Role } from '@shared/enums/roles.enum';

describe('AuthGoogleService', () => {
  let service: AuthGoogleService;
  let usersService: jest.Mocked<Pick<
    UsersService,
    'findByGoogleId' | 'findByEmailOrGoogleId' | 'findByIdForAuth' | 'linkGoogleAccount'
  >>;
  let authService: jest.Mocked<Pick<AuthService, 'login'>>;
  let companiesService: jest.Mocked<Pick<CompaniesService, 'createGoogleCompanyAdmin'>>;
  let verifyIdToken: jest.Mock;

  const payload = {
    sub: 'google-123',
    email: 'owner@example.com',
    email_verified: true,
    name: 'Owner User',
  };

  const user = {
    id: 'user-1',
    name: 'Owner User',
    email: 'owner@example.com',
    password: null,
    role: Role.COMPANY_ADMIN,
    companyId: 'company-1',
    googleId: 'google-123',
    isActive: true,
  };

  beforeEach(() => {
    usersService = {
      findByGoogleId: jest.fn(),
      findByEmailOrGoogleId: jest.fn(),
      findByIdForAuth: jest.fn(),
      linkGoogleAccount: jest.fn(),
    };
    authService = {
      login: jest.fn().mockResolvedValue({ accessToken: 'token' }),
    };
    companiesService = {
      createGoogleCompanyAdmin: jest.fn(),
    };

    service = new AuthGoogleService(
      { getOrThrow: jest.fn().mockReturnValue('google-client-id') } as unknown as ConfigService,
      usersService as unknown as UsersService,
      authService as unknown as AuthService,
      companiesService as unknown as CompaniesService,
    );

    verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: jest.fn().mockReturnValue(payload),
    });
    (service as unknown as { googleClient: { verifyIdToken: jest.Mock } }).googleClient = {
      verifyIdToken,
    };
  });

  it('rejects Google login when no linked account exists', async () => {
    usersService.findByGoogleId.mockResolvedValue(null);

    await expect(service.googleLogin('id-token')).rejects.toThrow(UnauthorizedException);
    expect(usersService.findByGoogleId).toHaveBeenCalledWith('google-123');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('rejects Google login for an inactive user', async () => {
    usersService.findByGoogleId.mockResolvedValue({ ...user, isActive: false } as any);

    await expect(service.googleLogin('id-token')).rejects.toThrow('Account is deactivated');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('propagates signup slug conflicts from company creation', async () => {
    usersService.findByEmailOrGoogleId.mockResolvedValue(null);
    companiesService.createGoogleCompanyAdmin.mockRejectedValue(
      new ConflictException('This company name is already taken. Please choose a different one.'),
    );

    await expect(
      service.googleSignup('id-token', 'Acme Real Estate', 'dubai'),
    ).rejects.toThrow(ConflictException);
    expect(companiesService.createGoogleCompanyAdmin).toHaveBeenCalledWith({
      companyName: 'Acme Real Estate',
      slug: 'acme-real-estate',
      regionCode: 'dubai',
      googleId: 'google-123',
      email: 'owner@example.com',
      name: 'Owner User',
    });
  });

  it('rejects linking when Google email does not match the user email', async () => {
    usersService.findByIdForAuth.mockResolvedValue({
      ...user,
      email: 'different@example.com',
      googleId: null,
    } as any);

    await expect(service.linkGoogleAccount('user-1', 'id-token')).rejects.toThrow(
      BadRequestException,
    );
    expect(usersService.linkGoogleAccount).not.toHaveBeenCalled();
  });

  it('rejects linking when another user already owns the Google account', async () => {
    usersService.findByIdForAuth.mockResolvedValue({ ...user, googleId: null } as any);
    usersService.findByGoogleId.mockResolvedValue({ ...user, id: 'other-user' } as any);

    await expect(service.linkGoogleAccount('user-1', 'id-token')).rejects.toThrow(
      ConflictException,
    );
    expect(usersService.linkGoogleAccount).not.toHaveBeenCalled();
  });

  it('preserves the email-not-verified domain error', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: jest.fn().mockReturnValue({ ...payload, email_verified: false }),
    });

    await expect(service.googleLogin('id-token')).rejects.toThrow(BadRequestException);
    expect(usersService.findByGoogleId).not.toHaveBeenCalled();
  });

  it('does not expose raw Google verifier errors to clients', async () => {
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience mismatch'));

    await expect(service.googleLogin('id-token')).rejects.toMatchObject({
      message: 'Invalid Google token',
    });
  });
});
