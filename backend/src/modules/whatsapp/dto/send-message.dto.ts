// backend/src/modules/whatsapp/dto/send-message.dto.ts
import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendMessageDto {
  // Meta's wa_id: E.164 digits with no plus sign, exactly how the webhook stores chat_id.
  @ApiProperty({
    description: 'Customer number in E.164 digits, no plus sign',
    example: '971501234567',
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9]\d{6,14}$/, {
    message: 'chatId must be E.164 digits with no plus sign',
  })
  chatId: string;

  @ApiProperty({ description: 'Message text', maxLength: 4096 })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body: string;
}
