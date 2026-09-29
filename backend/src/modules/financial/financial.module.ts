import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialService } from './financial.service';
import { FinancialAnalyticsService } from './financial-analytics.service';
import { FinancialController } from './financial.controller';
import { Transaction } from './entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Company } from '../companies/entities/company.entity';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Unit, Company]),
    ContactsModule,
  ],
  controllers: [FinancialController],
  providers: [FinancialService, FinancialAnalyticsService],
  exports: [FinancialService, FinancialAnalyticsService],
})
export class FinancialModule {}
