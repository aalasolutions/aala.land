import { IsString, IsNotEmpty, IsOptional, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'Phone number in E.164 format', example: '+971501234567' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone number must be in E.164 format' })
  phoneNumber: string;

  @ApiProperty({ description: 'Message text content' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ description: 'Lead ID to associate this message with', required: false })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ description: 'Media URL for image/document messages', required: false })
  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
