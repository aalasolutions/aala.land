import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailTemplateCategory } from '../entities/email-template.entity';

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

  @ApiPropertyOptional({ enum: EmailTemplateCategory })
  @IsEnum(EmailTemplateCategory)
  @IsOptional()
  category?: EmailTemplateCategory;

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
