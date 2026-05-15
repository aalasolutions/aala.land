// backend/src/modules/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { BaileysService } from './baileys.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  controllers: [WhatsappController],
  providers: [BaileysService, MessageStoreService, WhatsappAiService, WhatsappGateway, WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
