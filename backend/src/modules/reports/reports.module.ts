import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Lead } from '../leads/entities/lead.entity';
import { Transaction } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, Transaction, Unit, Commission])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule { }
