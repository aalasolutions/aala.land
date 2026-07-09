import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsArray,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EMAIL_CATEGORY_VALUES } from '../../../shared/taxonomies';

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional({ example: 'Updated Template Name' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated subject: {{firstName}}' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  subject?: string;

  @ApiPropertyOptional({ example: '<h1>Updated body</h1>' })
  @IsString()
  @IsOptional()
  body?: string;

  @ApiPropertyOptional({ enum: EMAIL_CATEGORY_VALUES })
  @IsIn(EMAIL_CATEGORY_VALUES)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: ['firstName', 'amount'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
