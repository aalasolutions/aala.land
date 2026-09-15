import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { PropertyDocument } from '../properties/entities/property-document.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Asset } from '../properties/entities/asset.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { PropertiesModule } from '../properties/properties.module';
import { StoragePurgeModule } from '../storage-purge/storage-purge.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyDocument, Unit, Asset, User, Company]),
    PropertiesModule,
    StoragePurgeModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
