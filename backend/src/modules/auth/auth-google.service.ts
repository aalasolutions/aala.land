import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { User, AuthProvider } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { CompaniesService } from '../companies/companies.service';
import { Role } from '@shared/enums/roles.enum';
import { Company } from '../companies/entities/company.entity';

@Injectable()
export class AuthGoogleService {
  private readonly logger = new Logger(AuthGoogleService.name);
  private googleClient: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly authService: AuthService,
    private readonly companiesService: CompaniesService,
    private readonly dataSource: DataSource,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async googleLogin(idToken: string) {
    const { googleId } = await this.verifyGoogleToken(idToken);

    const user = await this.userRepo.findOne({ where: { googleId } });

    if (!user) {
      throw new UnauthorizedException(
        'No linked account found for this Google account. Please sign in with email and link Gmail from your profile.',
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

    const existingUser = await this.userRepo.findOne({
      where: [{ googleId }, { email }],
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName || !regionCode) {
      throw new BadRequestException('Company name and region are required');
    }

    const slug = trimmedCompanyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) {
      throw new BadRequestException('Company name must contain letters or numbers');
    }

    const existingSlug = await this.companiesService
      .findBySlug(slug)
      .catch(() => null);
    if (existingSlug) {
      throw new ConflictException(
        'This company name is already taken. Please choose a different one.',
      );
    }

    const loginUser = await this.dataSource.transaction(async (manager) => {
      const companyRepo = manager.getRepository(Company);
      const userRepo = manager.getRepository(User);

      const company = companyRepo.create({
        name: trimmedCompanyName,
        slug,
        defaultRegionCode: regionCode,
        activeRegions: [regionCode],
      });
      const savedCompany = await companyRepo.save(company);

      const user = userRepo.create({
        googleId,
        email,
        name,
        authProvider: AuthProvider.GOOGLE,
        password: null,
        role: Role.COMPANY_ADMIN,
        companyId: savedCompany.id,
      });
      const savedUser = await userRepo.save(user);

      return {
        id: savedUser.id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        companyId: savedCompany.id,
      };
    });

    return this.authService.login(loginUser);
  }

  async linkGoogleAccount(userId: string, idToken: string) {
    const { googleId, email } = await this.verifyGoogleToken(idToken);

    const user = await this.userRepo.findOne({ where: { id: userId } });
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

    const existingGoogleUser = await this.userRepo.findOne({
      where: { googleId },
    });

    if (existingGoogleUser && existingGoogleUser.id !== user.id) {
      throw new ConflictException(
        'This Google account is already linked to another user',
      );
    }

    user.googleId = googleId;
    user.authProvider = AuthProvider.GOOGLE;
    await this.userRepo.save(user);

    return {
      message: 'Google account linked successfully',
      googleLinked: true,
    };
  }

  private async verifyGoogleToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
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
      this.logger.warn(
        `Google token verification failed: ${(error as Error)?.message || 'Unknown error'}`,
      );
      throw new UnauthorizedException(
        `Invalid Google token: ${(error as Error)?.message || 'Unknown error'}`,
      );
    }
  }

}
