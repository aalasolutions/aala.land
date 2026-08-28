import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChequesService } from './cheques.service';
import { ChequesController } from './cheques.controller';
import { Cheque } from './entities/cheque.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Company } from '../companies/entities/company.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cheque, Unit, Company]),
    NotificationsModule,
    UsersModule,
  ],
  controllers: [ChequesController],
  providers: [ChequesService],
  exports: [ChequesService],
})
export class ChequesModule {}
