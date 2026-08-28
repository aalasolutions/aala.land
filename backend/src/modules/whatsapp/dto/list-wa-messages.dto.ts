// backend/src/modules/whatsapp/dto/list-wa-messages.dto.ts
import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListWaMessagesDto {
  @ApiProperty({ required: false, type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, type: Number, default: 500, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 500;

  // Injected by RegionScopeInterceptor. Unused here, but the global
  // ValidationPipe runs forbidNonWhitelisted and would reject it.
  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
