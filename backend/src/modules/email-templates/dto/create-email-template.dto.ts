import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsIn,
  IsArray,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EMAIL_CATEGORY_VALUES } from '../../../shared/taxonomies';

export class CreateEmailTemplateDto {
  @ApiProperty({ example: 'Welcome New Tenant' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Welcome to {{propertyName}}, {{firstName}}!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject: string;

  @ApiProperty({
    example:
      '<h1>Welcome {{firstName}}</h1><p>Your lease for {{propertyName}} starts on {{startDate}}.</p>',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ enum: EMAIL_CATEGORY_VALUES, default: 'CUSTOM' })
  @IsIn(EMAIL_CATEGORY_VALUES)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: ['firstName', 'propertyName', 'startDate'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
