import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactAccessRequest } from './entities/contact-access-request.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { ContactAccessRequestsService } from './contact-access-requests.service';
import { ContactAccessRequestsController } from './contact-access-requests.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecordHistoryModule } from '../record-history/record-history.module';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactAccessRequest, Contact]),
    NotificationsModule,
    RecordHistoryModule,
    AuditModule,
    RedisModule,
  ],
  controllers: [ContactAccessRequestsController],
  providers: [ContactAccessRequestsService],
  exports: [ContactAccessRequestsService],
})
export class ContactAccessRequestsModule {}
