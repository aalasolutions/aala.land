import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';
import { ContactsImportService } from './contacts-import.service';
import { UnitsImportService } from './units-import.service';
import {
  ENTITY_IMPORTERS,
  type EntityImporter,
  type EntityImporters,
} from './entity-importer';
import { TRANSFER_ENTITIES, TRANSFER_ENTITY_NAMES } from './transfer-entities';

// One importer per registry entry, keyed by the :entity route segment.
const entityImportersProvider = {
  provide: ENTITY_IMPORTERS,
  inject: TRANSFER_ENTITY_NAMES.map((name) => TRANSFER_ENTITIES[name].importer),
  useFactory: (...importers: EntityImporter[]): EntityImporters =>
    Object.fromEntries(
      TRANSFER_ENTITY_NAMES.map((name, index) => [name, importers[index]]),
    ),
};

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, Contact]),
    AuditModule,
    RedisModule,
  ],
  controllers: [DataTransferController],
  providers: [
    DataTransferService,
    ContactsImportService,
    UnitsImportService,
    entityImportersProvider,
  ],
  exports: [DataTransferService],
})
export class DataTransferModule {}
