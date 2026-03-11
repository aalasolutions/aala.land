import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Lead } from '../leads/entities/lead.entity';
import { LeadActivity } from '../leads/entities/lead-activity.entity';
import { Transaction } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity, Transaction, Unit, Commission, Lease, Cheque, AuditLog])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
