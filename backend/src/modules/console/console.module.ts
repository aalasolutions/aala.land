import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '@modules/companies/entities/company.entity';
import { User } from '@modules/users/entities/user.entity';
import { BillingPrice } from '@modules/billing/entities/billing-price.entity';
import { BillingHistory } from '@modules/billing/entities/billing-history.entity';
import { WhatsappSettings } from '@modules/whatsapp/entities/whatsapp-settings.entity';
import { BillingModule } from '@modules/billing/billing.module';
import { AuditModule } from '@modules/audit/audit.module';
import { WhatsappModule } from '@modules/whatsapp/whatsapp.module';
import { PropertiesModule } from '@modules/properties/properties.module';
import { LockModule } from '@modules/lock/lock.module';
import { CustomDeal } from './entities/custom-deal.entity';
import { LockLift } from './entities/lock-lift.entity';
import { ManualPayment } from './entities/manual-payment.entity';
import { PaymentRemedy } from './entities/payment-remedy.entity';
import { ConsoleService } from './console.service';
import { ConsoleController } from './console.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      User,
      CustomDeal,
      LockLift,
      ManualPayment,
      PaymentRemedy,
      BillingPrice,
      BillingHistory,
      WhatsappSettings,
    ]),
    LockModule,
    BillingModule,
    AuditModule,
    WhatsappModule,
    PropertiesModule,
  ],
  controllers: [ConsoleController],
  providers: [ConsoleService],
})
export class ConsoleModule {}
