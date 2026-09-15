import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { Company } from './entities/company.entity';
import { User } from '../users/entities/user.entity';
import { BillingModule } from '../billing/billing.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, User]),
    BillingModule,
    WhatsappModule,
    NotificationsModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
