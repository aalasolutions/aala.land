import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { MailService } from '../../shared/services/mail.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), EmailTemplatesModule],
  controllers: [UsersController],
  providers: [UsersService, MailService],
  exports: [UsersService],
})
export class UsersModule {}
