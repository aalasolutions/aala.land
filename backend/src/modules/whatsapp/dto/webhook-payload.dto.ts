import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  // Meta sends each param twice, dotted and underscored; extras are 400'd by forbidNonWhitelisted.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hub_mode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hub_verify_token?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hub_challenge?: string;
}
