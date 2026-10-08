import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { BillingPrice } from './entities/billing-price.entity';
import { BillingEvent } from './entities/billing-event.entity';
import { BillingHistory } from './entities/billing-history.entity';
import { PaymentRemedy } from '../console/entities/payment-remedy.entity';
import { AuditModule } from '../audit/audit.module';
import { BillingService } from './billing.service';
import { BillingHistoryService } from './billing-history.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingEventDispatcher } from './events/billing-event-dispatcher';
import { BillingNotices } from './events/billing-notices';
import { BillingDowngradeService } from './billing-downgrade.service';
import { BillingDowngradeCron } from './billing-downgrade.cron';
import { StripeBillingProvider } from './provider/stripe-billing.provider';
import { PaddleBillingProvider } from './provider/paddle-billing.provider';
import {
  BILLING_PROVIDER,
  BillingProvider,
} from './provider/billing-provider.interface';

/** Builds only the selected adapter so the other provider's keys are never required. */
export function billingProviderFactory(config: ConfigService): BillingProvider {
  const selected =
    (config.get<string>('BILLING_PROVIDER') ?? '').trim().toLowerCase() ||
    'stripe';
  if (selected === 'stripe') return new StripeBillingProvider(config);
  if (selected === 'paddle') return new PaddleBillingProvider(config);
  throw new Error(
    `Unsupported BILLING_PROVIDER "${selected}". Use "stripe" or "paddle".`,
  );
}

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Company,
      User,
      BillingPrice,
      BillingEvent,
      BillingHistory,
      PaymentRemedy,
    ]),
    AuditModule,
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    BillingHistoryService,
    BillingWebhookService,
    BillingEventDispatcher,
    BillingNotices,
    BillingDowngradeService,
    BillingDowngradeCron,
    {
      provide: BILLING_PROVIDER,
      useFactory: billingProviderFactory,
      inject: [ConfigService],
    },
  ],
  exports: [BillingService, BillingEventDispatcher, BillingNotices],
})
export class BillingModule {}
