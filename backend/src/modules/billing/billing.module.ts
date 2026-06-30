import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { Company } from '../companies/entities/company.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Company])],
    controllers: [BillingController],
    providers: [
        BillingService,
        {
            provide: 'STRIPE',
            useFactory: (config: ConfigService) => {
                const Stripe = require('stripe');
                return new Stripe(config.get<string>('STRIPE_SECRET_KEY')!);
            },
            inject: [ConfigService],
        },
    ],
})
export class BillingModule {}
