import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { WorkOrder } from './entities/work-order.entity';
import { Unit } from '../properties/entities/unit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrder, Unit])],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
