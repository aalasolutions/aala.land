import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Company } from '@modules/companies/entities/company.entity';
import { CustomDeal } from '@modules/console/entities/custom-deal.entity';
import { LockLift } from '@modules/console/entities/lock-lift.entity';
import { ManualPayment } from '@modules/console/entities/manual-payment.entity';
import { LockStateService } from './lock-state.service';
import { WriteLockInterceptor } from './write-lock.interceptor';

// Import-light (entities only) so AuthModule and ConsoleModule can depend on it without cycles.
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
