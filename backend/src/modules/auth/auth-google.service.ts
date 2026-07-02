import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthGoogleService {
  private readonly logger = new Logger(AuthGoogleService.name);
  private googleClient: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly companiesService: CompaniesService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID') ?? '',
    );
  }

  async googleLogin(idToken: string) {
    const { googleId } = await this.verifyGoogleToken(idToken);

    const user = await this.usersService.findByGoogleId(googleId);

    if (!user) {
      throw new UnauthorizedException(
        'No linked account found for this Google account. Please sign in with email and link Google from your profile.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.companyId) {
      throw new UnauthorizedException(
        'No company is attached to this account. Please sign up first.',
      );
    }

    return this.authService.login(user);
  }

  async googleSignup(
    idToken: string,
    companyName: string,
    regionCode: string,
  ) {
    const { googleId, email, name } = await this.verifyGoogleToken(idToken);

    const existingUser = await this.usersService.findByEmailOrGoogleId(email, googleId);

    if (existingUser) {
      throw new ConflictException('An account with this email or Google account already exists');
    }

    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName || !regionCode) {
      throw new BadRequestException('Company name and region are required');
    }

    const slug = trimmedCompanyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100)
      .replace(/^-|-$/g, '');

    if (!slug) {
      throw new BadRequestException('Company name must contain letters or numbers');
    }

    const loginUser = await this.companiesService.createGoogleCompanyAdmin({
      companyName: trimmedCompanyName,
      slug,
      regionCode,
      googleId,
      email,
      name,
    });

    return this.authService.login(loginUser);
  }

  async linkGoogleAccount(userId: string, idToken: string) {
    const { googleId, email } = await this.verifyGoogleToken(idToken);

    const user = await this.usersService.findByIdForAuth(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.email.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException(
        'Google account email must match your profile email',
      );
    }

    if (user.googleId && user.googleId !== googleId) {
      throw new ConflictException(
        'A different Google account is already linked to this user',
      );
    }

    const existingGoogleUser = await this.usersService.findByGoogleId(googleId);

    if (existingGoogleUser && existingGoogleUser.id !== user.id) {
      throw new ConflictException(
        'This Google account is already linked to another user',
      );
    }

    await this.usersService.linkGoogleAccount(user.id, googleId);

    return {
      message: 'Google account linked successfully',
      googleLinked: true,
    };
  }

  private async verifyGoogleToken(idToken: string) {
    try {
      const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      if (!googleClientId) {
        throw new BadRequestException('Google Sign-In is not configured');
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();

      if (!payload?.email) {
        throw new BadRequestException('Invalid Google token - no email found');
      }

      if (payload.email_verified === false) {
        throw new BadRequestException('Google account email is not verified');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(
        `Google token verification failed: ${(error as Error)?.message ?? 'Unknown error'}`,
      );
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
