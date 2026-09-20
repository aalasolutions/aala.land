// backend/src/modules/whatsapp/dto/wa-chat-id-param.dto.ts
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WaChatIdParamDto {
  // Same rule as SendMessageDto.chatId.
  @ApiProperty({
    description: 'Customer number in E.164 digits, no plus sign',
    example: '971501234567',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9]\d{6,14}$/, {
    message: 'chatId must be E.164 digits with no plus sign',
  })
  chatId: string;
}
