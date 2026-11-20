import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { AuditModule } from '../audit/audit.module';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';
import { ContactsImportService } from './contacts-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company, Contact]), AuditModule],
  controllers: [DataTransferController],
  providers: [DataTransferService, ContactsImportService],
  exports: [DataTransferService],
})
export class DataTransferModule {}
