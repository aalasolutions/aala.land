import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BaileysManagerService } from './baileys-manager.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSettingsController } from './whatsapp-settings.controller';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';
import { AiCreditUsage } from './entities/ai-credit-usage.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Unit } from '../properties/entities/unit.entity';
import { BillingHistory } from '../billing/entities/billing-history.entity';
import { EmailModule } from '../email/email.module';
import { BillingModule } from '../billing/billing.module';
import { WhatsappBillingListener } from './whatsapp-billing.listener';

@Module({
  imports: [
    EmailModule,
    BillingModule,
    TypeOrmModule.forFeature([
      WhatsappSettings,
      WhatsappAiConversation,
      AiCreditUsage,
      User,
      Company,
      Unit,
      BillingHistory,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [WhatsappController, WhatsappSettingsController],
  providers: [
    BaileysManagerService,
    MessageStoreService,
    WhatsappAiRepositoryService,
    WhatsappAiPromptBuilderService,
    WhatsappAiService,
    WhatsappGateway,
    WhatsappService,
    WhatsappBillingListener,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
