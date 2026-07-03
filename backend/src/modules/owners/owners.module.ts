import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';
import { Owner } from './entities/owner.entity';
import { Unit } from '../properties/entities/unit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Owner, Unit])],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [OwnersService],
})
export class OwnersModule {}
