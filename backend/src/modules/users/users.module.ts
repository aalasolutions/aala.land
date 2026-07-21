import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { EmailModule } from '../email/email.module';
import { BillingModule } from '../billing/billing.module';
import { UserReassignmentService } from './reassignment/user-reassignment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Company]),
    EmailModule,
    BillingModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserReassignmentService],
  exports: [UsersService],
})
export class UsersModule {}
