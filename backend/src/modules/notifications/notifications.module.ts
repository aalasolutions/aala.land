import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
  imports: [
    TypeOrmModule.forFeature([Notification, Cheque, Lease, WorkOrder, User, Lead]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
