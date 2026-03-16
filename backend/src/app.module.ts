import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { OwnersModule } from '@modules/owners/owners.module';
import { AuditModule } from '@modules/audit/audit.module';
import { EmailTemplatesModule } from '@modules/email-templates/email-templates.module';
import { ContactsModule } from '@modules/contacts/contacts.module';
import { VendorsModule } from '@modules/vendors/vendors.module';
import { ReminderRulesModule } from '@modules/reminder-rules/reminder-rules.module';
import { DocumentsModule } from '@modules/documents/documents.module';

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
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6470', 10),
        },
      }),
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

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
    OwnersModule,
    AuditModule,
    EmailTemplatesModule,
    ContactsModule,
    VendorsModule,
    ReminderRulesModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
