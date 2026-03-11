import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WorkOrder } from '../maintenance/entities/work-order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Cheque, Lease, WorkOrder])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
