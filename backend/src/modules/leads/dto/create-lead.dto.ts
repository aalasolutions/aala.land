import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
  LEAD_TEMPERATURE_VALUES,
} from '../../../shared/taxonomies';

export class CreateLeadDto {
  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiPropertyOptional({ example: 'Al-Rashid' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  whatsappNumber?: string;

  @ApiPropertyOptional({ enum: LEAD_STATUS_VALUES, default: 'NEW' })
  @IsIn(LEAD_STATUS_VALUES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ enum: LEAD_TEMPERATURE_VALUES, default: 'WARM' })
  @IsIn(LEAD_TEMPERATURE_VALUES)
  @IsOptional()
  temperature?: string;

  @ApiPropertyOptional({ enum: LEAD_SOURCE_VALUES, default: 'OTHER' })
  @IsIn(LEAD_SOURCE_VALUES)
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ example: 50, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  propertyInterest?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 100000 })
  @IsNumber()
  @IsOptional()
  budgetMin?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsNumber()
  @IsOptional()
  budgetMax?: number;

  @ApiPropertyOptional({ example: 'uuid-of-locality' })
  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-unit' })
  @IsUUID()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({
    example: 'dubai',
    description: 'Region code for multi-region filtering',
  })
  @IsString()
  @IsOptional()
  regionCode?: string;
}
