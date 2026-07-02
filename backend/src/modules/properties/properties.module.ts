import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertiesService } from './properties.service';
import { MediaService } from './media.service';
import { PropertiesController } from './properties.controller';
import { PropertyArea } from './entities/property-area.entity';
import { Asset } from './entities/asset.entity';
import { Unit } from './entities/unit.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { PropertyDocument } from './entities/property-document.entity';
import { Owner } from '../owners/entities/owner.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PropertyArea,
      Asset,
      Unit,
      PropertyMedia,
      PropertyDocument,
      Owner,
    ]),
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService, MediaService],
  exports: [PropertiesService, MediaService],
})
export class PropertiesModule { }
