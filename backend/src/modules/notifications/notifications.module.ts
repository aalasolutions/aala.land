import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { Notification } from './entities/notification.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WorkOrder } from '../maintenance/entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import { Lead } from '../leads/entities/lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Cheque, Lease, WorkOrder, User, Lead])],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
