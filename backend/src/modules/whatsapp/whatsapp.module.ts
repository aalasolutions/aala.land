import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaileysManagerService } from './baileys-manager.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSettingsController } from './whatsapp-settings.controller';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappSettings])],
  controllers: [WhatsappController, WhatsappSettingsController],
  providers: [
    BaileysManagerService,
    MessageStoreService,
    WhatsappAiService,
    WhatsappGateway,
    WhatsappService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
