import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { PropertyDocument } from '../properties/entities/property-document.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyDocument, User, Company]),
    PropertiesModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
