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

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Lead, Unit, Lease, WhatsappChat, Company]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
