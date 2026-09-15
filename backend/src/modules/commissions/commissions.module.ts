import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionsService } from './commissions.service';
import { CommissionsController } from './commissions.controller';
import { Commission } from './entities/commission.entity';
import { Company } from '../companies/entities/company.entity';
import { RecordHistoryModule } from '../record-history/record-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Commission, Company]),
    RecordHistoryModule,
  ],
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
