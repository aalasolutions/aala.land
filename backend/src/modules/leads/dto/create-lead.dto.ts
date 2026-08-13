import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LeadStatus,
  LeadTemperature,
  LeadSource,
} from '../entities/lead.entity';

// Identity lives on the contact, not the lead. A lead is created against either
// an existing contact (contactId) or inline details that resolve/create a
// contact (one number resolves to one contact within the company).
export class CreateLeadDto {
  @ApiPropertyOptional({ example: 'uuid-of-contact' })
  @IsUUID()
  @IsOptional()
  contactId?: string;

  // Inline contact details, used only when contactId is absent.
  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

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

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isWhatsapp?: boolean;

  @ApiPropertyOptional({ enum: LeadStatus, default: LeadStatus.NEW })
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadTemperature, default: LeadTemperature.WARM })
  @IsEnum(LeadTemperature)
  @IsOptional()
  temperature?: LeadTemperature;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.OTHER })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

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

  @ApiPropertyOptional({ example: 'uuid-of-city' })
  @IsUUID()
  @IsOptional()
  cityId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-locality' })
  @IsUUID()
  @IsOptional()
  localityId?: string;

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
