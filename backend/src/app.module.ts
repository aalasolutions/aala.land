import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppDataSource } from './data-source';
import { CompaniesModule } from '@modules/companies/companies.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { PropertiesModule } from '@modules/properties/properties.module';
import { FinancialModule } from '@modules/financial/financial.module';
import { LeadsModule } from '@modules/leads/leads.module';
import { WhatsappModule } from '@modules/whatsapp/whatsapp.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { LeasesModule } from '@modules/leases/leases.module';
import { MaintenanceModule } from '@modules/maintenance/maintenance.module';
import { ChequesModule } from '@modules/cheques/cheques.module';
import { CommissionsModule } from '@modules/commissions/commissions.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { AuditModule } from '@modules/audit/audit.module';
import { EmailTemplatesModule } from '@modules/email-templates/email-templates.module';
import { ContactsModule } from '@modules/contacts/contacts.module';
import { VendorsModule } from '@modules/vendors/vendors.module';
import { ReminderRulesModule } from '@modules/reminder-rules/reminder-rules.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { LocationsModule } from '@modules/locations/locations.module';
import { SearchModule } from '@modules/search/search.module';
import { BillingModule } from '@modules/billing/billing.module';
import { LockModule } from '@modules/lock/lock.module';
import { ConsoleModule } from '@modules/console/console.module';
import { EmailModule } from '@modules/email/email.module';
import { RedisModule } from '@modules/redis/redis.module';
import { getRedisConnection } from '@modules/redis/redis.config';
import { RegionScopeInterceptor } from '@shared/interceptors/region-scope.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      useFactory: () => AppDataSource.options,
    }),

    BullModule.forRootAsync({
      useFactory: () => ({ connection: getRedisConnection() }),
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    ScheduleModule.forRoot(),

    CompaniesModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    FinancialModule,
    LeadsModule,
    WhatsappModule,
    NotificationsModule,
    LeasesModule,
    MaintenanceModule,
    ChequesModule,
    CommissionsModule,
    ReportsModule,
    AuditModule,
    EmailTemplatesModule,
    ContactsModule,
    VendorsModule,
    ReminderRulesModule,
    DocumentsModule,
    LocationsModule,
    SearchModule,
    BillingModule,
    LockModule,
    ConsoleModule,
    EmailModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Runs after JwtAuthGuard, so req.user is populated.
    { provide: APP_INTERCEPTOR, useClass: RegionScopeInterceptor },
  ],
})
export class AppModule {}
