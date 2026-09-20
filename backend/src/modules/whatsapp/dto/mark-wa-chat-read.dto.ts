// backend/src/modules/whatsapp/dto/mark-wa-chat-read.dto.ts
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class MarkWaChatReadDto {
  // Same rule as SendMessageDto.chatId.
  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9]\d{6,14}$/, {
    message: 'chatId must be E.164 digits with no plus sign',
  })
  chatId: string;

  // Same rule as the before cursor in ListWaChatMessagesDto.
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[\x21-\x7E]+$/, { message: 'messageId must be printable ASCII' })
  messageId: string;
}
