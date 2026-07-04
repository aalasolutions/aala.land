import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { BillingPrice } from './entities/billing-price.entity';
import { StripeEvent } from './entities/stripe-event.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingEventDispatcher } from './events/billing-event-dispatcher';
import { StripeBillingProvider } from './provider/stripe-billing.provider';
import { BILLING_PROVIDER } from './provider/billing-provider.interface';

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([Company, User, BillingPrice, StripeEvent])],
    controllers: [BillingController, BillingWebhookController],
    providers: [
        BillingService,
        BillingWebhookService,
        BillingEventDispatcher,
        { provide: BILLING_PROVIDER, useClass: StripeBillingProvider },
    ],
    exports: [BillingService, BillingEventDispatcher],
})
export class BillingModule {}
