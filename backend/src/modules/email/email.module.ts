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

/**
 * System (account + billing) email. Provides the branded sender and the
 * preference center, and registers the billing-email listener on the shared
 * billing dispatcher. Imports BillingModule for the dispatcher; BillingModule
 * must never import this one (would be circular).
 */
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
