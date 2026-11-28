import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatSummary } from './entities/ai-chat-summary.entity';
import { AiChatSummaryService } from './ai-chat-summary.service';

// Channel-neutral AI state shared by every messaging channel.
@Module({
  imports: [TypeOrmModule.forFeature([AiChatSummary])],
  providers: [AiChatSummaryService],
  exports: [AiChatSummaryService],
})
export class AiModule {}
