import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { Contact } from './entities/contact.entity';
import { Company } from '../companies/entities/company.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WhatsappChat } from '../whatsapp/entities/whatsapp-chat.entity';
import { RecordHistoryModule } from '../record-history/record-history.module';
import { User } from '../users/entities/user.entity';
import { ContactAccessRequest } from '../contact-access-requests/entities/contact-access-request.entity';
import { ContactAccessRequestsModule } from '../contact-access-requests/contact-access-requests.module';
import { AuditModule } from '../audit/audit.module';
import { ContactPrivacyService } from './contact-privacy.service';
import { ContactAttachService } from './contact-attach.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contact,
      Lead,
      Unit,
      Lease,
      WhatsappChat,
      Company,
      User,
      ContactAccessRequest,
    ]),
    RecordHistoryModule,
    ContactAccessRequestsModule,
    AuditModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService, ContactPrivacyService, ContactAttachService],
  exports: [ContactsService, ContactPrivacyService, ContactAttachService],
})
export class ContactsModule {}
