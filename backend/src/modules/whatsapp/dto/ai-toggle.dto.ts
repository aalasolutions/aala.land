// backend/src/modules/whatsapp/dto/ai-toggle.dto.ts
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AiToggleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
