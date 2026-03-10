import { IsString, IsNotEmpty, IsOptional, IsEnum, IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
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

  @ApiProperty({ description: 'Recipient email (for EMAIL channel)', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Recipient phone in E.164 format (for SMS channel)', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be E.164 format' })
  phone?: string;

  @ApiProperty({ description: 'Subject line (email only)', required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: 'Message body' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({ description: 'Lead ID to associate notification with', required: false })
  @IsOptional()
  @IsString()
  leadId?: string;
}
