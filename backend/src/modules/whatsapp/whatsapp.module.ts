import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WhatsappSettingsController } from './whatsapp-settings.controller';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { AiCreditUsage } from './entities/ai-credit-usage.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Unit } from '../properties/entities/unit.entity';
import { BillingHistory } from '../billing/entities/billing-history.entity';
import { EmailModule } from '../email/email.module';
import { BillingModule } from '../billing/billing.module';
import { RedisModule } from '../redis/redis.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { RecordHistoryModule } from '../record-history/record-history.module';
import { WhatsappBillingListener } from './whatsapp-billing.listener';
import { AiConversationRetentionCron } from './ai-conversation-retention.cron';
import { WhatsappAiDebounceProcessor } from './whatsapp-ai-debounce.processor';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsappSignupService } from './whatsapp-signup.service';
import { WhatsappWebhookProcessor } from './whatsapp-webhook.processor';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WhatsappMediaIngestService } from './whatsapp-media-ingest.service';
import { WhatsappMediaProcessor } from './whatsapp-media.processor';
import { StoragePurgeModule } from '../storage-purge/storage-purge.module';
import {
  WA_AI_DEBOUNCE_QUEUE,
  WA_MEDIA_QUEUE,
  WA_WEBHOOK_EVENTS_QUEUE,
} from './wa-types';

@Module({
  imports: [
    EmailModule,
    BillingModule,
    RedisModule,
    EncryptionModule,
    RecordHistoryModule,
    StoragePurgeModule,
    BullModule.registerQueue({
      name: WA_AI_DEBOUNCE_QUEUE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        // Failures stay inspectable but bounded: 7 days or the last 1000, whichever hits first.
        removeOnFail: { age: 604800, count: 1000 },
      },
    }),
    BullModule.registerQueue({
      name: WA_WEBHOOK_EVENTS_QUEUE,
      defaultJobOptions: {
        // Safe to retry: the wamid dedupe and the ranked status update are both idempotent.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { age: 604800, count: 1000 },
      },
    }),
    BullModule.registerQueue({
      name: WA_MEDIA_QUEUE,
      defaultJobOptions: {
        // Each attempt fetches a fresh Meta URL; five fit well inside the 7-day media id life.
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: { age: 604800, count: 1000 },
      },
    }),
    TypeOrmModule.forFeature([
      WhatsappSettings,
      WhatsappAiConversation,
      WhatsappMessage,
      WhatsappChat,
      WhatsappConnection,
      AiCreditUsage,
      User,
      Company,
      Unit,
      BillingHistory,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    WhatsappController,
    WhatsappSettingsController,
    WhatsappWebhookController,
  ],
  providers: [
    MessageStoreService,
    WhatsappWebhookService,
    WhatsappCloudApiService,
    WhatsappAiRepositoryService,
    WhatsappAiPromptBuilderService,
    WhatsappAiService,
    WhatsappGateway,
    WhatsappService,
    WhatsappSignupService,
    WhatsappBillingListener,
    AiConversationRetentionCron,
    WhatsappAiDebounceProcessor,
    WhatsappWebhookProcessor,
    WhatsappMediaService,
    WhatsappMediaIngestService,
    WhatsappMediaProcessor,
  ],
  exports: [
    WhatsappService,
    WhatsappSignupService,
    MessageStoreService,
    WhatsappGateway,
    WhatsappMediaService,
  ],
})
export class WhatsappModule {}
