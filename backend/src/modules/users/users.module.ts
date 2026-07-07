import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { MailService } from '../../shared/services/mail.service';
import { BillingModule } from '../billing/billing.module';
import { UserReassignmentService } from './reassignment/user-reassignment.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Company]), EmailTemplatesModule, BillingModule],
  controllers: [UsersController],
  providers: [UsersService, MailService, UserReassignmentService],
  exports: [UsersService],
})
export class UsersModule {}
