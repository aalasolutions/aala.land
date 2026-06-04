// backend/src/modules/whatsapp/dto/send-wa-message.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendWaMessageDto {
  @ApiProperty({ example: '971501234567@s.whatsapp.net' })
  @IsString() @IsNotEmpty()
  chatId: string;

  @ApiProperty({ example: 'Hello!' })
  @IsString() @IsNotEmpty()
  message: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  replyTo?: string;
}

export class SendWaMediaDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  chatId: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  filePath: string;

  @ApiProperty({ required: false, enum: ['image', 'video', 'audio', 'document'] })
  @IsOptional() @IsIn(['image', 'video', 'audio', 'document'])
  mediaType?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  caption?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  fileName?: string;
}

export class TypingDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  chatId: string;
}

export class AiToggleDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  enabled?: boolean;
}
