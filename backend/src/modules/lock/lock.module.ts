import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Company } from '@modules/companies/entities/company.entity';
import { CustomDeal } from '@modules/console/entities/custom-deal.entity';
import { LockLift } from '@modules/console/entities/lock-lift.entity';
import { ManualPayment } from '@modules/console/entities/manual-payment.entity';
import { LockStateService } from './lock-state.service';
import { WriteLockInterceptor } from './write-lock.interceptor';

/**
 * Deliberately import-light (entities only) so AuthModule and ConsoleModule
 * can both depend on it without cycles. The write-lock interceptor is global;
 * it no-ops for reads, super admins, and companies without a deal.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Company, CustomDeal, LockLift, ManualPayment]),
  ],
  providers: [
    LockStateService,
    { provide: APP_INTERCEPTOR, useClass: WriteLockInterceptor },
  ],
  exports: [LockStateService],
})
export class LockModule {}
