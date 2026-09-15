import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationChannel {
  EMAIL = 'EMAIL',
}

export enum NotificationStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export class SendNotificationDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({
    description: 'Recipient email (for EMAIL channel)',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Subject line (email only)', required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: 'Message body' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'Lead ID to associate notification with',
    required: false,
  })
  @IsOptional()
  @IsString()
  leadId?: string;
}
