import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BaileysManagerService } from './baileys-manager.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappContextService } from './whatsapp-context.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSettingsController } from './whatsapp-settings.controller';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { Company } from '../companies/entities/company.entity';
import { Listing } from '../properties/entities/listing.entity';
import { Unit } from '../properties/entities/unit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappSettings, Company, Listing, Unit]),
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
    WhatsappAiService,
    WhatsappContextService,
    WhatsappGateway,
    WhatsappService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
