import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { Transaction } from './entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Company } from '../companies/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Unit, Company])],
  controllers: [FinancialController],
  providers: [FinancialService],
  exports: [FinancialService],
})
export class FinancialModule {}
