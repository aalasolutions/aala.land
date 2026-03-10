import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAreaDto {
  @ApiPropertyOptional({ example: 'Downtown Dubai Updated' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Dubai, UAE' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;
}
