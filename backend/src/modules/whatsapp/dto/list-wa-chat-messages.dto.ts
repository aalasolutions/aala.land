// backend/src/modules/whatsapp/dto/list-wa-chat-messages.dto.ts
import {
  IsOptional,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListWaChatMessagesDto {
  @ApiProperty({ required: false, type: Number, default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  // A message id (whatsapp_messages.wa_message_id, varchar 255) from a previous page.
  @ApiProperty({ required: false, type: String, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[\x21-\x7E]+$/)
  before?: string;

  // Same cursor rules as before; at most one of before, after, around.
  @ApiProperty({ required: false, type: String, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[\x21-\x7E]+$/)
  after?: string;

  @ApiProperty({ required: false, type: String, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[\x21-\x7E]+$/)
  around?: string;

  // Injected by RegionScopeInterceptor; see ListWaMessagesDto.
  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
