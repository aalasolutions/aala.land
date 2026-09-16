import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { MailService } from '../../shared/services/mail.service';
import { BillingModule } from '../billing/billing.module';
import { SystemEmailService } from './system-email.service';
import { EmailPreferencesService } from './email-preferences.service';
import { EmailPreferencesController } from './email-preferences.controller';
import { BillingEmailListener } from './billing-email.listener';
import { UpcomingInvoiceCron } from './upcoming-invoice.cron';

// Imports BillingModule for the shared dispatcher; BillingModule must never import this back.
@Module({
  imports: [TypeOrmModule.forFeature([User, Company]), BillingModule],
  controllers: [EmailPreferencesController],
  providers: [
    MailService,
    SystemEmailService,
    EmailPreferencesService,
    BillingEmailListener,
    UpcomingInvoiceCron,
  ],
  exports: [SystemEmailService, EmailPreferencesService],
})
export class EmailModule {}
