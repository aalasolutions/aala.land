import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertiesService } from './properties.service';
import { MediaService } from './media.service';
import { PropertiesController } from './properties.controller';
import { Asset } from './entities/asset.entity';
import { Unit } from './entities/unit.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { PropertyDocument } from './entities/property-document.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Company } from '../companies/entities/company.entity';
import { EmailModule } from '../email/email.module';
import { ContactsModule } from '../contacts/contacts.module';
import { StoragePurgeModule } from '../storage-purge/storage-purge.module';
import { RecordHistoryModule } from '../record-history/record-history.module';
import { AuditModule } from '../audit/audit.module';
import { UnitsExportService } from './transfer/units-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Asset,
      Unit,
      PropertyMedia,
      PropertyDocument,
      Contact,
      Company,
    ]),
    EmailModule,
    ContactsModule,
    StoragePurgeModule,
    RecordHistoryModule,
    RedisModule,
    AuditModule,
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService, MediaService, UnitsExportService],
  exports: [PropertiesService, MediaService],
})
export class PropertiesModule {}
