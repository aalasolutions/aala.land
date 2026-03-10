import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookPayloadDto {
  @ApiProperty({ description: 'WhatsApp webhook object type' })
  @IsString()
  @IsNotEmpty()
  object: string;

  @ApiProperty({ description: 'Webhook entry array', type: 'array' })
  @IsObject({ each: true })
  entry: Record<string, unknown>[];
}

export class WebhookVerifyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  'hub.mode': string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  'hub.verify_token': string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  'hub.challenge': string;
}
