import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Company } from '../companies/entities/company.entity';
import { BillingPrice } from './entities/billing-price.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeBillingProvider } from './provider/stripe-billing.provider';
import { BILLING_PROVIDER } from './provider/billing-provider.interface';

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([Company, BillingPrice])],
    controllers: [BillingController],
    providers: [
        BillingService,
        { provide: BILLING_PROVIDER, useClass: StripeBillingProvider },
    ],
    exports: [BillingService],
})
export class BillingModule {}
