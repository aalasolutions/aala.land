import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReminderRulesService } from './reminder-rules.service';
import { ReminderRulesController } from './reminder-rules.controller';
import { ReminderRule } from './entities/reminder-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReminderRule])],
  controllers: [ReminderRulesController],
  providers: [ReminderRulesService],
  exports: [ReminderRulesService],
})
export class ReminderRulesModule {}
