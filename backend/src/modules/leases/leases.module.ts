import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeasesService } from './leases.service';
import { LeasesController } from './leases.controller';
import { Lease } from './entities/lease.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lease])],
  controllers: [LeasesController],
  providers: [LeasesService],
  exports: [LeasesService],
})
export class LeasesModule {}
