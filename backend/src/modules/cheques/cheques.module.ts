import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChequesService } from './cheques.service';
import { ChequesController } from './cheques.controller';
import { Cheque } from './entities/cheque.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Company } from '../companies/entities/company.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { RecordHistoryModule } from '../record-history/record-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cheque, Unit, Lease, Company]),
    NotificationsModule,
    UsersModule,
    RecordHistoryModule,
  ],
  controllers: [ChequesController],
  providers: [ChequesService],
  exports: [ChequesService],
})
export class ChequesModule {}
