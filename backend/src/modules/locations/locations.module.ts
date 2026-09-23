import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { City } from './entities/city.entity';
import { Locality } from './entities/locality.entity';

@Module({
  imports: [TypeOrmModule.forFeature([City, Locality]), RedisModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
