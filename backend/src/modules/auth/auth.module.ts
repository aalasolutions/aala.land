import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGoogleService } from './auth-google.service';
import { UsersModule } from '../users/users.module';
import { CompaniesModule } from '../companies/companies.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { ImpersonateService } from './impersonate.service';
import { LockModule } from '@modules/lock/lock.module';
import { EmailModule } from '@modules/email/email.module';
import { envString } from '@shared/utils/env.util';

@Module({
  imports: [
    UsersModule,
    CompaniesModule,
    LockModule,
    EmailModule,
    TypeOrmModule.forFeature([User, Company]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: envString(
            'JWT_EXPIRES_IN',
            '24h',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ImpersonateService, AuthGoogleService],
  exports: [AuthService],
})
export class AuthModule {}
