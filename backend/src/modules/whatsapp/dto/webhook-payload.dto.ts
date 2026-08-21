import { IsString, IsNotEmpty } from 'class-validator';
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
}
