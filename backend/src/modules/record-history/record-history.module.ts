import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordHistoryController } from './record-history.controller';
import { RecordHistoryService } from './record-history.service';
import { RecordHistory } from './entities/record-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RecordHistory])],
  controllers: [RecordHistoryController],
  providers: [RecordHistoryService],
  exports: [RecordHistoryService],
})
export class RecordHistoryModule {}
